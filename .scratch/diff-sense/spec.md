# diff-sense v1 Spec

Status: ready-for-agent

## Problem Statement

开发者在代码审查中需要快速发现潜在缺陷，但人工审查耗时且容易遗漏。现有的 AI 代码审查工具（如 alibaba/open-code-review）功能全面但过于庞大复杂，对于想要一个轻量、可嵌入、可扩展的审查工具的开发者来说门槛太高。同时，开发者需要一个能在 CLI 本地使用、被其他 AI Agent 调用、在 CI/CD 中自动运行的统一工具。

## Solution

diff-sense 是一个轻量级的 AI 驱动代码审查 CLI 工具，用 TypeScript 编写，基于 Vercel AI SDK。它采用"确定性工程 × Agent 混合"架构：确定性层处理文件过滤、规则匹配、行号锚定等硬逻辑，Agent 层通过 LLM 工具调用循环完成实际审查。

它提供三种集成方式：
1. **CLI**：开发者在终端直接运行 `diff-sense review`
2. **Skill**：其他 AI Agent 通过 skill 文件调用，获得结构化 Markdown 审查摘要。源文件位于本仓库 `skills/`，经 skills.sh 分发，使用者安装到 `.agents/`、`.claude/` 等目录
3. **GitHub Action**：作为 Composite Action 集成到 CI/CD，自动在 PR 上发布行内评论

## User Stories

1. As a developer, I want to run `diff-sense review` in my terminal to review my uncommitted changes, so that I can catch issues before committing
2. As a developer, I want to run `diff-sense review --commit <sha>` to review a specific commit, so that I can audit individual changes
3. As a developer, I want to run `diff-sense review --from main --to feature` to review a branch range, so that I can review all changes in a feature branch
4. As a developer, I want to see review findings with severity levels (high/medium/low) in my terminal, so that I can prioritize which issues to fix first
5. As a developer, I want review findings to include suggested fix code, so that I can quickly apply corrections
6. As a developer, I want to pass `--background "this PR refactors the payment module"` to provide context, so that the reviewer understands the intent behind the changes
7. As a developer, I want to run `diff-sense review --format json` to get structured output, so that I can pipe it to other tools
8. As a developer, I want to run `diff-sense review --format text` to get human-readable output, so that I can read findings easily in the terminal
9. As a developer, I want to run `diff-sense review --audience agent` to suppress progress output, so that the tool works cleanly when called by other agents
10. As a developer, I want to run `diff-sense config` without arguments to get an interactive setup wizard, so that I can configure my LLM provider on first use
11. As a developer, I want to run `diff-sense config set provider anthropic` to configure non-interactively, so that I can script the setup
12. As a developer, I want to set `DIFF_SENSE_PROVIDER` and `DIFF_SENSE_MODEL` environment variables, so that the tool works in CI without a config file
13. As a developer, I want environment variables to override config file values, so that CI environments can override local settings
14. As a developer, I want to use any LLM provider supported by AI SDK (Anthropic, OpenAI, etc.), so that I'm not locked into one vendor
15. As a developer, I want diff-sense to automatically skip binary files, sensitive paths (.env), and non-code files, so that tokens aren't wasted on unreviable content
16. As a developer, I want to configure exclude patterns in `.diff-sense/rules.json`, so that I can skip project-specific paths (generated code, vendor, etc.)
17. As a developer, I want diff-sense to have built-in review rules per language (TypeScript, Python, Go, Java, Rust, etc.), so that reviews are language-aware out of the box
18. As a developer, I want to override the built-in rules with a project-level `.diff-sense/rules.json`, so that I can customize the review focus for my project
19. As a developer, I want related files (handler + service + test) to be grouped and reviewed together, so that the reviewer can catch cross-file inconsistencies
20. As a developer, I want review findings to be anchored to specific code lines, so that I can jump to the exact location in my editor
21. As a developer, I want `diff-sense version` to show the current version, so that I can check what's installed
22. As an AI agent developer, I want to install the diff-sense skill via skills.sh (into `.agents/`, `.claude/`, etc.), so that my agent can call it for code review
23. As an AI agent, I want the skill to return a Markdown summary with findings categorized by severity (High/Medium/Low), so that I can present them to the user or act on them
24. As an AI agent, I want the skill to handle installation and configuration checks, so that I don't have to implement that logic myself
25. As a CI/CD engineer, I want to add `uses: <owner>/diff-sense@v1` to my GitHub Actions workflow, so that PRs are automatically reviewed
26. As a CI/CD engineer, I want the Action to post inline review comments on the exact code lines, so that authors see feedback in context
27. As a CI/CD engineer, I want unanchored findings to appear in a summary comment on the PR, so that nothing is lost
28. As a CI/CD engineer, I want to configure the Action's LLM credentials via GitHub Secrets, so that API keys aren't exposed
29. As a CI/CD engineer, I want to configure review effort/concurrency via Action inputs, so that I can balance cost and thoroughness
30. As a developer, I want the review agent to be able to read full file contents via a file_read tool, so that it has enough context to make accurate judgments
31. As a developer, I want the review agent to be able to search the codebase via a code_search tool, so that it can check references and usages
32. As a developer, I want the review to run multiple file groups concurrently, so that large changesets are reviewed faster
33. As a developer, I want to install diff-sense via `npm install -g diff-sense` or `npx diff-sense`, so that installation is standard for the Node ecosystem

