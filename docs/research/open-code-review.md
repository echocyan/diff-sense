# Open Code Review (OCR) 研究报告

> 研究目的：为构建 diff-sense（轻量级代码审查 CLI 工具）提供架构参考
> 研究日期：2026-09-20
> 主要来源：alibaba/open-code-review 官方文档（GitHub 仓库 `pages/src/content/docs/en/`）

---

## 1. 项目概述

Open Code Review（OCR）是阿里巴巴开源的 AI 驱动代码审查 CLI 工具，用 Go 语言编写。核心理念是 **"确定性工程 × Agent 混合"**（Deterministic Engineering × Agent Hybrid）架构：确定性层处理文件过滤、规则匹配等硬约束，Agent 层负责 LLM 推理和工具调用。

安装方式：`npm install -g @alibaba-group/open-code-review`（也支持 Homebrew、二进制下载等）。

> 来源：[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)、[installation.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/installation.md)

---

## 2. 高层架构

OCR 的审查流水线分为以下阶段：

```
ocr review
  → bootstrap（解析 LLM 端点、加载模板/工具/规则）
  → diff provider（git diff / ls-files / show → []model.Diff）
  → filter & rules（五/六道过滤门 → 选出待审文件 → 匹配规则）
  → semantic grouping（一次 LLM 调用 → 按语义分组）
  → subtask dispatch（并行，每组一个子任务：Plan → Main Loop → Comments）
  → output writer（行号解析 + review filter → 输出 text/JSON/SARIF）
```

### 核心模块

| 层 | 职责 | 关键代码 |
|---|---|---|
| **Diff Provider** | 加载 git diff，三种模式 | `internal/diff/git.go` |
| **File Filter** | 六道过滤门（binary → secret → user_exclude → user_include → unsupported_ext → default_path） | `internal/agent/selection.go` |
| **Rule Engine** | 四层优先级链解析审查规则 | `internal/config/rules/system_rules.go` |
| **Semantic Grouping** | LLM 调用按文件元数据分组 | `internal/agent/grouping.go` |
| **Agent Loop** | 工具调用循环 + 内存压缩 | `internal/llmloop/loop.go`, `compression.go` |
| **Tool Registry** | 六个内置工具的定义和执行 | `internal/tool/`, `internal/config/toolsconfig/tools.json` |
| **Template** | 六个 prompt 模板 | `internal/config/template/task_template.json` |
| **Persistence** | JSONL 会话记录 | `internal/session/persist.go` |
| **LLM Client** | 多提供商抽象 | `internal/llm/resolver.go` |

> 来源：[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)

---

## 3. CLI 接口与命令

### 主要命令

| 命令 | 用途 |
|---|---|
| `ocr review` / `ocr r` | 启动代码审查 |
| `ocr rules` | 检查和调试审查规则 |
| `ocr config` | 管理配置（provider/model/set/unset） |
| `ocr llm` | LLM 工具命令（test/providers） |
| `ocr viewer` | 启动 WebUI 会话查看器 |
| `ocr session` / `ocr sessions` | 列出和检查保存的审查会话 |
| `ocr delegate` | 委托模式（preview/rule） |
| `ocr version` | 显示版本信息 |

### `ocr review` 核心标志

| 标志 | 用途 |
|---|---|
| `--from <ref> --to <ref>` | Range 模式：审查分支差异 |
| `--commit <sha>` / `-c <sha>` | Commit 模式：审查单个提交 |
| （无标志） | Workspace 模式：staged + unstaged + untracked |
| `--preview` | 预览将审查的文件，不花费 token |
| `--format text\|json\|sarif` | 输出格式 |
| `--audience human\|agent` | agent 模式抑制进度输出 |
| `--background <text>` / `-B <file>` | 提供业务上下文 |
| `--concurrency N` | 并发子任务数（默认 8） |
| `--effort low\|medium\|high` | 审查深度（1/2/3 轮） |
| `--max-tokens N` | 输入 token 上限（默认 200000） |
| `--max-tokens-budget N` | 总 token 预算 |
| `--rule <path>` | 自定义规则文件 |
| `--tools <path>` | 自定义工具注册表 |
| `--exclude <patterns>` | 排除文件模式 |

