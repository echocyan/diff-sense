# 配置

diff-sense 有两类配置：

- **LLM 配置**：用哪个提供商、哪个模型、哪个 API Key。属于使用者本人，存放在用户目录或环境变量中。
- **项目配置**：哪些文件不审查、特定文件按什么规则审查。属于项目，提交在仓库的 `.diff-sense/rules.json` 中。

## LLM 配置

### 配置项

| 配置项 | 环境变量 | 说明 |
| --- | --- | --- |
| `provider` | `DIFF_SENSE_PROVIDER` | `anthropic`、`deepseek` 或 `openai` |
| `model` | `DIFF_SENSE_MODEL` | 模型 ID，如 `claude-sonnet-5`、`deepseek-flash`、`gpt-5` |
| `apiKey` | `DIFF_SENSE_API_KEY` | API Key，可省略（见下文） |

配置文件位于 `~/.diff-sense/config.json`：

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-5",
  "apiKey": "sk-..."
}
```

文件中含 API Key，因此以原子方式写入，权限为仅所有者可读写（目录 `0700`，文件 `0600`）。文件中出现未知字段时直接报错。

### 合并规则

1. **环境变量同时提供了 provider 与 model**：完全忽略配置文件。CI 中只设环境变量，就不会受到机器上残留配置文件的影响。
2. **否则逐项合并**：每一项环境变量优先于配置文件；值为空字符串的环境变量视为未设置。
3. **provider 与 model 必填**：缺少时报错，并提示运行 `diff-sense config` 或设置对应的环境变量。

API Key 按以下顺序取第一个存在的：

1. `DIFF_SENSE_API_KEY`
2. 配置文件中的 `apiKey`，**仅当配置文件的 provider 与生效的 provider 一致时**使用。用环境变量切换到其他提供商时，不会把原提供商的密钥发给新的服务。
3. 提供商自身的环境变量：`ANTHROPIC_API_KEY`、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`。这一项由提供商 SDK 自行读取。

### config 命令

```bash
diff-sense config                 # 交互式向导：选择提供商、填写模型与 API Key，一次性写入
diff-sense config set model gpt-5 # 设置单项（值去除首尾空白，不能为空）
diff-sense config get model       # 读取单项；未设置时以退出码 1 结束
diff-sense config check           # 检查合并后的生效配置是否完整
```

- `config get` 只读配置文件，不反映环境变量。要判断「能不能跑」，请用 `config check`。
- `config check` 按与 `review` 完全相同的规则合并配置。完整时输出 provider、model 和 API Key 的**来源**（不输出密钥本身），退出码 0；不完整时说明缺什么，退出码 1：

  ```
  provider: anthropic
  model: claude-sonnet-5
  apiKey: 已设置（来源：环境变量 ANTHROPIC_API_KEY）
  ```

- 向导中切换提供商时，已保存的 API Key 不会沿用到新的提供商。
- `config set apiKey <key>` 会让密钥留在 shell 历史中，建议改用向导或环境变量。

## 项目配置

在仓库根目录创建 `.diff-sense/rules.json`，两个字段都可省略：

```json
{
  "exclude": ["docs/**", "**/*.generated.ts", "vendor"],
  "rules": [
    { "pattern": "src/api/**", "rule": "所有接口必须校验入参，并返回统一的错误结构" },
    { "pattern": "**/*.sql", "rule": "检查迁移是否可回滚，是否会锁大表" }
  ]
}
```

文件不存在时视为空配置；JSON 非法或出现未知字段（如 `include`）时报错，避免误以为某个配置已生效。

### exclude

与 CLI 的 `--exclude` 合并生效，规则相同：

- 含 `*` 或 `{` 的模式按 glob 匹配**整条路径**，如 `docs/**`、`**/*.test.ts`。
- 其他模式按**路径段**匹配：`vendor` 会排除 `vendor/a.go` 和 `lib/vendor/b.go`，但不会排除 `vendors/c.go`。

### rules

每条规则由 glob `pattern` 和规则文本 `rule` 组成，规则文本会注入审查提示词的 Review Checklist：

