# 05: 最小审查流水线（Tracer Bullet）

**What to build:** 最窄的端到端审查路径。Workspace 模式 diff 解析（`git diff HEAD`，一次覆盖 staged + unstaged；无提交时对比空树）→ 最小文件过滤（仅跳过二进制）→ 不分组（所有文件归入一组）→ ToolLoopAgent 工具调用循环（code_comment / file_read / code_search / task_done 四个工具 + 审查提示词模板）→ Text 格式输出（发现列表，无行号锚定）。LLM 提供商通过环境变量 `DIFF_SENSE_PROVIDER` / `DIFF_SENSE_MODEL` / `DIFF_SENSE_API_KEY` 直接读取。运行 `diff-sense review` 能对未提交变更产出真实 LLM 审查发现。

**Blocked by:** 04 (项目脚手架 + CLI 骨架)

**Status:** done

- [x] Workspace 模式 diff 解析：调用 git 获取未提交变更，解析为结构化 diff 对象
- [x] 最小文件过滤：排除二进制文件
- [x] 审查提示词模板：system + user 消息对，XML 标签包裹 diff 内容
- [x] ToolLoopAgent 配置：stopWhen 组合条件（hasToolCall('task_done') + isStepCount(30)）
- [x] code_comment 工具：收集发现到累加器，schema 含 severity / content / existing_code / suggestion_code / category / path
- [x] file_read 工具：读取仓库中的文件内容
- [x] code_search 工具：通过 git grep 搜索代码库
- [x] task_done 工具：无 execute 函数，触发循环终止
- [x] Text 格式输出：按文件分组展示发现（severity badge + 内容 + 建议）
- [x] `review` 命令从 stub 升级为实际调用审查流水线
- [x] 端到端可验证：对有未提交变更的仓库运行 `diff-sense review` 输出审查发现

## Comments

- 审查修复（2026-09-23）：`file_read` 解析符号链接后拒绝仓库外路径（`../`、绝对路径、外链）；`code_search` 用 `-e` 传查询，防止 git 选项注入。

- 审查修复（2026-09-23）：Workspace 模式由 `git diff` + `git diff --cached` 拼接改为 `git diff HEAD`，修复同一文件同时有 staged / unstaged 改动时产出两条 DiffEntry 的问题。

- 审查修复（2026-09-23）：补齐 `DIFF_SENSE_API_KEY` 读取，注入到所有提供商；未设置时回退到 `ANTHROPIC_API_KEY` 等提供商自身的环境变量。