### Diff 模式

| 模式 | 触发条件 | 返回内容 |
|---|---|---|
| Workspace | 无标志 | staged + unstaged + untracked 变更 |
| Commit | `--commit <sha>` | 该提交引入的变更 |
| Range | `--from <a> --to <b>` | `merge-base(a, b)..b` |

> 来源：[cli-reference.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/cli-reference.md)

---

## 4. 审查流水线详解

### 4.1 文件过滤（六道门）

依次检查：

1. **binary** — 二进制文件排除
2. **secret_exclude** — 内置敏感路径保护（`.env.*` 等，不可被 include 覆盖）
3. **user_exclude** — 用户配置的排除模式
4. **user_include** — 用户配置的包含模式（匹配则跳过后续门）
5. **unsupported_ext** — 文件扩展名白名单
6. **default_path** — 内置测试文件排除模式（`*_test.go`, `*.test.ts` 等）

此外，diff 超过 `max_tokens` 80% 的文件标记为 `too_large` 排除；已删除文件标记为 `deleted`。

噪声目录（`vendor/`, `node_modules/` 等）在 diff provider 层更早被过滤。

> 来源：[review-rules.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/review-rules.md)、[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)

### 4.2 语义分组

过滤后的文件不是逐个审查的。`groupDiffs` 发起一次 `GROUPING_TASK` LLM 调用：

- **输入**：仅文件元数据（路径、状态 ADDED/MODIFIED/DELETED/RENAMED、增删行数），不传 diff 内容
- **输出**：JSON 数组 `[{label, files}]`
- **目的**：让相关文件（handler + service + test）在同一对话中审查，支持跨文件推理

安全机制：
- 每组最多 10 个文件
- 组内 diff 总量超 token 预算则拆回单文件
- 未分配的文件自动成为单文件组
- LLM 调用失败则回退到每文件一组

> 来源：[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)

### 4.3 每组子任务：Plan + Main Loop

每组对应一个子 Agent，在独立 goroutine 中运行（受 `--concurrency` 限制）。

#### Phase 1 — Plan（可选）

触发条件：
- 单个文件改动 ≥ 50 行
- 多文件组总改动 ≥ 100 行

计划阶段是单次 LLM 调用（不提供工具），生成检查清单作为 `{{plan_guidance}}`。

#### Phase 2 — Main Loop

工具调用循环：

```
loop (最多 MAX_TOOL_REQUEST_TIMES=100 轮):
    response = llm.complete(messages, tools)
    if 无工具调用: 提示模型重试或用 task_done
    for each call: 执行 → 收集结果
    if task_done 被调用: break
    addNextMessage(...)  // 可能触发压缩
```

退出条件（五种）：
1. `task_done` 被调用
2. 达到最大工具请求次数
3. 连续 3 轮无有效工具结果
4. 上下文被取消
5. 内存压缩无法将缓冲区降到警告阈值以下

#### 审查轮次

Main Loop 按 `--effort` 设置运行多轮：

| effort | 轮数 |
|---|---|
| low | 1 |
| medium（默认） | 2 |
| high | 3 |

每轮带着前一轮确认的发现重新运行（不带计划），直到无新发现或达到预算。

> 来源：[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)

### 4.4 内存压缩

三区分区策略，基于 `MAX_TOKENS = 200000`：

| 阈值 | 动作 |
|---|---|
| 60% | 异步后台压缩 |
| 80% | 同步压缩（阻塞直到完成） |

分区：
- **Frozen**：前 2 条消息（system + initial user），不动
- **Compress**：旧的对话轮次，压缩为一条摘要消息
- **Active**：最近 K 轮完整对话

压缩使用 `MEMORY_COMPRESSION_TASK` prompt，摘要附加在原始用户消息的 `<previous_review_summary>` 标签中。

> 来源：[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)

### 4.5 评论处理流水线

`code_comment` 工具调用产生的原始评论经过：