## Implementation Decisions

### Architecture: Deterministic × Agent Hybrid

The system is split into two layers:

- **Deterministic layer**: diff parsing, file filtering (4 gates: binary → sensitive paths → user exclude → extension whitelist), rule matching (glob-based, first-match-wins), semantic grouping dispatch, line number anchoring (3-step: hunk new-side → full file scan → line=0), and output formatting. These are pure functions with predictable behavior.
- **Agent layer**: per-group LLM tool-calling loops via AI SDK's `ToolLoopAgent`. Each group gets its own agent instance running independently. The agent has 4 tools: `code_comment`, `file_read`, `code_search`, and `task_done`.

### Tech Stack

- **Language**: TypeScript (ESM)
- **Package manager**: pnpm
- **LLM framework**: Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.)
- **CLI framework**: Commander.js
- **Terminal interaction**: @clack/prompts (interactive wizard + spinner)
- **Terminal colors**: picocolors
- **Build tool**: tsup (single-file bundle)
- **Test framework**: Vitest
- **Concurrency**: `p-limit` for parallel group review (default concurrency: 4)
- **npm package**: `diff-sense` (unscoped)

### CLI Commands

- `diff-sense review` — core review command with flags:
  - `--from <ref> --to <ref>` (range mode)
  - `--commit <sha>` (commit mode)
  - (no flags = workspace mode: staged + unstaged + untracked)
  - `--format text|json` (default: text)
  - `--audience human|agent` (default: human; agent suppresses progress)
  - `--background <text>` (business context injected into review prompt)
  - `--concurrency <n>` (default: 4)
  - `--exclude <patterns>` (additional exclude globs)
- `diff-sense config` — interactive wizard when no args; `config set <key> <value>` / `config get <key>` for non-interactive
- `diff-sense version` — print version

### Configuration System

Two sources, env vars take priority:

1. **Environment variables**: `DIFF_SENSE_PROVIDER`, `DIFF_SENSE_MODEL`, `DIFF_SENSE_API_KEY`, etc. Primary for CI.
2. **Config file**: `~/.diff-sense/config.json`. Primary for local dev. Managed via `diff-sense config`.

### Multi-Provider LLM Support

Use AI SDK's `createProviderRegistry` to create a unified registry. Users configure `provider` + `model` strings (e.g., `anthropic` + `claude-sonnet-4-5`). At runtime, the registry resolves `provider:model` to an AI SDK language model instance.

### Agent Loop (per review group)

Each semantic group is reviewed by a `ToolLoopAgent` instance:

- **Stop conditions**: `hasToolCall('task_done')` (normal completion) + `isStepCount(30)` (safety cap), combined as an array in `stopWhen`
- **Progress**: `agent.generate()` (non-streaming) + lifecycle callbacks (`onStepStart`, `onToolExecutionStart`, `onToolExecutionEnd`, `onStepEnd`). In human mode callbacks print progress; in agent mode they're silent.
- **Concurrency**: all groups dispatched via `Promise.all` with `p-limit` throttling.

### Agent Tools (4 tools)

- **`code_comment`**: posts a review finding. Input schema:
  - `severity`: enum `high | medium | low` (required)
  - `content`: string — the finding description (required)
  - `existing_code`: string — code snippet for line anchoring (required)
  - `suggestion_code`: string — suggested fix (optional)
  - `category`: enum `bug | security | performance | maintainability | style | other` (required)
  - `path`: string — file path override (optional, defaults to current review file)
  - The tool accepts individual comments (not batched arrays) to keep the schema simple. Multiple findings require multiple tool calls.
  - Has an `execute` function that collects comments into an accumulator.

- **`file_read`**: reads file content from the repository. Uses `contextSchema` to receive repo root path. Returns file content string.

- **`code_search`**: searches the codebase via `git grep`. Input: `query` (string), optional `file_pattern` (glob). Returns matching lines with file paths and line numbers.

