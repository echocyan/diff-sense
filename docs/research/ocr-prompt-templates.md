# OCR Prompt Template System Research

> Research date: 2026-09-21
> Subject: alibaba/open-code-review prompt template architecture
> Purpose: Inform diff-sense prompt system design

---

## 1. GROUPING_TASK Prompt Template

The GROUPING_TASK is a two-message conversation (system + user) that asks the LLM to cluster changed files into semantically related groups for co-review. It operates on file **metadata only** (paths, status, line counts) -- never diff content.

### System Message

Source: `internal/config/template/prompts/grouping_task_system.md`

```
You are a file grouping assistant for code review. Group changed files into
semantically related clusters that should be reviewed together.

Files in the same group typically:
- Belong to the same module/feature
- Have producer/consumer relationships (e.g. interface and implementation)
- Are i18n/config variants of the same resource (e.g. message_en.properties
  and message_zh.properties)
- Share the same directory and work together on a single concern

Each file in the list is prefixed with a zero-based index in brackets, e.g.
`[0] MODIFIED   path/to/file (+12/-3)`. Refer to files by that integer index,
never by path.

Rules:
- Every file index must appear in exactly one group.
- A group may contain 1 file if it is unrelated to others.
- Maximum 10 files per group.
- The "files" field of each group is an array of the integer indices shown
  in brackets.
- Output ONLY a JSON array, no other text.
```

### User Message

Source: `internal/config/template/prompts/grouping_task_user.md`

```
Group the following changed files:

{{file_list}}

Respond with a JSON array, where "files" holds the integer indices shown in
brackets beside each file:
[{"label": "short theme description", "files": [0, 1]}]
```

### Input Format

The `{{file_list}}` placeholder is populated by `buildFileList()` in `internal/agent/grouping.go`. Each file is rendered as:

```
[0] MODIFIED   path/to/file.go (+12/-3)
[1] ADDED      path/to/new_file.ts (+45/-0)
[2] DELETED    path/to/old_file.py (+0/-30)
[3] RENAMED    path/to/renamed.rs (+5/-2)
```

The format is: `[index] STATUS   path (+insertions/-deletions)`

Status values (from `formatDiffEntry()` in `internal/agent/agent.go`):
- `MODIFIED` (default)
- `ADDED` (`d.IsNew`)
- `DELETED` (`d.IsDeleted`)
- `RENAMED` (`d.IsRenamed`)

### Output Format (Expected JSON Schema)

```json
[
  {"label": "short theme description", "files": [0, 1]},
  {"label": "another theme", "files": [2, 3]}
]
```

The Go struct that deserializes this (`groupingResponse` in `grouping.go`):

```go
type groupingResponse struct {
    Label string `json:"label"`
    Files []int  `json:"files"`
}
```

### Key Constraints Enforced in Code

From `internal/agent/grouping.go`:
- Maximum 10 files per group (`maxFilesPerGroup = 10`), enforced post-parse by `enforceMaxFilesPerGroup()`
- Duplicate indices are skipped (file assigned to first group only)
- Out-of-range indices are silently dropped
- Unassigned files get their own single-file group as fallback
- Token budget enforcement splits oversize groups into single-file groups
- Parse failures fall back to per-file dispatch (one file per group)

### When Grouping Is Triggered

From `Template.GroupingPlan()` in `template.go`:
- `GroupingViaLLM`: when `fileCount >= GroupingMinFiles` (default: 4)
- `GroupingBundleAll`: when file count is below threshold AND total churn < `GroupingBundleLineThreshold` (default: 200)
- `GroupingPerFile`: when file count is below threshold AND total churn >= threshold

---

## 2. MAIN_TASK Prompt Template

The MAIN_TASK is the core review prompt. It is a two-message conversation (system + user) that drives the tool-use review loop.

### System Message

Source: `internal/config/template/prompts/main_task_system.md`

