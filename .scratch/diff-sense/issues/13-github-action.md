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
  - 来自 fork 的 PR 拿不到 secrets，且 `github.token` 只读，无法审查与发布。
  - 建议代码以普通代码块展示，未使用 GitHub 的 suggestion 块（需确认 suggestionCode 恰好替换锚定行）。
  - 摘要评论未报告 token 用量与耗时（见上方工单 10 的评论）。