1. **行号解析**（滑动窗口匹配 `existing_code` → 精确 `start_line`/`end_line`）
2. **重定位任务**（可选回退：匹配失败时用 `RE_LOCATION_TASK` prompt 重新锚定）
3. **审查过滤**（`REVIEW_FILTER_TASK` LLM 调用：检查评论是否可证明不正确，移除误报）
4. **二次行号解析**（全局重新运行 `ResolveLineNumbers`）
5. **渲染**（text / JSON / SARIF）

> 来源：[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)

---

## 5. Agent/LLM 集成

### 5.1 六个 Prompt 模板

| 模板 | 用途 |
|---|---|
| `GROUPING_TASK` | 语义分组 |
| `PLAN_TASK` | 计划阶段 |
| `MAIN_TASK` | 主审查循环 |
| `MEMORY_COMPRESSION_TASK` | 内存压缩摘要 |
| `REVIEW_FILTER_TASK` | 过滤不正确的评论 |
| `RE_LOCATION_TASK` | 重新锚定评论位置 |

关键占位符：
- `{{system_rule}}` — 匹配的审查规则
- `{{diffs}}` — 组内文件的 diff（XML 格式）
- `{{change_files}}` — 组外变更文件列表
- `{{plan_guidance}}` — 计划阶段输出
- `{{confirmed_comments}}` — 前一轮确认的发现

> 来源：[architecture.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md)

### 5.2 六个内置工具

| 工具 | Plan | Main | 用途 |
|---|---|---|---|
| `task_done` | ✗ | ✓ | 终止循环 |
| `code_comment` | ✗ | ✓ | 发出审查评论（content + existing_code + suggestion_code） |
| `file_read` | ✗ | ✓ | 读取文件片段（后更改版本，最多 500 行） |
| `file_read_diff` | ✓ | ✓ | 读取其他文件的 diff |
| `file_find` | ✓ | ✓ | 按文件名子串搜索文件（最多 100 个） |
| `code_search` | ✓ | ✓ | 全文搜索（git grep，支持正则，最多 100 匹配/文件） |

重要设计原则：**上下文工具是只读的，不是评论目标**。LLM 只能对当前组内的文件发出评论，通过工具获取的其他文件信息仅用于理解上下文。

### 5.3 `code_comment` 工具详解

```json
{
  "name": "code_comment",
  "input": {
    "path": "string — 可选，覆盖文件路径",
    "comments": [
      {
        "content": "评论内容",
        "existing_code": "用于锚定的代码片段",
        "suggestion_code": "可选的修复建议",
        "thinking": "可选的推理过程"
      }
    ]
  }
}
```

锚定算法：
1. 在 diff 的 hunk 新侧匹配（空白不敏感）
2. 回退到 hunk 旧侧
3. 全文件扫描
4. RE_LOCATION_TASK prompt 重新锚定
5. 最终回退：`start_line=0`（未锚定）

> 来源：[tools.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/tools.md)

### 5.4 LLM 提供商支持

OCR 支持 25+ 个内置提供商（Anthropic、OpenAI、Bedrock、Gemini、DeepSeek 等），以及自定义提供商。协议支持：`anthropic`、`openai`、`openai-responses`、`anthropic-bedrock`。

> 来源：[configuration.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/configuration.md)

---

## 6. 规则系统

四层优先级链（从高到低）：

1. `--rule` 标志（CLI 覆盖）
2. `<repo>/.opencodereview/rule.json`（项目配置）
3. `~/.opencodereview/rule.json`（全局配置）
4. 内置系统规则（`system_rules.json`，覆盖 30+ 语言/文件类型）

规则文件格式：

```json
{
  "include": ["src/**/*.{ts,tsx}"],
  "exclude": ["**/*.test.ts"],
  "rules": [
    {
      "path": "src/api/**/*.go",
      "rule": "所有导出的 handler 必须在使用前验证请求体。"
    }
  ]
}
```