```markdown
## Role
You are a code review assistant. You are responsible for producing professional
review feedback on pull requests before they are merged. The diffs show what
changed; use context tools to read or search related code when needed.
Please keep your responses concise and objective.

## Capabilities
- Think step by step progressively.
- First understand the code changes to be reviewed. Code changes are provided
  in Unified Diff format, where lines starting with `-` indicate deleted code,
  lines starting with `+` indicate added code, consecutive `-` and `+` lines
  represent modified code, and other lines represent unchanged code.
- Be objective and neutral, make judgments based on facts and logic, avoid
  subjective assumptions. When the context is unclear, use tools to obtain
  contextual information rather than judging based on assumptions.
- For the current code changes, provide feedback opinions, pointing out areas
  for improvement or potential issues. Focus on issues in newly added code.
- Avoid commenting on correct code or unchanged code.
- Avoid commenting on deleted code; deleted code serves only as reference context.
- Focus on clarity, practicality, and comprehensiveness.
- Use developer-friendly terminology and analogies in explanations.
- Focus primarily on the actual code logic and functionality. Avoid commenting
  on or providing feedback about non-functional elements such as code comments,
  tool-generated indicators (like @Generated annotations), or other metadata,
  unless the user explicitly requests you to review these elements.

## Strict Focus Rules
- Review every file listed in <review_files> individually.
- Cross-file observations within <review_files> are encouraged -- look for
  inconsistencies, missing updates, and broken contracts across related files.
- Context tools are for gathering background information only. Your comments
  must address code within <review_files> -- never produce comments targeting
  files outside it.

## Reply limit
- Before calling `task_done`, confirm you have given every `<file>` in
  <review_files> its own pass. Reviewing an implementation file does not cover
  its header, interface, or configuration counterpart -- a file being the
  smaller or secondary member of the group is not a reason to skip it.
- If the current code review task is complete, call `task_done` to end the task.
- If a code issue has been identified and confirmed, call the `code_comment`
  tool to provide feedback.
- If additional context is needed to confirm the issue, call the appropriate
  context tool.
```

### User Message

Source: `internal/config/template/prompts/main_task_user.md`

```
Other files changed in this update (not in this review group):
<other_changed_files>
{{change_files}}
</other_changed_files>

<review_files>
{{diffs}}
</review_files>

Current time in the real world: {{current_system_date_time}}

<user_task>
### Requirement Background (Optional)
{{requirement_background}}

### Review Checklist
{{system_rule}}

### Review Plan
{{plan_guidance}}

### Previously Confirmed Findings
{{confirmed_comments}}

Now please review the code changes in <review_files> above.
</user_task>
```

### Diff Formatting (XML Tags)

Diffs are wrapped in XML elements. The `buildConcatenatedDiffs()` function in `internal/agent/agent.go` produces:

```xml
<file path="path/to/file1.go">
--- a/path/to/file1.go
+++ b/path/to/file1.go
@@ -10,5 +10,7 @@ func example() {
     existing code
-    old line
+    new line
+    another new line
     more context
</file>

<file path="path/to/file2.ts">
...diff content...
</file>
```

Each file's diff is wrapped in `<file path="...">...</file>` tags. The diff content itself is standard unified diff format. The entire set is placed inside `<review_files>...</review_files>` in the user message.

### Other Changed Files Format

The `{{change_files}}` placeholder contains files from the same changeset that are NOT in the current review group. Format (from `buildChangeFilesExceptGroup()`):

```
MODIFIED   src/other/file.go (+5/-3)
ADDED      src/other/new.ts (+20/-0)
```

This uses the same `formatDiffEntry()` as the grouping task but without index prefixes.

### How System Rules Are Injected

The `{{system_rule}}` placeholder is filled by `resolveGroupSystemRule()` from `internal/agent/agent.go`:

1. For each file in the group, the rules resolver (from `internal/config/rules/`) matches the file path against glob patterns in `system_rules.json`
2. **Single rule set** (all files match the same rule): rule text is injected bare
3. **Multiple rule sets** (files match different rules): each rule block is tagged with XML:

```xml
<rules for="path/to/file1.go, path/to/file2.go">
...Go-specific review checklist...
</rules>
<rules for="path/to/config.yaml">
...YAML-specific review checklist...
</rules>
```

The rules themselves are language-specific review checklists stored in `internal/config/rules/rule_docs/*.md`. For example, the default rule (`default.md`) covers:

