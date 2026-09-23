import type { Rule } from "../types";

// 规则文本源自 docs/research/ocr-builtin-rules.md 第 6 节（参考 OCR 内置规则精简）

/** 默认回退规则：无内置或项目规则命中时使用 */
export const DEFAULT_RULE = `Review the changed code for:
- Correctness: logic errors, missed boundary conditions, unhandled exceptions
- Security: injection vulnerabilities, exposed secrets, missing input validation
- Performance: obviously inefficient patterns (N+1 queries, unnecessary allocations in loops)
- Naming: typos in identifiers or user-facing strings

Only flag issues you are confident are real defects. Do not flag style preferences.`;

/** TypeScript / JavaScript */
const TYPESCRIPT = `Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Correctness
- Null/undefined access: property access or destructuring without checking for null/undefined when the value can legitimately be absent
- Type safety: use of \`any\` without justification; type assertions (\`as\`) that hide real type mismatches
- Async errors: unhandled promise rejections; missing \`await\` on async calls whose result or error matters
- React hooks (if applicable): hooks called conditionally or in loops; missing or incorrect dependency arrays in useEffect/useMemo/useCallback
- Logic errors: incorrect conditions, unreachable code after return/throw, off-by-one in array access

#### Security
- XSS: \`dangerouslySetInnerHTML\` or \`innerHTML\` with untrusted data
- Eval: \`eval()\`, \`Function()\` constructor, or \`new Function()\` with dynamic input
- Secrets: API keys, tokens, or credentials hardcoded in source

#### Do Not Report
- Style preferences already enforced by ESLint/Prettier (formatting, import order, semicolons)
- Unused imports or variables (handled by TypeScript compiler and linters)`;

/** Python */
const PYTHON = `Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Correctness
- Mutable default arguments: \`def f(x=[])\` or \`def f(x={})\`; the default is shared across calls
- None propagation: \`None\` reaching code that assumes a value (indexing, attribute access) without a guard
- Boundary errors: \`xs[0]\` or \`max(xs)\` without handling empty input; off-by-one in slicing
- Float equality: comparing floats with \`==\` instead of \`math.isclose\`

#### Error Handling
- Bare \`except:\` that swallows KeyboardInterrupt/SystemExit; prefer \`except Exception\` or narrower
- Silent \`except: pass\` without logging or re-raising
- Lost traceback: \`raise NewError()\` instead of \`raise NewError() from err\`

#### Resource Management
- Files, connections, or locks opened without a \`with\` statement

#### Security
- \`eval\`/\`exec\` on untrusted input
- \`subprocess\` with \`shell=True\` and unsanitized input
- \`pickle\`/\`yaml.load\` (without SafeLoader) on untrusted data
- SQL built by string concatenation instead of parameterized queries

#### Do Not Report
- Style issues enforced by Black/Ruff/flake8 (formatting, import order, line length)
- Unused imports in \`.pyi\` stub files
- Type annotation preferences`;

/** Go */
const GO = `Favor precision over recall: only flag issues you are confident are real defects. Do not duplicate findings that go vet, staticcheck, or the compiler catch reliably.

#### Error Handling
- Errors returned from calls that are ignored or silently converted to default values
- Error wrapping with \`%v\` when callers need \`errors.Is\`/\`errors.As\` (use \`%w\`)
- \`panic\`/\`log.Fatal\`/\`os.Exit\` in request handlers, workers, or library code where a recoverable error can be returned

#### Nil Safety
- Nil maps written to; nil channels used unintentionally (block forever)
- Typed nil pointer in interface treated as absent (interface is non-nil)

#### Concurrency
- Unsynchronized reads/writes to maps, slices, or struct fields from multiple goroutines
- Holding a mutex across blocking I/O, channel ops, or network calls
- Goroutines that can outlive their owner with no shutdown mechanism
- \`context.Background()\` used where the caller's context should be propagated

#### Resource Lifecycle
- \`http.Response.Body\`, \`sql.Rows\`, files, or transactions not closed on all paths
- \`defer\` inside a loop that delays cleanup until function return

#### Security
- SQL, shell commands, or URLs assembled from untrusted input without parameterization
- Secrets or credentials logged or embedded in source
- \`math/rand\` used for security-sensitive tokens (use \`crypto/rand\`)

#### Do Not Report
- Style issues enforced by gofmt or linters
- Local variables in methods (inherently thread-safe)
- Read-only access to shared immutable data`;

/** Java */
const JAVA = `Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Correctness
- NullPointerException risks: method calls on values that can be null without null checks; confirm via call chain
- Missing break in switch cases causing unintended fall-through (without a comment indicating intent)
- Logic errors: incorrect conditions, unreachable code, off-by-one in loop bounds

#### Thread Safety (only when evidence of concurrent use exists)
- Check-then-act patterns on shared state without synchronization
- Non-atomic compound operations on shared state (e.g., \`map.get()\` then \`map.put()\`)
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
- Immutable objects or properly synchronized code`;

