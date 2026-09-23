# 12: Skill 集成

**What to build:** `skills/diff-sense.md` 文件，让其他 AI Agent 能通过 Skill 调用 diff-sense。Skill 文件指导 Agent：检查 diff-sense 是否已安装（未安装则 `npm install -g diff-sense`）→ 检查 LLM 是否已配置 → 从当前任务提取业务上下文 → 运行 `diff-sense review --format json --background "..."` → 解析 JSON 输出 → 渲染按严重程度分组的 Markdown 摘要（High / Medium / Low 三个区域）。分发方式可通过 skills.sh 发布。

**Blocked by:** 09 (配置系统 + 多提供商注册), 10 (输出格式化)

**Status:** ready-for-agent

- [ ] `skills/diff-sense.md` 文件内容完整
- [ ] 包含安装检查和配置检查步骤
- [ ] CLI 新增 `config check`（或等价命令）：输出合并环境变量后的生效配置是否完整（不打印密钥），供 Skill / Action 判断「是否已配置」；`config get` 只读配置文件，不能用于此判断
- [ ] 包含业务上下文提取指引
- [ ] 包含 JSON 输出解析和 Markdown 摘要渲染的格式说明
- [ ] 摘要按 High / Medium / Low 分组，每条发现含文件路径、行号、内容、建议

## Comments

- 工单 09 审查（2026-09-23）：配置检查需要反映环境变量与配置文件合并后的结果，`config get` 只读配置文件，CI 中仅设环境变量时会误判为未配置，因此新增 `config check` 一项。