```
#### Correctness
Is the logic correct? Are there missing boundary conditions?
Are exceptions handled properly?
Is it thread-safe in concurrent scenarios?

#### Security
Are there security vulnerabilities such as SQL injection or XSS?
Is sensitive information handled correctly?
Is permission validation complete?

#### Performance
Are there obvious performance issues (e.g., N+1 queries, unnecessary loops)?
Are resources properly released?

#### Maintainability
Is the code clear and easy to understand?
Do names accurately express intent?
Does it follow the project's existing code style and architecture patterns?

#### Test Coverage
Do critical logic paths have corresponding test cases?
Do test cases cover boundary conditions?
```

Language-specific rules (e.g., `ts_js_tsx_jsx.md`) are much more detailed, covering language-specific anti-patterns, framework best practices (React hooks rules, async handling), security checks (XSS, eval), etc.

### How Tool Usage Is Communicated

Tools are NOT described in the prompt text itself. Instead, they are passed as structured tool definitions via the LLM API's native tool-use mechanism. The tool definitions come from `internal/config/toolsconfig/tools.json`.

**Exception**: In the PLAN_TASK, tools are rendered as human-readable text (since the plan phase is text-only, no tool execution). The `{{plan_tools}}` placeholder is filled by `formatToolDefs()` which renders:

```
### Available Tools (reference only -- do not call)
- **file_read**: Use this tool to read file content when you need to get context...
  Parameters:
  - file_path: The relative path of the file to open. (required)
  - start_line: The start line number to view.
  - end_line: The end line number to view.
- **code_search**: Use this tool to search for specific text...
  ...
```

### Quality Constraints on Reviews

Key instructions that shape review quality:

1. **Focus on new code**: "Focus on issues in newly added code"
2. **No comments on correct code**: "Avoid commenting on correct code or unchanged code"
3. **No comments on deleted code**: "Avoid commenting on deleted code; deleted code serves only as reference context"
4. **No metadata comments**: "Avoid commenting on or providing feedback about non-functional elements such as code comments, tool-generated indicators"
5. **Evidence-based**: "Be objective and neutral...avoid subjective assumptions. When the context is unclear, use tools"
6. **Scope enforcement**: "Your comments must address code within <review_files> -- never produce comments targeting files outside it"
7. **Complete coverage**: "Before calling `task_done`, confirm you have given every `<file>` in <review_files> its own pass"
8. **Language injection**: `ApplyLanguage()` appends `"\n\nAlways respond in {language}."` to the system message

### Multi-Round Review

The MAIN_TASK supports multiple review rounds (1-3 based on `--effort`):
- Round 1: Normal review with `{{plan_guidance}}` and empty `{{confirmed_comments}}`
- Round 2+: `{{plan_guidance}}` is stripped (via `stripEmptyPlanBlock`), `{{confirmed_comments}}` contains findings from previous rounds

---

## 3. The Placeholder System

All templates use `{{double_brace}}` placeholders that are substituted via `strings.ReplaceAll()` in Go code. The one exception is `RE_LOCATION_TASK`, which uses single braces `{diff}`, `{existing_code}`, `{suggestion_content}` for diff-specific substitution.

### Complete Placeholder Reference

