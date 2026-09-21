# 12: Skill 集成

**What to build:** `skills/diff-sense.md` 文件，让其他 AI Agent 能通过 Skill 调用 diff-sense。Skill 文件指导 Agent：检查 diff-sense 是否已安装（未安装则 `npm install -g diff-sense`）→ 检查 LLM 是否已配置 → 从当前任务提取业务上下文 → 运行 `diff-sense review --format json --audience agent --background "..."` → 解析 JSON 输出 → 渲染按严重程度分组的 Markdown 摘要（High / Medium / Low 三个区域）。分发方式可通过 skills.sh 发布。

**Blocked by:** 09 (配置系统 + 多提供商注册), 10 (输出格式化 + 受众模式)

**Status:** ready-for-agent

- [ ] `skills/diff-sense.md` 文件内容完整
- [ ] 包含安装检查和配置检查步骤
- [ ] 包含业务上下文提取指引
- [ ] 包含 JSON 输出解析和 Markdown 摘要渲染的格式说明
- [ ] 摘要按 High / Medium / Low 分组，每条发现含文件路径、行号、内容、建议