每个文件匹配一条规则，规则体成为 prompt 中的 `{{system_rule}}`。内置规则覆盖 Java、Go、TypeScript、Python、Rust、Kotlin 等语言，以及 Dockerfile、GitHub Actions YAML、Proto、GraphQL 等特殊文件。

> 来源：[review-rules.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/review-rules.md)

---

## 7. 配置系统

配置文件：`~/.opencodereview/config.json`

### 配置方式

| 方式 | 用途 |
|---|---|
| `ocr config provider` / `ocr config model` | 交互式 TUI |
| `ocr config set <key> <value>` | 非交互式设置 |
| 环境变量 | CI 环境 |

### 关键配置项

| 配置 | 说明 |
|---|---|
| `provider` | LLM 提供商名称 |
| `model` | 模型名称 |
| `providers.<name>.api_key` | API 密钥 |
| `providers.<name>.url` | 覆盖 Base URL |
| `providers.<name>.timeout_sec` | 超时（默认 300s） |
| `providers.<name>.api_key_cmd` | 从命令获取 API key |
| `max_tokens` | 输入 token 上限（默认 200000） |
| `effort` | 审查深度（low/medium/high） |
| `language` | 评论语言 |
| `mcp_servers` | MCP 服务器配置 |
| `retry_codes` | 额外重试状态码 |
| `extra_body` | 额外请求字段 |
| `extra_headers` | 额外请求头 |

> 来源：[configuration.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/configuration.md)

---

## 8. 集成方式

### 8.1 GitHub Actions

工作流文件：`examples/github_actions/ocr-review.yml`

流程：
1. 触发：`pull_request_target`（opened）或 PR 评论 `/open-code-review`
2. 安装 OCR → 配置 LLM（从 secrets）
3. 运行 `ocr review --from origin/$BASE --to origin/$HEAD --format json --audience agent`
4. 解析 JSON → 通过 GitHub Pull Request Review API 发布行内评论
5. 无法定位的评论折入摘要

关键 Secrets：`OCR_LLM_URL`、`OCR_LLM_AUTH_TOKEN`、`OCR_LLM_MODEL`

也支持 composite action（`alibaba/open-code-review@main`），提供 `effort`、`max_tokens_budget`、`stream_progress` 等输入。

输出格式支持 SARIF（可上传到 GitHub Code Scanning）。

### 8.2 GitLab CI

类似流程，用 `merge_requests` 触发，通过 GitLab Discussions API 发布行内评论。

### 8.3 Agent Skill

通过 `npx skills add alibaba/open-code-review --skill open-code-review` 安装为可调用 skill。

Skill 工作流：
1. 检查 CLI 是否安装（自动安装 if missing）
2. 检查 LLM 是否配置
3. 提取业务上下文
4. 运行 `ocr review --audience agent --background "..."`
5. 将 JSON 评论分类为 High/Medium/Low
6. 渲染 Markdown 摘要
7. 用户要求时自动修复

### 8.4 Claude Code 命令

通过 `.claude/commands/open-code-review.md` 注册为 `/open-code-review` 命令。与 Skill 类似但默认自动修复。

### 8.5 委托模式（Delegation Mode）

OCR 处理确定性工程（文件选择、规则解析），宿主 Agent 用自己的 LLM 进行审查。

命令：
- `ocr delegate preview` — 列出可审查文件
- `ocr delegate rule <path...>` — 解析审查规则

无需在 OCR 端配置 LLM。

