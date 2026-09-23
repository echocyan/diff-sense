# 10: 输出格式化 + 受众模式

**What to build:** JSON 输出格式和受众模式切换。`--format json` 输出结构化 JSON 数组（字段：path / line / endLine / severity / category / content / existingCode / suggestionCode），`--format text` 保持现有人类可读格式。`--audience agent` 静默进度输出（适合被其他工具调用），`--audience human` 保持进度显示。`--background <text>` 将业务上下文注入审查提示词。单元测试覆盖两种格式的输出。

**Blocked by:** 05 (最小审查流水线)

**Status:** done

- [x] JSON 格式化器：输出符合 spec 定义的 JSON schema
- [x] `--format text|json` CLI 标志，默认 text
- [x] `--audience human|agent` CLI 标志，默认 human
- [x] Agent 模式下静默生命周期回调（不输出进度信息）
- [x] `--background <text>` 标志：业务上下文注入到审查提示词的 `<user_task>` 区域（随 ticket 05 提前实现）
- [x] Text 输出展示多行范围（`endLine > line` 时显示为 `src/foo.ts:42-45`，`endLine` 由 ticket 08 提供）
- [x] 单元测试：JSON 输出可解析且 schema 正确、text 输出格式符合预期

## Comments

- 审查修复（2026-09-23）：`--background` 已在 ticket 05 中提前实现（`src/commands/review.ts`、`src/agent/prompts.ts` 中 `<user_task>` 内的 `### Requirement Background` 区域），本工单无需重复实现。
- 工单 08（2026-09-23）：Text 输出已展示 `path:line` 并标记未锚定发现（`src/output/text.ts`、`src/output/text.test.ts`）；多行范围展示留给本工单。
- 实现记录（2026-09-23）：测试接缝为 `formatJson` 与 `formatText`；`--format` / `--audience` 标志经构建后在临时仓库中手动验证（stdout 仅含结果、agent 受众 stderr 为空、非法取值被拒绝）。进度（spinner）改写 stderr，文本结果前不再输出空行（避免污染 stdout）。
- 审查修复（2026-09-23）：新增 `OutputFormat` / `Audience` 类型，CLI choices 由同一常量生成；CONTEXT.md 明确受众只控制进度显示，与 `--format` 相互独立。
- 遗留（2026-09-23）：JSON 输出不含 token 用量与耗时（spec 定义为发现数组）；若 GitHub Action 需报告成本，在工单 13 中处理。
