# 11: 语义分组 + 并发审查

**What to build:** LLM 驱动的语义分组和并发多组审查。文件数 ≥4 时触发分组提示词 LLM 调用（仅传文件元数据：路径、状态、增删行数），输出 JSON 数组 `[{label, files}]`，每组最多 10 个文件。分组结果驱动多个 ToolLoopAgent 实例并发审查，使用 `Promise.all` + `p-limit` 控制并发度。`--concurrency <n>` CLI 标志设置并发数（默认 4）。分组失败时回退到单文件组。

**Blocked by:** 09 (配置系统 + 多提供商注册)

**Status:** ready-for-agent

- [ ] 分组提示词模板：输入文件元数据列表，输出 JSON 分组
- [ ] 分组阈值：文件数 < 4 时跳过分组，所有文件归入一组
- [ ] 每组上限 10 个文件
- [ ] 分组失败回退：JSON 解析失败时退化为单文件组
- [ ] 并发审查：`Promise.all` + `p-limit` 调度多组 Agent
- [ ] `--concurrency <n>` CLI 标志
- [ ] 审查提示词中的 `<other_changed_files>` 列出组外变更文件
