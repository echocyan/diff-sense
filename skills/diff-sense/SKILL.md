---
name: diff-sense
description: 用 diff-sense CLI 对 git 变更做 AI 代码审查，输出按严重程度（High / Medium / Low）分组的 Markdown 审查摘要。当用户要求审查、review、检查当前改动 / 未提交的修改 / 某个提交 / 两个 ref 之间的差异，或在完成一项编码任务后想在提交前自查代码时使用；即使用户只说「帮我看看这些改动有没有问题」「提交前 review 一下」而没有提到 diff-sense，也应使用。
---

# diff-sense 代码审查

diff-sense 读取 git diff，由 LLM 审查变更，输出锚定到文件与行号的审查发现。本 skill 负责调用 CLI，并把它的 JSON 输出整理成供用户阅读的 Markdown 摘要。

按以下步骤执行。任何一步失败时，把 CLI 的报错原样告诉用户并停止，不要猜测或绕过。

## 1. 检查是否已安装

```bash
diff-sense --version
```

命令不存在时，告诉用户需要全局安装，然后执行：

```bash
npm install -g diff-sense
```

全局安装会修改用户环境；如果当前环境要求先征得同意，就先询问。

## 2. 检查 LLM 配置

```bash
diff-sense config check
```

- 退出码 0：已配置。输出包含 provider、model 与 API Key 的来源，不含密钥本身。
- 退出码 1：未配置完整，stderr 会说明缺什么。把这段说明转告用户，并给出两种配置方式：
  - 在终端运行 `diff-sense config`，交互式向导会写入 `~/.diff-sense/config.json`。向导需要交互式终端，所以请用户自己运行，不要代为运行。
  - 设置环境变量 `DIFF_SENSE_PROVIDER`、`DIFF_SENSE_MODEL`，以及 `DIFF_SENSE_API_KEY` 或提供商自身的 Key（如 `ANTHROPIC_API_KEY`）。provider 可选 `anthropic`、`deepseek`、`openai`。

不要让用户把 API Key 粘贴到对话里，也不要用 `config set apiKey` 代为写入：密钥会留在对话记录和 shell 历史中。

## 3. 提取业务上下文

审查 Agent 只能看到 diff 和仓库代码，看不到这次改动想达成什么。一段简短的业务上下文能让它分辨「有意为之」和「疏忽」，减少误报。

根据当前对话与任务整理 1–3 句话，说明：

- 这次改动要解决什么问题或实现什么功能
- 有意做出的取舍或约束（例如「暂不处理并发」「保持旧 API 兼容」）

示例：`为 config 命令新增 check 子命令，供 CI 判断是否已配置；不输出密钥。`

没有可用信息时省略 `--background`，不要编造。

## 4. 运行审查

默认审查工作区相对 HEAD 的全部变更（已暂存、未暂存与未跟踪的文件）：

```bash
diff-sense review --format json --background '<业务上下文>'
```

按用户要审查的范围选用参数：

| 范围 | 参数 |
| --- | --- |
| 单个提交 | `--commit <sha>` |
| 两个 ref 之间 | `--from <ref> --to <ref>`（两者必须同时给出） |
| 排除部分文件 | `--exclude <pattern...>`（glob，如 `"docs/**"`） |

注意：

- 业务上下文用单引号包裹：单引号内 shell 不做任何展开，`$`、反引号、`!` 和反斜杠都按原文传入，不会被当作命令或变量执行。文本中的单引号写成 `'\''`（先结束引号，插入转义的单引号，再重新开始引号）。
- 审查会多次调用 LLM，变更较大时需要几分钟；把命令超时设为 10 分钟左右。
- 审查结果只写 stdout；stderr 是进度提示，解析时忽略。命令以非零退出码结束时，把 stderr 最后的报错转告用户。

## 5. 解析 JSON 输出

stdout 是一个 JSON 数组，每个元素是一条发现：

```json
[
  {
    "path": "src/config.ts",
    "line": 42,
    "endLine": 45,
    "severity": "high",
    "category": "bug",
    "content": "问题描述",
    "existingCode": "有问题的原始代码",
    "suggestionCode": "建议的修复代码，或 null"
  }
]
```

- `path`：相对仓库根目录的路径
- `line` / `endLine`：变更后文件中的行号；`line` 为 0 表示未能定位到具体行
- `severity`：`high` / `medium` / `low`
- `category`：`bug`、`security`、`performance`、`maintainability`、`style`、`other`
- `suggestionCode`：没有修复建议时为 `null`

## 6. 渲染 Markdown 摘要

用下面的模板，按严重程度分成三个区域。同一区域内按文件路径、再按行号排序。某个区域没有发现时写「无」，让读者一眼确认没有遗漏。

````markdown
## diff-sense 审查结果

共 N 条发现：High X · Medium Y · Low Z

### High

- **`src/config.ts:42-45`** · bug
  问题描述
  ```ts
  建议的修复代码
  ```

### Medium

无

### Low

- **`README.md`（未定位行号）** · style
  问题描述
````

每条发现包含：

- **位置**：`path:line`；`endLine` 大于 `line` 时写成 `path:line-endLine`；`line` 为 0 时写 `path`（未定位行号）
- **分类**：`category`
- **内容**：`content` 原文
- **建议**：`suggestionCode` 不为 `null` 时放进代码块，语言按文件扩展名标注；为 `null` 时省略

数组为空时只输出一行：`diff-sense 未发现问题。`

摘要之后，不要自动按建议修改代码。审查发现可能有误报，由用户决定处理哪些；用户要求修复时，再逐条核对代码后修改。
