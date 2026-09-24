# 集成

除了在终端直接使用 CLI，diff-sense 还提供两种集成方式：

- **GitHub Action**：在 PR 上自动审查，并把发现发布为评论。
- **Skill**：让其他 AI Agent（如 Claude Code）调用 diff-sense，并把结果整理成审查摘要。

## GitHub Action

Action 定义在仓库根目录的 `action.yml`，是一个 Composite Action。

### 用法

```yaml
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: echocyan/diff-sense@v0.1.0
        with:
          provider: anthropic
          model: claude-sonnet-5
          api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          background: ${{ github.event.pull_request.title }}
```

三个前提缺一不可：

- **`pull_request` 事件**：Action 需要从事件中取得 PR 编号，才能发布评论。
- **`fetch-depth: 0`**：需要完整的 git 历史来计算 merge-base。
- **`pull-requests: write` 权限**：发布 Review 和评论需要写权限。

### 输入

| 输入 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `provider` | 是 | | `anthropic` / `deepseek` / `openai` |
| `model` | 是 | | 模型 ID |
| `api_key` | 是 | | LLM API Key，请通过 secrets 传入 |
| `from_ref` | 否 | PR 的 base SHA | 审查范围起点 |
| `to_ref` | 否 | PR 的 head SHA | 审查范围终点，行内评论发布到该提交 |
| `concurrency` | 否 | `4` | 同时审查的分组数 |
| `background` | 否 | 空 | 业务上下文 |

### 执行流程

1. **准备 Node.js**：安装 Node.js 24。
2. **确定审查范围**：先做全部校验，避免审查完才发现结果无处发布，白白消耗 token。
   - 不是 PR 事件时报错退出。
   - 来自 fork 的 PR 提示后跳过（原因见下文）。
   - 解析 `to_ref`，并计算它与 `from_ref` 的 **merge-base** 作为真正的起点。PR 页面展示的就是从 merge-base 算起的 diff；如果直接从 base 分支的最新提交比较，会混入目标分支上其他人的新提交。
3. **运行审查**：从 Action 仓库的 `package.json` 读取包名和版本，执行 `npx --package @echocyan/diff-sense@<版本> -- diff-sense review --from <merge-base> --to <head> --format github`。npm 包的版本与 Action 的 git 标签始终一致。
4. **发布评论**：用 `jq` 拆出载荷，再用 `gh` 发布，详见下一节。

所有输入都通过环境变量传给脚本，不会直接拼进 `run:` 命令，所以即使 `background` 等输入里含有 `$(...)` 或反引号，也不会被当作 shell 代码执行。

### 评论如何生成

GitHub 的 Pull Request Review API 有一个限制：行内评论只能落在 PR diff 的 hunk 范围内，只要有一条越界，**整个 Review 请求都会被拒绝**。而 diff-sense 的锚定可能把发现定位到 hunk 之外，比如在全文件扫描时，问题出在改动所调用的已有代码里。

因此 `--format github` 用本次审查的 diff 对发现逐条分类（`src/output/github.ts`）：

| 发现 | 去向 |
| --- | --- |
| 整段位于同一个 hunk 新侧（上下文行或新增行） | Review 中的行内评论；多行发现带 `start_line` |
| 未锚定（`line = 0`） | 摘要评论 |
| 锚定在 hunk 之外，或跨越两个 hunk | 摘要评论 |
| 所在文件不在本次 diff 中 | 摘要评论 |

输出为：

```json
{
  "review": { "event": "COMMENT", "body": "diff-sense 审查：2 条行内评论", "comments": [ ... ] },
  "summary": "## diff-sense 审查摘要\n\n以下 1 条发现无法定位到本次 diff 的代码行…"
}
```

没有对应发现时，`review` 或 `summary` 为 `null`。

发布顺序与容错：

1. **先发摘要评论**，保证即使后面的 Review 失败，摘要里的发现也已经发出。
2. **再发 Review**，`commit_id` 固定为被审查的提交，审查期间有新推送时，评论仍落在正确的行上。
3. **Review 被拒绝时回退**：本地 diff 与 GitHub 的 PR diff 可能不一致，比如重命名检测阈值不同，或 GitHub 折叠了大文件。这时 Action 输出警告，并把这些行内评论改为一条普通评论发布，不中止步骤，也不丢失发现。

### 限制

- **fork PR**：`pull_request` 事件中，来自 fork 的 PR 拿不到仓库 secrets，`github.token` 也只读，既无法调用 LLM 也无法发布评论，因此会提示后跳过。
- **不去重**：每次推送都会发布新的 Review 和摘要评论，不会更新或删除旧评论。
- **建议代码用普通代码块展示**：没有使用 GitHub 的 suggestion 块，所以不能一键应用。
- **评论里没有成本信息**：摘要评论不报告 token 用量和耗时。

## Skill

`skills/diff-sense/SKILL.md` 是给其他 AI Agent 读的操作说明，通过 [skills.sh](https://skills.sh) 分发：

```bash
npx skills add echocyan/diff-sense
```

安装后，Skill 会出现在 `.claude/skills/`、`.agents/skills/` 等目录中。用户说「帮我审查一下这些改动」「提交前 review 一下」时，Agent 就会按 Skill 执行：

1. **检查安装**：`diff-sense --version`；未安装时先确认 Node.js 版本不低于 22.12，再执行 `npm install -g @echocyan/diff-sense`。
2. **检查配置**：`diff-sense config check`。未配置时，把缺失项转告用户，由用户自己运行向导或设置环境变量。Agent 不代为运行向导，也不会要求用户把 API Key 贴进对话。
3. **提取业务上下文**：从当前对话中整理 1–3 句话，说明改动目的与有意的取舍；没有信息时不编造。
4. **运行审查**：`diff-sense review --format json --background '...'`，业务上下文用单引号包裹，防止 shell 展开。
5. **解析 JSON**。
6. **渲染摘要**：分为 High / Medium / Low 三个区域，每条发现包含位置、分类、内容和建议代码。

Skill 输出摘要后不会自动修改代码。审查发现可能有误报，由用户决定处理哪些。
