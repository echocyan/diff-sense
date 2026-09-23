# 11: 语义分组 + 并发审查

**What to build:** LLM 驱动的语义分组和并发多组审查。文件数 ≥4 时触发分组提示词 LLM 调用（仅传文件元数据：路径、状态、增删行数），输出 JSON 数组 `[{label, files}]`，每组最多 10 个文件。分组结果驱动多个 ToolLoopAgent 实例并发审查，使用 `Promise.all` + `p-limit` 控制并发度。`--concurrency <n>` CLI 标志设置并发数（默认 4）。分组失败时回退到单文件组。

**Blocked by:** 09 (配置系统 + 多提供商注册)

**Status:** done

- [x] 分组提示词模板：输入文件元数据列表，输出 JSON 分组
- [x] 分组阈值：文件数 < 4 时跳过分组，所有文件归入一组
- [x] 每组上限 10 个文件
- [x] 分组失败回退：JSON 解析失败时退化为单文件组
- [x] 并发审查：`Promise.all` + `p-limit` 调度多组 Agent
- [x] `--concurrency <n>` CLI 标志
- [x] 审查提示词中的 `<other_changed_files>` 列出组外变更文件

## Comments

- 实现记录（2026-09-23）：测试接缝为 `parseGroups` / `groupFiles`（`src/grouping.test.ts`）、`buildUserPrompt`（`<other_changed_files>`）与 `review()`（mock 模型验证分组调用、多组并发、`concurrency` 限流、组外文件列表）。分组提示词与审查提示词模板均在 `src/agent/prompts.ts`，沿用 OCR 的 `[index] STATUS path (+增/-删)` 元数据格式。
- 决策（2026-09-23）：分组 LLM 调用本身失败（非仅 JSON 解析失败）时同样退化为单文件组，不中断审查；分组调用的 token 计入 `totalTokens`。
- 决策（2026-09-23）：进度回调由 `onStepEnd` 改为 `onProgress({ groupsDone, groupsTotal, steps })`，spinner 显示「已完成 k/n 组，共 N 步」——多组并发时单组步号会交错，不再有意义。
- 遗留（2026-09-23）：未实现 OCR 的组内 diff token 预算拆分，也未在真实提供商上端到端验证（本机未配置 API key）。