| Placeholder | Used In | Filled By | Content |
|---|---|---|---|
| `{{file_list}}` | GROUPING_TASK user | `buildFileList()` in `grouping.go` | Indexed file list: `[0] STATUS   path (+N/-M)` per line |
| `{{diffs}}` | MAIN_TASK user, PLAN_TASK user | `buildConcatenatedDiffs()` in `agent.go` | XML-wrapped unified diffs: `<file path="...">...diff...</file>` |
| `{{change_files}}` | MAIN_TASK user, PLAN_TASK user | `buildChangeFilesExceptGroup()` in `agent.go` | List of other changed files (not in review group): `STATUS   path (+N/-M)` per line |
| `{{system_rule}}` | MAIN_TASK user, PLAN_TASK user | `resolveGroupSystemRule()` in `agent.go` | Language-specific review checklist from `rule_docs/*.md`, optionally XML-tagged per file |
| `{{current_system_date_time}}` | MAIN_TASK user, PLAN_TASK user | `a.currentDate` | Current timestamp string |
| `{{requirement_background}}` | MAIN_TASK user, PLAN_TASK user | `a.args.Background` | User-provided PR description or requirement context |
| `{{plan_guidance}}` | MAIN_TASK user | Plan phase LLM output | Structured review plan from PLAN_TASK (empty on round 2+) |
| `{{confirmed_comments}}` | MAIN_TASK user | Previous round findings | Confirmed review findings from prior rounds (empty on round 1) |
| `{{plan_tools}}` | PLAN_TASK system | `formatToolDefs()` in `agent.go` | Human-readable tool descriptions (reference only) |
| `{diff}` | RE_LOCATION_TASK user | Direct substitution | Single file's unified diff (single braces, not double) |
| `{existing_code}` | RE_LOCATION_TASK user | Direct substitution | Original code snippet that failed to match |
| `{suggestion_content}` | RE_LOCATION_TASK user | Direct substitution | Review comment text |
| `{{diff}}` | REVIEW_FILTER_TASK user | Direct substitution | XML-wrapped diffs for the group being filtered |
| `{{comments}}` | REVIEW_FILTER_TASK user | Direct substitution | JSON or structured representation of comments to fact-check |

### Substitution Mechanism

From `buildMainTaskMessages()` in `agent.go` (lines ~1297-1318):

```go
func (a *Agent) buildMainTaskMessages(rule, changeFiles, diffs, planResult, confirmed string) []llm.Message {
    rawMsgs := a.args.Template.MainTask.Messages
    messages := make([]llm.Message, 0, len(rawMsgs))
    for _, m := range rawMsgs {
        content := m.Content
        content = strings.ReplaceAll(content, "{{current_system_date_time}}", a.currentDate)
        content = strings.ReplaceAll(content, "{{system_rule}}", rule)
        content = strings.ReplaceAll(content, "{{change_files}}", changeFiles)
        content = strings.ReplaceAll(content, "{{diffs}}", diffs)
        content = strings.ReplaceAll(content, "{{requirement_background}}", a.args.Background)
        // ...plan_guidance and confirmed_comments with empty-block stripping
        messages = append(messages, llm.NewTextMessage(m.Role, content))
    }
    return messages
}
```

Empty placeholder blocks are stripped rather than left as empty sections. When `planResult == ""`, `stripEmptyPlanBlock()` removes the entire "### Review Plan" section. Same for `confirmed == ""` with `stripEmptyConfirmedBlock()`.

---

## 4. code_comment Tool: Field Constraints and Usage Instructions

### Tool Definition

Source: `internal/config/toolsconfig/tools.json`

The `code_comment` tool accepts a `comments` array (batch interface). Each comment object has:

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | Yes | Brief description of code issue and corresponding suggestion |
| `existing_code` | string | Yes | Code snippet to anchor the comment position. Must be newly added code lines from the diff, matching diff format exactly |
| `suggestion_code` | string | No | Suggested fix code snippet |
| `category` | enum | Yes | One of: `bug`, `security`, `performance`, `maintainability`, `test`, `style`, `documentation`, `other` |
| `severity` | enum | Yes | One of: `critical`, `high`, `medium`, `low` |
| `path` | string | Yes | Relative file path this comment applies to |

### Full Tool Description (from tools.json)

```
When you discover that a code change could introduce code issue, please use
this tool to report the issue. The tool will pinpoint your feedback to the
precise code line (or block) in the current file by inserting a code comment.

**Core Mechanism:**
This tool uses a dynamic sliding window algorithm to match corresponding
consecutive lines in diff text based on your provided 'existing_code'
parameter. Therefore, you must ensure the provided 'existing_code' actually
exists in the diff text with exactly matching format. It should contain one
or several consecutive lines of code most relevant to your comment.
```

### existing_code Field Constraints

The `existing_code` description specifies:

```
Code snippet used to locate comment position. Only return newly added code
lines, should not include deleted code or unchanged code lines. Maintain
consistent style with diff code for IDE recognition and mounting in current
file.
```

Key rules:
1. **Only newly added code** (`+` lines from the diff, without the `+` prefix)
2. **Must not include deleted or unchanged lines**
3. **Must match the diff text exactly** (the tool uses a sliding window algorithm to find matching consecutive lines)
4. **Consistent style with diff code** (for IDE mounting)

