# OCR Built-in Rules Analysis

> Research for: `.scratch/diff-sense/issues/03-ocr-builtin-rules.md`
> Date: 2026-09-21
> Primary sources: alibaba/open-code-review repository (source code + official docs)

---

## 1. Languages and File Types Covered

OCR's built-in rules are defined in `internal/config/rules/system_rules.json`, which maps glob patterns to rule document files stored in `internal/config/rules/rule_docs/`. There are **48 pattern-to-rule mappings** plus a **default fallback rule**, covering **52 rule doc files** in total.

### Complete Pattern-to-Rule Map

| Glob Pattern | Rule Doc | Category |
|---|---|---|
| `**/*.properties` | `properties.md` | Config (i18n) |
| `**/*{mapper,dao}*.xml` | `mapper_dao_xml.md` | MyBatis SQL mappers |
| `**/pom.xml` | `pom_xml.md` | Maven dependencies |
| `**/build.gradle` | `build_gradle.md` | Gradle dependencies |
| `**/package.json` | `package_json.md` | NPM dependencies |
| `**/Cargo.toml` | `cargo_toml.md` | Rust dependencies |
| `**/composer.json` | `composer_json.md` | PHP dependencies |
| `**/*.{json,json5}` | `json.md` | JSON files |
| `.github/workflows/**/*.{yaml,yml}` | `github_workflows.md` | GitHub Actions |
| `.github/**/*.{yaml,yml}` | `github_config.md` | GitHub config |
| `**/*.{yaml,yml}` | `yaml.md` | Generic YAML |
| `**/*.java` | `java.md` | Java |
| `**/*.go` | `go.md` | Go |
| `**/*.{ftl,ftlh,ftlx}` | `freemarker.md` | FreeMarker templates |
| `**/*.{hbs,mustache}` | `handlebars_mustache.md` | Handlebars/Mustache |
| `**/*.pug` | `pug.md` | Pug templates |
| `**/*.ets` | `arkts.md` | ArkTS (HarmonyOS) |
| `**/*.astro` | `astro.md` | Astro framework |
| `**/*.{ts,js,tsx,jsx,mjs,cjs}` | `ts_js_tsx_jsx.md` | TypeScript/JavaScript |
| `**/*.{kt,kts}` | `kotlin.md` | Kotlin |
| `**/*.rs` | `rust.md` | Rust |
| `**/*.{cpp,cc,cxx,hpp,hxx}` | `cpp.md` | C++ |
| `**/*.c` | `c.md` | C |
| `**/*.{py,pyi,ipynb}` | `python.md` | Python |
| `**/*.{php,phtml}` | `php.md` | PHP |
| `**/*.proto` | `protobuf.md` | Protobuf |
| `**/*.po` | `po.md` | Gettext translations |
| `**/*.pot` | `pot.md` | Gettext templates |
| `**/*.{graphql,gql}` | `graphql.md` | GraphQL |
| `**/*.prisma` | `prisma.md` | Prisma schema |
| `**/*.jl` | `julia.md` | Julia |
| `**/*.R` | `r.md` | R |
| `**/*.{tf,hcl,tfvars}` | `terraform.md` | Terraform/HCL |
| `**/*.bicep` | `bicep.md` | Azure Bicep |
| `**/*.nix` | `nix.md` | Nix |
| `**/*.{hs,lhs}` | `haskell.md` | Haskell |
| `**/*.{nim,nims,nimble}` | `nim.md` | Nim |
| `**/*.swift` | `swift.md` | Swift |
| `**/*.elm` | `elm.md` | Elm |
| `**/*.{jsonnet,libsonnet}` | `jsonnet.md` | Jsonnet |
| `**/*.zig` | `zig.md` | Zig |
| `**/*.thrift` | `thrift.md` | Thrift IDL |
| `**/*.capnp` | `capnp.md` | Cap'n Proto |
| `**/*.{ml,mli}` | `ocaml.md` | OCaml |
| `**/*.{re,rei}` | `ocaml.md` | ReasonML (shared) |
| `**/*.{v,sv,vh}` | `verilog.md` | Verilog/SystemVerilog |
| `**/*.{vhd,vhdl}` | `vhdl.md` | VHDL |
| `**/*.m` | `matlab.md` | MATLAB (with .m sniffing) |
| `**/*.mm` | `objc.md` | Objective-C++ |
| `**/*.sol` | `solidity.md` | Solidity |
| `**/*.vy` | `vyper.md` | Vyper |
| `**/*.rego` | `rego.md` | Rego (OPA) |
| _(fallback)_ | `default.md` | Generic |

