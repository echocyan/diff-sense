# 05: 最小审查流水线（Tracer Bullet）

**What to build:** 最窄的端到端审查路径。Workspace 模式 diff 解析（`git diff` + `git diff --cached`）→ 最小文件过滤（仅跳过二进制）→ 不分组（所有文件归入一组）→ ToolLoopAgent 工具调用循环（code_comment / file_read / code_search / task_done 四个工具 + 审查提示词模板）→ Text 格式输出（发现列表，无行号锚定）。LLM 提供商通过环境变量 `DIFF_SENSE_PROVIDER` / `DIFF_SENSE_MODEL` / `DIFF_SENSE_API_KEY` 直接读取。运行 `diff-sense review` 能对未提交变更产出真实 LLM 审查发现。

**Blocked by:** 04 (项目脚手架 + CLI 骨架)

**Status:** ready-for-agent

- [ ] Workspace 模式 diff 解析：调用 git 获取未提交变更，解析为结构化 diff 对象
- [ ] 最小文件过滤：排除二进制文件
- [ ] 审查提示词模板：system + user 消息对，XML 标签包裹 diff 内容
- [ ] ToolLoopAgent 配置：stopWhen 组合条件（hasToolCall('task_done') + isStepCount(30)）
- [ ] code_comment 工具：收集发现到累加器，schema 含 severity / content / existing_code / suggestion_code / category / path
- [ ] file_read 工具：读取仓库中的文件内容
- [ ] code_search 工具：通过 git grep 搜索代码库
- [ ] task_done 工具：无 execute 函数，触发循环终止
- [ ] Text 格式输出：按文件分组展示发现（severity badge + 内容 + 建议）
- [ ] `review` 命令从 stub 升级为实际调用审查流水线
- [ ] 端到端可验证：对有未提交变更的仓库运行 `diff-sense review` 输出审查发现