### Severity Guidance

Severity values are defined in the tool schema as an enum: `critical`, `high`, `medium`, `low`.

The PLAN_TASK provides explicit severity definitions:
- `high`: May cause security vulnerabilities, data loss, system crashes, or critical functional failures
- `medium`: May affect performance, maintainability, or involve potential edge-case problems
- `low`: Code style, readability, or non-critical best practice suggestions

### Category Guidance

Categories: `bug`, `security`, `performance`, `maintainability`, `test`, `style`, `documentation`, `other`

These align with the system rule structure (correctness -> bug, security -> security, performance -> performance, maintainability -> maintainability).

### Hidden Fields

From the tools documentation, there is also a `thinking` field:
- `thinking`: Model reasoning (runtime-only, **not advertised to the model** in the tool schema)

This is captured internally for debugging but is not part of the tool definition the LLM sees.

### Batching

The tool accepts an array of comments (`comments` field), enabling the LLM to submit multiple findings in a single tool call rather than one at a time. Each comment in the array is independently anchored via its own `existing_code` and `path`.

### Comment Post-Processing Pipeline

After the LLM generates comments via `code_comment`, they pass through:

1. **Line resolution**: Matching `existing_code` snippets to diff hunk line numbers via sliding window
2. **Re-anchoring** (optional, via RE_LOCATION_TASK): For failed matches, the LLM is asked to extract the correct code snippet
3. **Review filtering** (optional, via REVIEW_FILTER_TASK): A separate LLM call fact-checks comments against the diff, removing only those provably incorrect
4. **Final line resolution**: Re-resolving line numbers across the full comment set

---

## 5. Additional Prompt Templates

### PLAN_TASK

Source: `internal/config/template/prompts/plan_task_system.md`, `plan_task_user.md`

A pre-review planning phase that produces a structured review checklist. Triggered when files exceed churn thresholds (50 lines for single file, 100 for group). The plan phase has **no tool execution** -- tool descriptions are embedded as text via `{{plan_tools}}`.

Output format is strictly plain text (no markdown headings, no code fences):
```
Summary: (brief description of changes)

Issues

1. [high|medium|low] (problem description)
   -> (tool name) (arguments) -- (purpose)
2. [severity] (...)
```

### REVIEW_FILTER_TASK

Source: `internal/config/template/prompts/review_filter_task_system.md`, `review_filter_task_user.md`

A post-review fact-checking pass. Removes only comments that the diff **proves** to be factually wrong. Has two grounds for removal:
- **Ground A**: Comment targets code not in the subject file's diff
- **Ground B**: A specific diff line literally contradicts the comment's central claim

Has **protected subjects** that are never removed regardless: memory safety, concurrency, linkage consistency, behavioral changes, unused parameters.

### MEMORY_COMPRESSION_TASK

Source: `internal/config/template/prompts/memory_compression_task_system.md`

Compresses conversation history into structured summaries across 5 dimensions: Identified Code Issues, Tool Call Conclusions, Completed Tasks, Pending Tasks, Current Focus. Triggers at 60% (async) or 80% (sync) of token budget.

### RE_LOCATION_TASK

Source: `internal/config/template/prompts/re_location_task_system.md`, `re_location_task_user.md`

Re-anchors failed `existing_code` matches. Uses single-brace `{diff}`, `{existing_code}`, `{suggestion_content}` placeholders (not double-brace). Outputs only a fenced code block with the correct snippet.

---

## 6. Architecture Summary

### Template Loading Pipeline

1. `task_template.json` is the manifest -- maps task names to prompt file references
2. Prompt files live in `internal/config/template/prompts/*.md` (embedded via Go `//go:embed`)
3. `LoadDefault()` in `template.go` reads the manifest, resolves all `prompt_file` references to content
4. Language injection appends to system messages via `ApplyLanguage()`
5. Effort presets override `MaxReviewRounds` via `ApplyEffort()`
6. At runtime, `buildMainTaskMessages()` performs `{{placeholder}}` substitution

### Tool Loading Pipeline

