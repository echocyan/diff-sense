# 12: Skill 集成

**What to build:** `skills/diff-sense.md` 文件，让其他 AI Agent 能通过 Skill 调用 diff-sense。Skill 文件指导 Agent：检查 diff-sense 是否已安装（未安装则 `npm install -g diff-sense`）→ 检查 LLM 是否已配置 → 从当前任务提取业务上下文 → 运行 `diff-sense review --format json --background "..."` → 解析 JSON 输出 → 渲染按严重程度分组的 Markdown 摘要（High / Medium / Low 三个区域）。分发方式可通过 skills.sh 发布。

**Blocked by:** 09 (配置系统 + 多提供商注册), 10 (输出格式化)

**Status:** done

- [x] `skills/diff-sense/SKILL.md` 文件内容完整
- [x] 包含安装检查和配置检查步骤
- [x] CLI 新增 `config check`（或等价命令）：输出合并环境变量后的生效配置是否完整（不打印密钥），供 Skill / Action 判断「是否已配置」；`config get` 只读配置文件，不能用于此判断
- [x] 包含业务上下文提取指引
- [x] 包含 JSON 输出解析和 Markdown 摘要渲染的格式说明
- [x] 摘要按 High / Medium / Low 分组，每条发现含文件路径、行号、内容、建议

## Comments

- 工单 09 审查（2026-09-23）：配置检查需要反映环境变量与配置文件合并后的结果，`config get` 只读配置文件，CI 中仅设环境变量时会误判为未配置，因此新增 `config check` 一项。
- 实现记录（2026-09-23）：Skill 路径由 `skills/diff-sense.md` 改为 `skills/diff-sense/SKILL.md`，符合 skills.sh 的目录结构（每个 skill 一个目录，SKILL.md 带 name / description frontmatter）。`config check` 与 `resolveModel` 共用配置加载规则（`loadSettings`），输出 provider、model 与 API Key 来源（`DIFF_SENSE_API_KEY` / 配置文件 / 提供商自身环境变量），缺项时报错并以退出码 1 结束。
- 决策（2026-09-23）：Skill 不代为运行 `diff-sense config` 向导（需要交互式终端），也不让用户在对话中提供 API Key；摘要输出后不自动按建议修改代码，由用户决定处理哪些发现。
- 遗留（2026-09-23）：diff-sense 尚未发布到 npm（工单 14），`npm install -g diff-sense` 在发布前不可用；Skill 未在真实提供商上端到端验证。