- **`task_done`**: signals review completion. No `execute` function — calling it terminates the loop via AI SDK's built-in mechanism. Input schema carries `summary` (string) for logging.

### Prompt Templates (2 templates)

Following OCR's proven patterns:

1. **Grouping Prompt** (system + user):
   - Input: file metadata only — `[index] STATUS path (+insertions/-deletions)` per line
   - Output: JSON array `[{label, files}]`
   - Triggered when file count ≥ 4; below threshold, files are bundled into one group
   - Max 10 files per group; fallback to single-file groups on parse failure

2. **Review Prompt** (system + user):
   - System message: role definition, capabilities, strict focus rules (only comment on files in `<review_files>`, use tools for context, avoid commenting on deleted/unchanged code)
   - User message with XML structure:
     - `<review_files>` containing `<file path="...">` wrapped unified diffs
     - `<other_changed_files>` listing files outside the current group
     - `<user_task>` block with: requirement background, review checklist (language-specific rule), and instructions
   - Rule injection: matched rule text injected under "Review Checklist" heading; multi-language groups use `<rules for="paths">` XML tags

### Rule System (2 layers)

- **Built-in defaults**: glob-to-rule mapping, first-match-wins, case-insensitive path matching. Language rules for: TypeScript/JavaScript, Python, Go, Java, Rust, Dockerfile, GitHub Actions YAML, generic YAML, plus a default fallback. Rules follow OCR's pattern: precision-over-recall preamble, categorized defect patterns, "do not report" clauses.
- **Project override**: `.diff-sense/rules.json` with `include`/`exclude` globs and custom `rules` array (`[{ "pattern": "<glob>", "rule": "<text>" }]`). Project rules are matched before built-in defaults (first-match-wins across the combined list), so they override built-ins for matching files.

### Line Number Anchoring (3 steps)

The `existing_code` field from `code_comment` is matched to precise line numbers:

1. **Hunk new-side match**: sliding window search through the diff hunk's added lines (whitespace-insensitive)
2. **Full file scan**: if hunk match fails, scan the entire post-change file
3. **Fallback**: if no match, set `line=0` (unanchored — these go into the summary comment, not inline)

### Output Formats

- **Text**: human-readable format with severity badges, file paths, line numbers, finding content, and suggested fixes. Grouped by file.
- **JSON**: structured array of finding objects with fields: `path`, `line`, `endLine`, `severity`, `category`, `content`, `existingCode`, `suggestionCode`. Suitable for machine consumption.

### GitHub Action (Composite Action)

- `action.yml` at repository root defines the Action
- Inputs: `provider`, `model`, `api_key` (from secrets), `from_ref`, `to_ref`, `concurrency`, `background`
- The action: installs Node.js, runs `npx diff-sense review --from ... --to ... --format json --audience agent`, parses JSON output, posts PR review comments via GitHub API
- Inline comments for anchored findings (using the Pull Request Review API)
- Summary comment for unanchored findings (`line=0`) aggregated as a Markdown list
- Uses `${{ github.token }}` for PR API access

### Skill Integration

- `skills/diff-sense.md` (source in this repo, distributed via skills.sh; users install it into `.agents/`, `.claude/`, etc.) containing instructions for AI agents:
  1. Check if `diff-sense` CLI is installed (install via `npm install -g diff-sense` if not)
  2. Check if LLM is configured
  3. Extract business context from the current task
  4. Run `diff-sense review --format json --audience agent --background "..."`
  5. Parse JSON output, classify findings by severity
  6. Render Markdown summary with High / Medium / Low sections
- Skill output is Markdown, not raw JSON — optimized for LLM consumption

### Project Structure (single package)

```
src/
├── index.ts            # CLI 入口（Commander.js 注册）
├── review.ts           # 核心审查编排（测试接缝）
├── types.ts            # 共享类型（Finding, DiffEntry, Rule, Group, Config）
├── commands/           # CLI 命令处理器
│   ├── review.ts
│   ├── config.ts
│   └── version.ts
├── config.ts           # 配置加载（env + file）+ 提供商注册表
├── diff.ts             # Diff 解析（workspace / commit / range）
├── filter.ts           # 文件过滤器（4 道门）
├── glob.ts             # glob 转正则（过滤与规则共用）
├── project-config.ts   # .diff-sense/rules.json 读取与校验
├── grouping.ts         # 语义分组（LLM 调用）
├── anchor.ts           # 行号锚定（3 步）
├── rules/              # 规则系统
│   ├── matcher.ts      # glob 匹配 + 规则解析
│   └── builtin.ts      # 内置规则定义
├── agent/              # Agent 层
│   ├── loop.ts         # ToolLoopAgent 配置 + 执行
│   ├── tools.ts        # 工具定义（code_comment / file_read / code_search / task_done）
│   └── prompts.ts      # grouping + review prompt 模板
└── output/             # 输出格式化
    ├── text.ts         # text 格式
    └── json.ts         # JSON 格式
```