Special case: `.m` files use content sniffing -- if the first non-blank line contains `#import` or `@implementation`, the file is treated as Objective-C (`objc.md`); otherwise MATLAB (`matlab.md`).

> Source: [`system_rules.json`](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/system_rules.json), [`system_rules.go` sniffer logic](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/sniffer.go)

---

## 2. What a Typical Rule Looks Like

Rules are **language-specific, detailed checklists** -- not generic instructions. They tell the LLM exactly what categories of issues to look for in that language, with concrete examples of anti-patterns and guidance on when NOT to flag something (to reduce false positives).

### Structure of a Language Rule

Each rule doc follows a consistent structure with:

1. **Precision preamble** (common across languages): "Favor precision over recall: only raise an issue when you are confident it is a real defect..."
2. **Categorized sections** with bullet points for specific defect patterns
3. **"Do not report" clauses** to suppress false positives
4. **Tool usage guidance** (e.g., "confirm by using `file_read`" or "use `code_search` to verify")

### Example: TypeScript/JavaScript Rule (ts_js_tsx_jsx.md)

Categories covered:
- **Typos and Spelling** -- misspelled variable/function/component names, strings in log/error messages
- **Dead Code** -- unreachable code, unused variables, commented-out blocks
- **Code Quality** -- no `var`, strict equality, minimize `any`, null checks before destructuring, no nested ternaries, extract duplicated logic
- **React Standards** -- hooks at top level, correct `useEffect` dependencies, no inline styles (except dynamic), no nested component declarations
- **Async Code** -- prefer async/await, handle errors with user-friendly messages, `Promise.all` for independent operations
- **Security** -- escape user input (XSS), no `innerHTML` with untrusted data, no `eval()`/`Function()`, protect API keys

### Example: Go Rule (go.md)

Categories covered (very detailed, ~500 lines):
- **Errors, Panics, API Contracts** -- ignored errors, error wrapping with `%w` vs `%v`, panic in request paths, deferred cleanup overwriting errors
- **Nil, Interfaces, Value Semantics** -- typed nil in interface, nil map writes, copying sync.Mutex, value receiver mutations
- **Context, Goroutines, Cancellation** -- context.Background misuse, context in struct, goroutine leaks, fire-and-forget goroutines
- **Channels, Locks, Shared State** -- unsynchronized map access, holding mutex across blocking I/O, RLock mutation
- **Timers, Tickers, Resource Lifecycle** -- timer leaks (with Go version awareness), defer in loops, sql.Rows cleanup
- **Collections, Slices, Numeric Boundaries** -- slice aliasing, integer overflow, off-by-one
- **Security** -- SQL injection, path traversal, SSRF, secrets in logs, math/rand for security
- **Tests** -- only suggest tests for concrete failure modes; do not duplicate linter findings

### Example: Python Rule (python.md)

Categories covered:
- **Mutable Default Arguments** -- `def f(x=[])` shared state bug, closures capturing loop variables
- **Boundary/Edge-Case Handling** -- empty inputs, off-by-one, None propagation, float equality, dict missing key
- **Error Handling** -- bare `except:`, silent `pass`, lost traceback, `assert` for runtime validation
- **Identity vs Equality** -- `is` vs `==` for literals, `None` comparison style
- **Resource Management** -- `with` statement for files/sockets/locks, generators holding resources open
- **Performance** -- string `+=` in loops, `list` vs `set` for membership, eager f-string in logging
- **Concurrency** -- GIL awareness, check-then-act races, blocking in async def
- **Security** -- `eval`/`exec`, `subprocess` with `shell=True`, `pickle` on untrusted data, SQL concatenation