> 来源：[integrations/](https://github.com/alibaba/open-code-review/tree/main/pages/src/content/docs/en/integrations)

---

## 9. MCP 支持

OCR 可作为 MCP 客户端连接外部 MCP 服务器，扩展工具集。支持：
- `stdio` 类型（本地子进程）
- `remote` 类型（Streamable HTTP）

配置在 `config.json` 的 `mcp_servers` 下。可设置工具白名单（`tools` 字段），避免不必要的工具暴露。

MCP 工具与内置工具共享命名空间，冲突时内置工具优先。

> 来源：[mcp.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/mcp.md)

---

## 10. 会话持久化与 Viewer

### 存储格式

```
~/.opencodereview/sessions/<encoded-repo-path>/<session-id>.jsonl
```

每行一个事件（`llm_request`、`llm_response`、`tool_call` 等），append-only。

### Session Viewer

`ocr viewer` 启动本地 HTTP 服务器（默认 `localhost:5483`），四个页面：
- `/` — 仓库列表
- `/r/{repo}` — 会话列表
- `/r/{repo}/{sessionID}` — 会话详情（任务卡片 + 评论）
- `/r/{repo}/compare` — 两个会话对比（New/Persisting/Resolved/Not reviewed）

### 会话对比

`ocr session compare` 比较两次审查的发现，分为四类：
- **New** — 仅后一次发现
- **Persisting** — 两次都发现
- **Resolved** — 仅前一次发现（后一次审查了该文件）
- **Not reviewed** — 仅前一次发现（后一次未审查该文件）

> 来源：[viewer.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/viewer.md)

---

## 11. 遥测

基于 OpenTelemetry，默认关闭。支持 `console` 和 `otlp` 两种 exporter。导出 spans、metrics、events，不包含 prompt/response 内容。

> 来源：[telemetry.md](https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/telemetry.md)

---

## 12. 对 diff-sense 的启示

### 值得借鉴的核心设计

| OCR 特性 | 建议 | 理由 |
|---|---|---|
| 确定性工程 × Agent 混合 | ✅ 采纳 | 核心架构理念，确保可靠性 |
| 语义分组 | ✅ 采纳 | 显著提升跨文件审查质量，实现成本低 |
| 工具调用循环 | ✅ 采纳 | Agent 的核心特征，AI SDK 天然支持 |
| 结构化工具输出（code_comment） | ✅ 采纳 | 标准化发现格式 |
| 文件过滤 | ✅ 简化采纳 | 减少不必要的 token 消耗 |
| 多输出格式（text/JSON） | ✅ 采纳 | CLI + Action 需要不同格式 |
| `--audience agent` 模式 | ✅ 采纳 | Skill 集成必需 |
| 行号锚定算法 | ✅ 简化采纳 | PR 行内评论必需 |

### 可以简化或跳过的

| OCR 特性 | 建议 | 理由 |
|---|---|---|
| Plan 阶段 | ❌ 跳过 | 对小 diff 无价值，增加延迟 |
| 多轮审查（effort） | ❌ 跳过 | 复杂度高，v1 用单轮 |
| 内存压缩 | ❌ 跳过 | 现代模型上下文窗口足够大 |
| Review Filter 阶段 | ❌ 跳过 | 额外 LLM 调用成本 |
| RE_LOCATION_TASK | ❌ 跳过 | 简单匹配失败回退到 line=0 即可 |
| SARIF 输出 | ❌ 跳过 | v1 不需要 |
| 会话持久化/Viewer | ❌ 跳过 | 复杂度太高 |
| 遥测 | ❌ 跳过 | v1 不需要 |
| MCP 客户端 | ❌ 跳过 | Skill 集成足够 |
| 委托模式 | ❌ 跳过 | 超出范围 |
| 规则系统（四层优先级） | ⚠️ 简化 | 保留项目配置和默认规则，跳过全局和 CLI 覆盖 |
| 25+ 提供商 | ⚠️ 简化 | AI SDK 天然支持多提供商，不需要自己实现 |

### AI SDK 对应关系

| OCR 概念（Go） | AI SDK 对应（TypeScript） |
|---|---|
| Agent loop（goroutine + tool dispatch） | `ToolLoopAgent` 或 `generateText` with `maxSteps` |
| `code_comment` 工具 | `tool()` helper with Zod schema |
| 多提供商 LLM Client | AI SDK provider registry（`@ai-sdk/anthropic`, `@ai-sdk/openai` 等） |
| 模板占位符替换 | TypeScript 模板字符串 |
| 并发子任务 | `Promise.all` + 信号量 |
| 结构化 JSON 输出 | `Output.object({ schema: z.object({...}) })` |

> 来源：[AI SDK 文档](https://ai-sdk.dev/docs/agents/building-agents)