Skill source lives at the repo root in `skills/` (outside `src/`, not bundled by tsup).

Tests co-located with source: `*.test.ts` alongside the module they test.

## Testing Decisions

### Testing Philosophy

Tests verify **external behavior at the `review` function boundary**, not internal implementation details. A good test: given these diff inputs and this configuration, the deterministic layer produces this output. For the agent layer: given these mock LLM responses, the loop dispatches these tool calls and collects these comments.

### What Gets Tested

**Deterministic layer** (unit tests, no mocks needed):
- **Diff parsing**: given raw `git diff` output, produces correct structured diff objects for all three modes
- **File filtering**: given a list of diff entries, the 4-gate pipeline correctly includes/excludes files (binary detection, sensitive paths, user excludes, extension whitelist)
- **Rule matching**: given file paths, the glob matcher resolves the correct language rule; first-match-wins ordering is respected; multi-rule groups produce XML-tagged output
- **Line anchoring**: given `existing_code` and a diff hunk, the 3-step algorithm resolves correct line numbers; whitespace insensitivity works; fallback to `line=0` works
- **Output formatting**: given structured findings, text formatter produces expected output; JSON formatter produces valid parseable JSON with correct schema

**Agent layer** (mock LLM tests):
- **Tool call dispatch**: given a mock LLM that returns `code_comment` tool calls, the agent correctly collects findings
- **Termination**: given a mock LLM that calls `task_done`, the loop terminates; given one that never terminates, `isStepCount` cap stops it
- **Grouping**: given file metadata, the grouping prompt produces a valid group assignment; fallback to single-file groups on bad JSON works

### Prior Art

This is a greenfield project — no existing tests. The test patterns will be established by v1. Vitest is the test runner, using standard `describe`/`it`/`expect` patterns.

## Out of Scope

- **Plan phase**: OCR's pre-review planning step (skipped — adds latency without proportional benefit for v1)
- **Multi-round review**: OCR's effort-based 1-3 round review (skipped — v1 uses single round)
- **Memory compression**: OCR's token budget management with conversation compression (skipped — modern context windows are large enough)
- **Review filter**: OCR's post-hoc LLM fact-checking of findings (skipped — extra LLM call cost)
- **RE_LOCATION_TASK**: OCR's LLM-based re-anchoring for failed matches (skipped — fallback to line=0 is sufficient)
- **SARIF output**: GitHub Code Scanning integration format (skipped — adds complexity, low resume value)
- **Session persistence / Viewer**: OCR's JSONL session recording and web viewer (skipped — too complex for v1)
- **Telemetry**: OpenTelemetry integration (skipped — not needed for v1)
- **MCP support**: Acting as MCP client or server (skipped — skill integration is sufficient)
- **Delegation mode**: OCR's mode where host agent provides its own LLM (skipped — beyond scope)
- **GitLab CI integration**: Only GitHub Actions in v1
- **Interactive TUI review**: Real-time display of review process (lifecycle callbacks provide sufficient progress)
- **Auto-fix**: Automatically applying suggested fixes (the tool provides `suggestion_code` but does not apply it)
- **`diff-sense rules` command**: Debug command for previewing matched rules (users can inspect config files directly)

## Further Notes

- **Reference project**: alibaba/open-code-review (OCR). Research documents in `docs/research/` provide detailed analysis of OCR's prompt templates, built-in rules, and architecture. diff-sense follows OCR's core patterns (deterministic × agent hybrid, XML-wrapped diffs, language-specific rule checklists, metadata-only grouping) while simplifying (single round, no plan phase, no memory compression, no review filter).
- **AI SDK version**: The spec assumes AI SDK's `ToolLoopAgent` API with `stopWhen` conditions. If the API changes, the agent loop module is the only affected area.
- **Built-in rule content**: The OCR built-in rules research (`docs/research/ocr-builtin-rules.md`) includes complete proposed rule text for all target languages. These should be used as starting points during implementation.
- **Severity levels**: We use 3 levels (high/medium/low) instead of OCR's 4 (critical/high/medium/low) for simplicity. The category set is also simplified from OCR's 8 to 6 (bug/security/performance/maintainability/style/other).
- **code_comment design choice**: Unlike OCR's batch array interface, diff-sense uses individual tool calls per comment. This simplifies the tool schema and aligns better with AI SDK's tool-calling patterns. The trade-off is slightly more tool call overhead, which is acceptable for v1's scope.