- 匹配时忽略大小写，按「项目规则 → 内置规则」的顺序，**先匹配者优先**。项目规则因此可以覆盖同类文件的内置规则。
- 一个文件只命中一条规则；都未命中时使用默认规则（通用的缺陷、安全与性能检查）。
- 规则文本写成给审查者的检查清单效果最好：要关注什么、不要报什么。

### glob 语法

项目规则、`exclude` 与 `--exclude` 共用同一套 glob 语法（`src/glob.ts`）：

| 写法 | 含义 |
| --- | --- |
| `*` | 匹配任意字符，不跨目录 |
| `**` | 跨任意层目录；`**/` 也可以匹配零层，所以 `**/*.ts` 能匹配根目录下的 `a.ts` |
| `{a,b}` | 多选一，可以嵌套 |

不支持 `?` 与 `[abc]`，这两者按字面字符处理。

## 内置规则

内置规则参考 [open-code-review](research/ocr-builtin-rules.md) 精简而来，定义在 `src/rules/builtin.ts`：

| 模式 | 规则 |
| --- | --- |
| `**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}` | TypeScript / JavaScript |
| `**/*.{py,pyi}` | Python |
| `**/*.go` | Go |
| `**/*.java` | Java |
| `**/*.rs` | Rust |
| `.github/workflows/**/*.{yaml,yml}` | GitHub Actions |
| `**/*.{yaml,yml}` | YAML（只检查键名拼写） |
| `**/{Dockerfile,Dockerfile.*,*.dockerfile,.dockerignore}` | Dockerfile |
| 其他 | 默认规则 |

各语言规则都遵循「宁缺毋滥」：只报确信是缺陷的问题，并明确列出不要报告的情况，比如编译器或 linter 已能可靠发现的问题。

## 文件过滤

送审前，每个文件依次经过以下检查（`src/filter.ts`），任何一步拒绝即不审查：

| 步骤 | 排除的文件 |
| --- | --- |
| 前置过滤 | 已删除的文件 |
| 门 1：二进制 | git 标记为 `Binary files` 的文件 |
| 门 2：敏感路径 | `.env`、`.env.*`；`.pem`、`.key`、`.crt`、`.cert`、`.p12`、`.pfx`、`.jks`、`.keystore`；`id_rsa` / `id_ed25519` / `id_ecdsa` / `id_dsa`（含 `.pub`）；`credentials.json`；`secret.json` / `secrets.yaml` 等 |
| 门 3：用户排除 | `--exclude` 与项目配置 `exclude` 命中的文件 |
| 门 4：扩展名白名单 | 不在白名单中的文件 |

扩展名白名单覆盖主流编程语言、前端框架文件（`.vue`、`.svelte`、`.astro`）、样式与标记（`.css`、`.scss`、`.html`、`.xml`）、脚本（`.sh`、`.sql`）以及配置格式（`.json`、`.yaml`、`.toml`、`.tf`、`.hcl`、`.nix`）。无扩展名的 `Dockerfile`、`Makefile`、`Justfile`、`Gemfile` 等按文件名放行。

即使扩展名在白名单内，以下生成产物也会被排除：`package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`bun.lock`、`npm-shrinkwrap.json`、`composer.lock`、`Gemfile.lock`、`Cargo.lock`、`poetry.lock`、`Pipfile.lock`、`go.sum`，以及 `*.min.js`、`*.min.css`。

Markdown、纯文本等文档不在白名单内，不会送审。

## review 参数

| 参数 | 说明 |
| --- | --- |
| `--format <text\|json\|github>` | 输出格式，默认 `text` |
| `--background <text>` | 业务上下文，注入审查提示词的 Requirement Background |
| `--commit <sha>` | 审查单个提交，不能与 `--from` / `--to` 同时使用 |
| `--from <ref> --to <ref>` | 审查两个 ref 之间的变更，两者必须同时给出 |
| `--exclude <pattern...>` | 排除文件，可以给多个模式 |
| `--concurrency <n>` | 同时审查的分组数，必须是正整数，默认 4 |

### 写好业务上下文

审查 Agent 只能看到 diff 和仓库代码，看不到这次改动的目的。一两句话说明「要解决什么」和「有意做出的取舍」，能明显减少误报：

```bash
diff-sense review --background "为登录接口增加限流；暂不处理分布式场景，单机内存计数是有意为之"
```
