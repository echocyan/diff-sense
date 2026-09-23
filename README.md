# diff-sense

轻量级 AI 驱动的代码审查 CLI 工具。读取 git diff，由 LLM Agent 逐组审查变更，输出锚定到文件与行号的审查发现。

- **确定性层 × Agent 混合架构**：diff 解析、文件过滤、规则匹配、行号锚定、输出格式化都是确定性代码，只有审查本身交给 LLM
- **精确到行**：每条发现都尽量锚定到变更后文件的具体行号，锚定失败的发现会明确标出，不会被丢弃
- **语义分组 + 并发审查**：变更文件较多时先按主题分组，再并发审查各组
- **三种接入方式**：命令行、供其他 AI Agent 调用的 Skill、在 PR 上发布评论的 GitHub Action

## 安装

需要 Node.js 22.12 或更高版本。npm 包名为 `@echocyan/diff-sense`，安装后的命令为 `diff-sense`。

```bash
npm install -g @echocyan/diff-sense
# 或者不安装，直接运行
npx @echocyan/diff-sense review
```

## 配置

支持的 LLM 提供商：`anthropic`、`deepseek`、`openai`。

交互式配置（写入 `~/.diff-sense/config.json`，文件权限仅所有者可读写）：

```bash
diff-sense config
```

也可以用环境变量配置，环境变量优先于配置文件：

| 环境变量 | 说明 |
| --- | --- |
| `DIFF_SENSE_PROVIDER` | 提供商 |
| `DIFF_SENSE_MODEL` | 模型 ID，如 `claude-sonnet-5` |
| `DIFF_SENSE_API_KEY` | API Key；不设置时读取提供商自身的环境变量，如 `ANTHROPIC_API_KEY` |

检查生效配置是否完整（不会输出密钥）：

```bash
diff-sense config check
```

## 使用

```bash
# 审查工作区相对 HEAD 的全部变更（已暂存、未暂存与未跟踪的文件）
diff-sense review

# 审查单个提交
diff-sense review --commit a1b2c3d

# 审查两个 ref 之间的变更
diff-sense review --from main --to feature/login

# 提供业务上下文，帮助审查区分「有意为之」与「疏忽」
diff-sense review --background "为登录接口增加限流，暂不处理分布式场景"
```

| 参数 | 说明 |
| --- | --- |
| `--format <text\|json\|github>` | 输出格式，默认 `text` |
| `--background <text>` | 业务上下文 |
| `--commit <sha>` | 审查单个提交 |
| `--from <ref> --to <ref>` | 审查两个 ref 之间的变更，两者须同时给出 |
| `--exclude <pattern...>` | 排除文件，支持 glob（`*`、`**`、`{a,b}`） |
| `--concurrency <n>` | 同时审查的分组数，默认 4 |

审查结果只写 stdout，进度提示写 stderr，因此可以直接用管道处理输出：

```bash
diff-sense review --format json | jq '.[] | select(.severity == "high")'
```

### 输出格式

- `text`：按文件分组的彩色终端输出
- `json`：发现数组，字段固定为 `path`、`line`、`endLine`、`severity`（`high` / `medium` / `low`）、`category`、`content`、`existingCode`、`suggestionCode`（没有修复建议时为 `null`）；`line` 为 0 表示未能锚定到具体行
- `github`：GitHub Action 使用的 PR 评论载荷

### 文件过滤

以下文件不会送审：已删除的文件、二进制文件、敏感文件（`.env`、密钥、凭证等）、非代码文件，以及 lockfile 等工具生成的文件。

## 项目规则

在仓库根目录创建 `.diff-sense/rules.json`，可以追加排除模式，并为特定文件指定审查规则：

```json
{
  "exclude": ["docs/**", "**/*.generated.ts"],
  "rules": [
    { "pattern": "src/api/**", "rule": "所有接口必须校验入参，并返回统一的错误结构" }
  ]
}
```

项目规则优先于内置规则匹配。内置规则覆盖 TypeScript / JavaScript、Python、Go、Java、Rust、Dockerfile、GitHub Actions YAML 等常见文件类型。

## GitHub Action

在 PR 上运行审查：能定位到 diff 行的发现发布为行内评论，其余发现汇总为一条摘要评论。

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
```

| 输入 | 说明 |
| --- | --- |
| `provider` / `model` / `api_key` | LLM 配置，`api_key` 请通过 secrets 传入 |
| `from_ref` / `to_ref` | 审查范围，默认为 PR 的 base 与 head，实际从两者的 merge-base 开始比较 |
| `concurrency` | 同时审查的分组数，默认 4 |
| `background` | 业务上下文 |

注意：

- `actions/checkout` 需要设置 `fetch-depth: 0`，否则无法计算 merge-base
- `pull_request` 事件中来自 fork 的 PR 拿不到 secrets，会被跳过

## Skill

`skills/diff-sense/SKILL.md` 指导其他 AI Agent 调用 diff-sense，并把结果整理成按严重程度分组的 Markdown 摘要。通过 [skills.sh](https://skills.sh) 安装：

```bash
npx skills add echocyan/diff-sense
```

## 开发

```bash
pnpm install
pnpm build       # 构建 dist/index.js
pnpm test        # 运行测试
pnpm typecheck   # 类型检查
pnpm lint        # 代码检查
```

本仓库限定使用 pnpm，发布请使用 `pnpm publish`（`npm publish` 会被 `devEngines` 拒绝）。

## 许可证

[MIT](LICENSE)
