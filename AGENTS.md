# AGENTS.md

## 命令

```bash
pnpm build          # tsup 构建 → dist/index.js（带 shebang）
pnpm dev            # tsup --watch
pnpm test           # vitest run（全量）
pnpm test:watch     # vitest（watch 模式）
pnpm typecheck      # tsc --noEmit
pnpm lint           # oxlint src
pnpm fmt            # oxfmt src
pnpm fmt:check      # oxfmt --check src

# 运行单个测试文件
pnpm vitest run src/diff.test.ts

# 使用 CLI（需先 build）
DIFF_SENSE_PROVIDER=deepseek DIFF_SENSE_MODEL=deepseek-flash pnpm build && node dist/index.js review
```

## 架构

确定性层 × Agent 混合架构（见 `docs/adr/0001-deterministic-agent-hybrid.md`）：确定性层处理 diff 解析、文件过滤、规则匹配、行号锚定、输出格式化；Agent 层通过 AI SDK v7 的 `ToolLoopAgent` 实现 LLM 工具调用循环。

### 数据流

```
CLI (src/index.ts → src/commands/review.ts)
 → review() 编排 (src/review.ts)        ← 测试接缝
   → getWorkspaceDiff() (src/diff.ts)    ← git diff 解析
   → filterFiles() (src/filter.ts)       ← 文件过滤
   → runReviewAgent() (src/agent/loop.ts) ← ToolLoopAgent 循环
     ├── prompts.ts   系统/用户提示词
     └── tools.ts     code_comment / file_read / code_search / task_done
 → formatText() (src/output/text.ts)     ← 终端输出
```

### 核心类型 (`src/types.ts`)

- `DiffEntry` — 一个文件的 diff 元数据
- `Finding` — 一条锚定到代码位置的审查发现
- `ReviewResult` — 审查结果（findings + token 用量 + 耗时）

### AI SDK 用法

- 使用 AI SDK v7（`ai@7.x`），**不要**凭记忆写 API — 先查 `node_modules/ai/docs/`
- `LanguageModel`（非 `LanguageModelV1`）、`ToolSet`、`ToolLoopAgent`
- `createProviderRegistry({ anthropic, deepseek, openai })` 多提供商注册
- `result.usage.totalTokens` 类型为 `number | undefined`，需要 `?? 0`

### 三个集成面

1. **CLI** — Commander.js + @clack/prompts（spinner）+ picocolors
2. **Skill** — `skills/` 下的 md 文件（供其他 AI Agent 调用）
3. **GitHub Action** — Composite Action（`action.yml`）

## 约定

- **语言**：代码中的注释和用户面文案使用简体中文，标识符和类型名使用英文
- **注释**：编写简洁的中文注释，使用 TSDoc
- **提交信息**：Conventional Commits 格式，描述和正文使用简体中文，类型和作用域保留英文
- **提交范围**：每次提交只包含一个逻辑变更
- **测试**：仅在必要时编写测试，禁止在实现业务代码后补测试
- **构建**：TypeScript ESM（`"moduleResolution": "Bundler"`），tsup 单入口打包，target node20
- **格式化 / 代码检查**：oxfmt + oxlint

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