### Example: Default Rule (default.md)

The fallback is a **short, generic checklist** (~15 lines):
- Correctness: logic, boundary conditions, exception handling, thread safety
- Security: SQL injection, XSS, sensitive info handling, permission validation
- Performance: N+1 queries, unnecessary loops, resource release
- Maintainability: clarity, naming, code style consistency
- Test coverage: critical paths, boundary conditions

> Source: [`rule_docs/ts_js_tsx_jsx.md`](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/rule_docs/ts_js_tsx_jsx.md), [`rule_docs/go.md`](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/rule_docs/go.md), [`rule_docs/python.md`](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/rule_docs/python.md), [`rule_docs/default.md`](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/rule_docs/default.md)

---

## 3. Rule Matching Mechanism

### Pattern Syntax

OCR uses [`bmatcuk/doublestar/v4`](https://github.com/bmatcuk/doublestar) for glob matching with these features:
- `*` -- matches any characters except `/`
- `**` -- matches across directory boundaries
- `{a,b,c}` -- brace expansion (OCR implements this manually via `expandBraces()`)
- `?` -- single character
- `[abc]` -- character classes

### Matching Algorithm

1. File path is **lowercased** before matching (case-insensitive)
2. `system_rules.json` is a JSON object with `path_rule_map` whose **key order is preserved** (custom `UnmarshalJSON` using streaming decoder)
3. Patterns are evaluated in **declaration order**; **first match wins**
4. Each pattern's brace expansions are tried individually
5. If no pattern matches, the `default_rule` (default.md) is used

### Order Matters

Since first-match wins, more specific patterns must appear before general ones. For example:
- `.github/workflows/**/*.{yaml,yml}` (GitHub Actions) comes before `**/*.{yaml,yml}` (generic YAML)
- `**/pom.xml` comes before the (non-existent) generic XML pattern

### Multi-Rule Groups

When a file group contains files matching different rules, `resolveGroupSystemRule()` in `agent.go`:
- Groups files by their resolved rule text
- If all files share the same rule: injects bare rule text
- If files have different rules: wraps each in XML tags like `<rules for="path1, path2">rule text</rules>`

> Source: [`system_rules.go`](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/system_rules.go) -- `resolveDetail()`, `expandBraces()`, `UnmarshalJSON()`; [`agent.go`](https://github.com/alibaba/open-code-review/blob/main/internal/agent/agent.go) -- `resolveGroupSystemRule()`

---

## 4. Rule Length and Detail

Rules vary dramatically by language:

| Rule Doc | Approximate Length | Style |
|---|---|---|
| `yaml.md` | ~1 line | One-liner: "Check for spelling errors in yaml-keys" |
| `default.md` | ~15 lines | Short generic checklist |
| `ts_js_tsx_jsx.md` | ~50-80 lines | Categorized checklist with examples |
| `java.md` | ~100-150 lines | Detailed with thread safety, NPE, N+1 queries |
| `python.md` | ~200+ lines | Very detailed with false-positive suppression |
| `go.md` | ~500+ lines | Extremely detailed, version-aware (Go 1.22/1.23), with tool usage guidance |
| `rust.md` | ~150+ lines | Detailed ownership/lifetime/async/unsafe sections |
| `github_workflows.md` | ~50-80 lines | Security, correctness, reliability, best practices |

The trend: **mainstream languages get longer, more specific rules**. Config files and data formats get shorter rules. The Go rule is notably the longest and most detailed, likely because OCR itself is written in Go.

> Source: Direct inspection of rule_docs files in the repository

---

## 5. How `{{system_rule}}` Gets Injected into the Prompt

### Template Structure

OCR uses two prompt templates that contain `{{system_rule}}`:

**`main_task_user.md`** (the main review prompt):
```
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

**`plan_task_user.md`** (the planning phase prompt):
```
### Review Checklist
{{system_rule}}

### Task
Please analyze the code changes above and output a structured review plan.
```

### Injection Flow

1. **At startup**: `LoadDefault()` reads `system_rules.json`, then reads each referenced `.md` file from the embedded filesystem and replaces the filename with its full text content
2. **Per file group**: `resolveGroupSystemRule()` calls `Resolve(path)` for each file in the group, collecting and deduplicating rule text
3. **Template rendering**: `strings.ReplaceAll(content, "{{system_rule}}", rule)` performs the substitution in both `executeGroupPlanPhase` and `buildMainTaskMessages`

### Priority Resolution

The composed resolver checks layers in order:
1. Custom rule (`--rule` flag) -- first match wins
2. Project rule (`.opencodereview/rule.json`) -- first match wins
3. Global rule (`~/.opencodereview/rule.json`) -- first match wins
4. System rule (embedded defaults) -- first match wins, then default fallback

A `merge_system_rule: true` option on project/global rules appends the system rule under headers:
```
## System-Specific Rules (Mandatory)
{system rule text}
---
## User-Specific Rules (Mandatory)
{user rule text}
```

> Source: [`system_rules.go`](https://github.com/alibaba/open-code-review/blob/main/internal/config/rules/system_rules.go) -- `LoadDefault()`, `Resolve()`, `mergeWithSystemRule()`; [`agent.go`](https://github.com/alibaba/open-code-review/blob/main/internal/agent/agent.go) -- `resolveGroupSystemRule()`, `buildMainTaskMessages()`; [`main_task_user.md`](https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/main_task_user.md), [`plan_task_user.md`](https://github.com/alibaba/open-code-review/blob/main/internal/config/template/prompts/plan_task_user.md)

---

## 6. Recommended Built-in Rules for diff-sense v1

Based on the OCR analysis, here are proposed built-in rules for diff-sense. They follow OCR's proven pattern: **language-specific checklists with false-positive suppression**, but condensed to a practical size (~20-40 lines each) suitable for a lightweight tool.

### Design Principles (from OCR)

1. **Precision over recall**: Always include the preamble about confidence and false positives
2. **Categorized sections**: Group by defect type (correctness, security, performance, etc.)
3. **"Do not report" clauses**: Critical for reducing noise
4. **Language-specific risks**: Focus on what linters/compilers cannot catch
5. **Actionable**: Each bullet should describe a concrete defect pattern, not a vague aspiration

### Glob Matching Strategy

```json
{
  "default_rule": "default",
  "rules": {
    "**/*.{ts,tsx,js,jsx,mjs,cjs}": "typescript",
    "**/*.{py,pyi}": "python",
    "**/*.go": "go",
    "**/*.java": "java",
    "**/*.rs": "rust",
    "**/Dockerfile*": "dockerfile",
    "**/.dockerignore": "dockerfile",
    ".github/workflows/**/*.{yaml,yml}": "github-actions",
    "**/*.{yaml,yml}": "yaml"
  }
}
```

Note: More specific patterns (`.github/workflows/`) must come before generic ones (`**/*.yaml`) since first-match wins.

### Proposed Rules

#### default (fallback for unmatched files)

```
Review the changed code for:
- Correctness: logic errors, missed boundary conditions, unhandled exceptions
- Security: injection vulnerabilities, exposed secrets, missing input validation
- Performance: obviously inefficient patterns (N+1 queries, unnecessary allocations in loops)
- Naming: typos in identifiers or user-facing strings

Only flag issues you are confident are real defects. Do not flag style preferences.
```

#### typescript (TypeScript/JavaScript)

```
Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Correctness
- Null/undefined access: property access or destructuring without checking for null/undefined when the value can legitimately be absent
- Type safety: use of `any` without justification; type assertions (`as`) that hide real type mismatches
- Async errors: unhandled promise rejections; missing `await` on async calls whose result or error matters
- React hooks (if applicable): hooks called conditionally or in loops; missing or incorrect dependency arrays in useEffect/useMemo/useCallback
- Logic errors: incorrect conditions, unreachable code after return/throw, off-by-one in array access

#### Security
- XSS: `dangerouslySetInnerHTML` or `innerHTML` with untrusted data
- Eval: `eval()`, `Function()` constructor, or `new Function()` with dynamic input
- Secrets: API keys, tokens, or credentials hardcoded in source

#### Do Not Report
- Style preferences already enforced by ESLint/Prettier (formatting, import order, semicolons)
- Unused imports or variables (handled by TypeScript compiler and linters)
```

#### python

```
Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Correctness
- Mutable default arguments: `def f(x=[])` or `def f(x={})`; the default is shared across calls
- None propagation: `None` reaching code that assumes a value (indexing, attribute access) without a guard
- Boundary errors: `xs[0]` or `max(xs)` without handling empty input; off-by-one in slicing
- Float equality: comparing floats with `==` instead of `math.isclose`

#### Error Handling
- Bare `except:` that swallows KeyboardInterrupt/SystemExit; prefer `except Exception` or narrower
- Silent `except: pass` without logging or re-raising
- Lost traceback: `raise NewError()` instead of `raise NewError() from err`

#### Resource Management
- Files, connections, or locks opened without a `with` statement

#### Security
- `eval`/`exec` on untrusted input
- `subprocess` with `shell=True` and unsanitized input
- `pickle`/`yaml.load` (without SafeLoader) on untrusted data
- SQL built by string concatenation instead of parameterized queries

#### Do Not Report
- Style issues enforced by Black/Ruff/flake8 (formatting, import order, line length)
- Unused imports in `.pyi` stub files
- Type annotation preferences
```

#### go

```
Favor precision over recall: only flag issues you are confident are real defects. Do not duplicate findings that go vet, staticcheck, or the compiler catch reliably.

#### Error Handling
- Errors returned from calls that are ignored or silently converted to default values
- Error wrapping with `%v` when callers need `errors.Is`/`errors.As` (use `%w`)
- `panic`/`log.Fatal`/`os.Exit` in request handlers, workers, or library code where a recoverable error can be returned

#### Nil Safety
- Nil maps written to; nil channels used unintentionally (block forever)
- Typed nil pointer in interface treated as absent (interface is non-nil)

#### Concurrency
- Unsynchronized reads/writes to maps, slices, or struct fields from multiple goroutines
- Holding a mutex across blocking I/O, channel ops, or network calls
- Goroutines that can outlive their owner with no shutdown mechanism
- `context.Background()` used where the caller's context should be propagated

#### Resource Lifecycle
- `http.Response.Body`, `sql.Rows`, files, or transactions not closed on all paths
- `defer` inside a loop that delays cleanup until function return

#### Security
- SQL, shell commands, or URLs assembled from untrusted input without parameterization
- Secrets or credentials logged or embedded in source
- `math/rand` used for security-sensitive tokens (use `crypto/rand`)

#### Do Not Report
- Style issues enforced by gofmt or linters
- Local variables in methods (inherently thread-safe)
- Read-only access to shared immutable data
```

#### java

```
Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Correctness
- NullPointerException risks: method calls on values that can be null without null checks; confirm via call chain
- Missing break in switch cases causing unintended fall-through (without a comment indicating intent)
- Logic errors: incorrect conditions, unreachable code, off-by-one in loop bounds

#### Thread Safety (only when evidence of concurrent use exists)
- Check-then-act patterns on shared state without synchronization
- Non-atomic compound operations on shared state (e.g., `map.get()` then `map.put()`)
- Concurrent writes to non-thread-safe collections (ArrayList, HashMap) in multi-threaded context

#### Performance (confirm data scale before flagging)
- Database queries inside loops (N+1 query pattern)
- Processing large datasets without pagination
- O(n^2) or worse algorithms where a more efficient solution exists

#### Security
- SQL injection via string concatenation instead of prepared statements
- Secrets, tokens, or credentials hardcoded or logged
- Untrusted input used in file paths without validation (path traversal)

#### Do Not Report
- Style issues (formatting, naming conventions, import ordering)
- Local method variables (inherently thread-safe)
- Immutable objects or properly synchronized code
```

#### rust

```
Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Ownership and Lifetimes
- Unnecessary `clone()` calls that mask ownership design issues
- Interior mutability (`RefCell`, `Cell`) misuse: runtime panics from overlapping borrows
- Reference cycles without `Weak` pointers that cause memory leaks

#### Error Handling
- `unwrap()` or `expect()` in library code or recoverable scenarios where `?` or proper error handling is appropriate
- Error context lost by converting to String early; prefer wrapping with context (anyhow/thiserror)

#### Unsafe Code
- `unsafe` blocks without documented safety invariants
- Raw pointer operations without clear validity, alignment, and lifetime guarantees

#### Concurrency
- Holding `Mutex`/`RwLock` guards across `.await` points
- Spawned tasks whose `JoinHandle` is dropped without observing the result
- Blocking operations inside `async fn` without `spawn_blocking`

#### Security
- Untrusted input used in file paths, URLs, or shell commands without validation
- Integer conversions that can overflow or truncate
- Secrets logged or embedded in source

#### Do Not Report
- Clippy lints (the compiler and clippy handle style and common mistakes)
- Lifetime annotations that the compiler already enforces
```

#### dockerfile

```
Review the changed Dockerfile for:

#### Security
- Running as root when a non-root USER could be used
- Using `latest` tag for base images instead of a pinned version/digest
- Secrets (API keys, passwords) passed via ARG or ENV instead of build secrets
- `COPY . .` that might include sensitive files (.env, credentials) — check .dockerignore

#### Correctness
- Missing or incorrect .dockerignore causing unnecessary build context
- `RUN` commands that should be combined to reduce layers and image size
- apt-get/apk without `--no-cache` or cleanup in the same layer
- `COPY` or `ADD` with incorrect paths or permissions

#### Best Practices
- Multi-stage builds not used when they could reduce final image size
- `ENTRYPOINT` vs `CMD` confusion (exec form vs shell form)
- Health check missing for long-running services

#### Do Not Report
- Ordering preferences that do not affect caching or security
```

#### github-actions

```
Review the changed GitHub Actions workflow for:

#### Security
- `pull_request_target` with checkout of PR head code (untrusted code execution)
- Secrets printed to logs (e.g., `echo ${{ secrets.X }}`)
- Expression injection: `${{ github.event.issue.title }}` or similar in `run:` blocks — must pass through env vars
- Third-party actions not pinned to a full commit SHA (mutable tags can be hijacked)
- Overly broad `permissions` (should use least-privilege)

#### Correctness
- Missing `fetch-depth: 0` when git history is needed
- Misspelled action input names (silently ignored, hard to detect)
- Missing or incorrect `needs:` job dependencies
- Incorrect conditional expressions in `if:` clauses

#### Reliability
- Missing `timeout-minutes` on jobs (can run indefinitely)
- No `concurrency` group for push/PR-triggered workflows (causes redundant runs)
- Dependency installation without caching

#### Do Not Report
- Workflow formatting preferences
- Action version bumps that are not security-relevant
```

#### yaml (generic YAML fallback)

```
Check for spelling errors in YAML keys. Do not flag YAML values.
```

> Sources: All rule doc analysis above. The proposed rules distill OCR's patterns to a size appropriate for a lightweight CLI tool, keeping the precision-over-recall philosophy, language-specific defect categories, and false-positive suppression clauses.
