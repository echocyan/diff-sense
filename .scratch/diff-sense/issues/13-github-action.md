# 13: GitHub Action 集成

**What to build:** 仓库根目录的 `action.yml` Composite Action。接收输入：`provider`、`model`、`api_key`（from secrets）、`from_ref`、`to_ref`、`concurrency`、`background`。Action 流程：安装 Node.js → `npx diff-sense review --from $from_ref --to $to_ref --format json` → 解析 JSON 输出 → 通过 GitHub Pull Request Review API 发布行内评论（锚定发现，line > 0）→ 通过 GitHub API 发布摘要评论（未锚定发现，line = 0，聚合为 Markdown 列表）。使用 `${{ github.token }}` 访问 PR API。

**Blocked by:** 10 (输出格式化)

**Status:** ready-for-agent

- [ ] `action.yml` Composite Action 定义，声明所有输入
- [ ] 安装 Node.js 步骤
- [ ] 运行 diff-sense review 步骤（JSON + agent 模式）
- [ ] 解析 JSON 输出的脚本步骤
- [ ] 行内 PR 评论：锚定发现通过 Pull Request Review API 发布到精确代码行
- [ ] 摘要评论：未锚定发现聚合为 Markdown 列表，发布为 PR 普通评论
- [ ] 使用 `github.token` 鉴权，API key 通过 secrets 传入

## Comments

- 工单 10（2026-09-23）：`--format json` 只输出发现数组，不含 token 用量与耗时；若 Action 需要在摘要评论中报告成本，需扩展输出（如另加字段或 stderr 统计）。
