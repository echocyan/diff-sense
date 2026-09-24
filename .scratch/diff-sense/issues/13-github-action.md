# 13: GitHub Action 集成

**What to build:** 仓库根目录的 `action.yml` Composite Action。接收输入：`provider`、`model`、`api_key`（from secrets）、`from_ref`、`to_ref`、`concurrency`、`background`。Action 流程：安装 Node.js → `npx diff-sense review --from $from_ref --to $to_ref --format json` → 解析 JSON 输出 → 通过 GitHub Pull Request Review API 发布行内评论（锚定发现，line > 0）→ 通过 GitHub API 发布摘要评论（未锚定发现，line = 0，聚合为 Markdown 列表）。使用 `${{ github.token }}` 访问 PR API。

**Blocked by:** 10 (输出格式化)

**Status:** done

- [x] `action.yml` Composite Action 定义，声明所有输入
- [x] 安装 Node.js 步骤
- [x] 运行 diff-sense review 步骤（JSON + agent 模式）
- [x] 解析 JSON 输出的脚本步骤
- [x] 行内 PR 评论：锚定发现通过 Pull Request Review API 发布到精确代码行
- [x] 摘要评论：未锚定发现聚合为 Markdown 列表，发布为 PR 普通评论
- [x] 使用 `github.token` 鉴权，API key 通过 secrets 传入

## Comments

- 工单 10（2026-09-23）：`--format json` 只输出发现数组，不含 token 用量与耗时；若 Action 需要在摘要评论中报告成本，需扩展输出（如另加字段或 stderr 统计）。
- 决策（2026-09-23）：评论载荷由 CLI 的 `--format github` 生成（`{ review, summary }`），而非 Action 脚本解析 `--format json`。Review API 只接受落在 diff hunk 内的行，任一越界评论会让整个请求失败；锚定第二步（全文件扫描）可能锚到 hunk 外，因此需用本次审查的 diff 判断，放在确定性层可复用 diff 解析并以 vitest 测试。Action 只用 `jq` + `gh` 发布。
- 实现记录（2026-09-23）：审查起点取 `from_ref` 与 `to_ref` 的 merge-base（CLI 的 range 是两点 diff，直接用 base.sha 会混入目标分支上的新提交），要求 checkout 设置 `fetch-depth: 0`；Review 的 `commit_id` 固定为被审查的提交；所有输入经环境变量传入脚本，不内插到 `run` 中；CLI 版本取 Action 仓库 `package.json` 的版本，与 Action 标签一致。清单中的「agent 模式」对应的 `--audience` 已在工单 10 移除，进度始终写 stderr，不影响 stdout 的 JSON。
- 遗留（2026-09-23）：
  - diff-sense 尚未发布到 npm（工单 14），发布前 Action 中的 `npx diff-sense@<version>` 不可用；仅以桩替换 `npx` / `gh` 在本地验证了三个脚本步骤，未在真实 PR 上运行。
  - 每次推送都会发布新的 review 与摘要评论，未做去重或更新旧评论。
  - 来自 fork 的 PR（`pull_request` 事件）拿不到 secrets，且 `github.token` 只读，目前在前置步骤中提示并跳过，不支持审查。
  - 建议代码以普通代码块展示，未使用 GitHub 的 suggestion 块（需确认 suggestionCode 恰好替换锚定行）。
  - 摘要评论未报告 token 用量与耗时（见上方工单 10 的评论）。
- 审查修复（2026-09-23，两轴审查）：先发摘要评论再发 Review，Review 被拒绝（本地 diff 与 GitHub 的 PR diff 不一致）时发出警告并把行内评论改为普通评论发布，不再连带丢失全部发现；Review 带上 `body`（COMMENT 事件文档要求）；`pull_request` 事件中的 fork PR 在前置步骤提示并跳过，不再白白运行审查；`to_ref` 无法解析与 merge-base 失败分别报错；摘要中含反引号的路径不再截断行内代码；`text` 与 `github` 输出共用 `lineRange`；spec 中 `--format` 与摘要评论的描述与实现同步。
- 审查未采纳（2026-09-23，两轴审查）：用户故事 29 的「审查力度」仅以 `concurrency` 体现，与工单的输入列表一致；回退评论中的路径未做反引号转义（仅在路径含反引号且 Review 被拒绝时出现）。
- 架构检查修复（2026-09-24）：回退评论原由 action.yml 中的 jq 从行内评论重新拼接 Markdown，路径未做反引号转义，评论格式分散在两处。改为 `--format github` 输出 `fallback` 字段，由 src/output/github.ts 与摘要评论共用列表格式生成；Action 只选择发布哪一份。上文「审查未采纳」中的回退路径转义问题随之解决。