1. `tools.json` in `internal/config/toolsconfig/` defines all 6 tools with their schemas
2. Each tool has `plan_task` and `main_task` boolean flags for phase filtering
3. Plan phase tools: `file_read_diff`, `file_find`, `code_search` (read-only)
4. Main phase tools: `task_done`, `code_comment`, `file_read`, `file_read_diff`, `file_find`, `code_search`
5. Custom tool configs can be loaded via `--tools` flag

### Review Pipeline Flow

```
Diffs -> Filter -> Group (GROUPING_TASK) -> Per-group:
  -> Plan (PLAN_TASK, optional)
  -> Main Loop (MAIN_TASK, 1-3 rounds)
     -> Tool calls (code_comment, file_read, code_search, etc.)
     -> Memory compression (MEMORY_COMPRESSION_TASK, if needed)
  -> Review Filter (REVIEW_FILTER_TASK, optional)
  -> Re-location (RE_LOCATION_TASK, for failed matches)
  -> Line resolution
```

### Key Design Decisions

1. **Metadata-only grouping**: GROUPING_TASK sees only file paths and line counts, never diff content -- keeps the grouping call cheap
2. **Index-based grouping**: Files referenced by integer index, not path -- saves output tokens and prevents truncation
3. **XML-wrapped diffs**: `<file path="...">` tags provide clear file boundaries for multi-file review
4. **Batched comments**: `code_comment` accepts arrays, reducing tool-call overhead
5. **Post-hoc fact-checking**: REVIEW_FILTER_TASK removes provably wrong comments rather than trying to prevent them
6. **Sliding window matching**: `existing_code` is matched against diff text using a dynamic algorithm, not line numbers
7. **Language-aware rules**: Rules resolve per file extension, with 50+ language-specific checklists
8. **Progressive effort**: 1-3 review rounds based on `--effort`, with confirmed findings carried forward
9. **Customizable templates**: Users can override via `--tools` flag and `.opencodereview/rule.json`

---

## Sources

### Primary Sources (OCR Repository)

| File | URL |
|---|---|
| `task_template.json` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/task_template.json |
| `template.go` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/template.go |
| `effort.go` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/effort.go |
| `grouping_task_system.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/grouping_task_system.md |
| `grouping_task_user.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/grouping_task_user.md |
| `main_task_system.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/main_task_system.md |
| `main_task_user.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/main_task_user.md |
| `plan_task_system.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/plan_task_system.md |
| `plan_task_user.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/plan_task_user.md |
| `memory_compression_task_system.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/memory_compression_task_system.md |
| `review_filter_task_system.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/review_filter_task_system.md |
| `review_filter_task_user.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/review_filter_task_user.md |
| `re_location_task_system.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/re_location_task_system.md |
| `re_location_task_user.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/re_location_task_user.md |
| `agent.go` | https://github.com/alibaba/open-code-review/blob/main/internal/agent/agent.go |
| `grouping.go` | https://github.com/alibaba/open-code-review/blob/main/internal/agent/grouping.go |
| `tools.json` | https://github.com/alibaba/open-code-review/blob/main/internal/config/toolsconfig/tools.json |
| `toolsconfig.go` | https://github.com/alibaba/open-code-review/blob/main/internal/config/toolsconfig/toolsconfig.go |
| `definitions.go` | https://github.com/alibaba/open-code-review/blob/main/internal/tool/definitions.go |
| `code_comment.go` | https://github.com/alibaba/open-code-review/blob/main/internal/tool/code_comment.go |
| `system_rules.json` | https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/system_rules.json |
| `system_rules.go` | https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/system_rules.go |
| `rule_docs/default.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/rule_docs/default.md |
| `rule_docs/ts_js_tsx_jsx.md` | https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/rule_docs/ts_js_tsx_jsx.md |

### Documentation Sources

| Document | URL |
|---|---|
| Architecture doc | https://raw.githubusercontent.com/alibaba/open-code-review/main/pages/src/content/docs/en/architecture.md |
| Tools doc | https://raw.githubusercontent.com/alibaba/open-code-review/main/pages/src/content/docs/en/tools.md |
| DeepWiki overview | https://deepwiki.com/alibaba/open-code-review |