/** Rust */
const RUST = `Favor precision over recall: only flag issues you are confident are real defects in the changed code.

#### Ownership and Lifetimes
- Unnecessary \`clone()\` calls that mask ownership design issues
- Interior mutability (\`RefCell\`, \`Cell\`) misuse: runtime panics from overlapping borrows
- Reference cycles without \`Weak\` pointers that cause memory leaks

#### Error Handling
- \`unwrap()\` or \`expect()\` in library code or recoverable scenarios where \`?\` or proper error handling is appropriate
- Error context lost by converting to String early; prefer wrapping with context (anyhow/thiserror)

#### Unsafe Code
- \`unsafe\` blocks without documented safety invariants
- Raw pointer operations without clear validity, alignment, and lifetime guarantees

#### Concurrency
- Holding \`Mutex\`/\`RwLock\` guards across \`.await\` points
- Spawned tasks whose \`JoinHandle\` is dropped without observing the result
- Blocking operations inside \`async fn\` without \`spawn_blocking\`

#### Security
- Untrusted input used in file paths, URLs, or shell commands without validation
- Integer conversions that can overflow or truncate
- Secrets logged or embedded in source

#### Do Not Report
- Clippy lints (the compiler and clippy handle style and common mistakes)
- Lifetime annotations that the compiler already enforces`;

/** Dockerfile */
const DOCKERFILE = `Review the changed Dockerfile for:

#### Security
- Running as root when a non-root USER could be used
- Using \`latest\` tag for base images instead of a pinned version/digest
- Secrets (API keys, passwords) passed via ARG or ENV instead of build secrets
- \`COPY . .\` that might include sensitive files (.env, credentials) — check .dockerignore

#### Correctness
- Missing or incorrect .dockerignore causing unnecessary build context
- \`RUN\` commands that should be combined to reduce layers and image size
- apt-get/apk without \`--no-cache\` or cleanup in the same layer
- \`COPY\` or \`ADD\` with incorrect paths or permissions

#### Best Practices
- Multi-stage builds not used when they could reduce final image size
- \`ENTRYPOINT\` vs \`CMD\` confusion (exec form vs shell form)
- Health check missing for long-running services

#### Do Not Report
- Ordering preferences that do not affect caching or security`;

/** GitHub Actions 工作流 */
const GITHUB_ACTIONS = `Review the changed GitHub Actions workflow for:

#### Security
- \`pull_request_target\` with checkout of PR head code (untrusted code execution)
- Secrets printed to logs (e.g., \`echo \${{ secrets.X }}\`)
- Expression injection: \`\${{ github.event.issue.title }}\` or similar in \`run:\` blocks — must pass through env vars
- Third-party actions not pinned to a full commit SHA (mutable tags can be hijacked)
- Overly broad \`permissions\` (should use least-privilege)

#### Correctness
- Missing \`fetch-depth: 0\` when git history is needed
- Misspelled action input names (silently ignored, hard to detect)
- Missing or incorrect \`needs:\` job dependencies
- Incorrect conditional expressions in \`if:\` clauses

#### Reliability
- Missing \`timeout-minutes\` on jobs (can run indefinitely)
- No \`concurrency\` group for push/PR-triggered workflows (causes redundant runs)
- Dependency installation without caching

#### Do Not Report
- Workflow formatting preferences
- Action version bumps that are not security-relevant`;

/** 通用 YAML */
const YAML = `Check for spelling errors in YAML keys. Do not flag YAML values.`;

/**
 * 内置规则：按声明顺序先匹配者优先，具体模式必须排在通用模式之前
 * （如 GitHub Actions 工作流先于通用 YAML）。
 * Dockerfile 排在 YAML 之后，使 `Dockerfile.dev.yml` 这类带真实扩展名的文件按扩展名归类
 */
export const BUILTIN_RULES: Rule[] = [
  { pattern: "**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}", rule: TYPESCRIPT },
  { pattern: "**/*.{py,pyi}", rule: PYTHON },
  { pattern: "**/*.go", rule: GO },
  { pattern: "**/*.java", rule: JAVA },
  { pattern: "**/*.rs", rule: RUST },
  { pattern: ".github/workflows/**/*.{yaml,yml}", rule: GITHUB_ACTIONS },
  { pattern: "**/*.{yaml,yml}", rule: YAML },
  { pattern: "**/{Dockerfile,Dockerfile.*,*.dockerfile}", rule: DOCKERFILE },
];
