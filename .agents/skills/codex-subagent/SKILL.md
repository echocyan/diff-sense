---
name: codex-subagent
description: 把 OpenAI Codex CLI 当作一次性 subagent 调用：写好自包含的任务简报，交给 Codex 执行（实现、审查、调研等任意任务），读回结果后收尾。在 Herdr 内时开一个可见的兄弟 pane 运行交互式 Codex，否则退回后台 `codex exec`。仅在用户明确要求时使用，例如输入 /codex-subagent，或说"用 Codex / 让 Codex 去 / 问问 Codex / 交给 codex"；不要因为任务适合委派就自行触发。
---

# Codex Subagent

把 Codex 当作和 Claude 自身 subagent 一样的一次性助手：从零上下文启动 → 收到一份完整简报 → 干完活汇报 → 结束。它不常驻，也不跨任务复用。

## 1. 写任务简报

Codex 看不到当前对话，简报就是它掌握的全部信息。缺了什么它只能猜，猜错的代价由你承担。每份简报包含：

```markdown
## 目标
<要完成什么，完成的标准是什么>

## 背景
<为什么做；相关文件路径、已知事实、已排除的方向；仓库约定（如 AGENTS.md）要点>

## 约束
- 允许/禁止修改文件：<范围>
- 禁止 git commit / push（除非用户要求）
- <其他限制：不要装依赖、不要跑耗时命令等>

## 汇报格式
<期望的输出结构，例如：结论 → 证据（文件:行号）→ 未解决问题；实现类任务列出改动文件与验证结果>
```

把简报写到 scratchpad 目录下的文件里（如 `<scratchpad>/codex-<task>/brief.md`），后续命令从文件读取，避免 shell 转义问题。

## 2. 选择参数

- **沙箱**：任务需要改文件用 `workspace-write`，其余一律 `read-only`。用户明确指定时以用户为准；`danger-full-access` 只在用户明确要求时使用。
- **审批**：交互模式固定 `-a never`，避免 Codex 卡在审批对话框上。
- **模型**：默认不传，沿用 `~/.codex/config.toml`。用户指定时追加 `-m <model>` 或 `-c model_reasoning_effort=<level>`。
- **名字**：`codex-<简短任务名>`，须匹配 `[a-z][a-z0-9_-]{0,31}` 且在 `herdr agent list` 中唯一。
- **超时**：默认 30 分钟（1800000 ms），任务说明另有要求时按其调整。

## 3a. Herdr 模式（`HERDR_ENV=1` 时）

```bash
test "${HERDR_ENV:-}" = 1
```

**开 pane**：先看调用方 pane 的形状，宽的向右分，窄或高的向下分；已有多列时避免继续同向切分。

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

从返回 JSON 的 `.result.pane.pane_id` 取新 pane ID，记下来——收尾只关这个 pane。

**启动 Codex**：

```bash
herdr agent start codex-<task> --kind codex --pane <pane-id> -- -s <sandbox> -a never [-m <model>]
```

若返回 `agent_not_ready`（通常是目录信任确认等启动对话框），用 `herdr agent read codex-<task> --source visible` 看清屏幕，把内容告诉用户并由用户决定如何回应，不要替用户确认。

**发送简报并等待**：用 Bash 的 `run_in_background: true` 运行，完成时会收到通知，期间可以继续其他工作：

```bash
herdr agent prompt codex-<task> "$(cat <scratchpad>/codex-<task>/brief.md)" --wait --timeout 1800000
```

**读结果**：

```bash
herdr agent read codex-<task> --source recent-unwrapped --lines 400
```

如果回复被截断或读不全，再追加一轮提示，让 Codex 把完整汇报写成 Markdown 文件并只回复路径，然后读取该文件：

```bash
herdr agent prompt codex-<task> "把你刚才的完整汇报写入 <scratchpad>/codex-<task>/report.md，只回复文件路径。" --wait --timeout 300000
```

**收尾**：拿到结果后关闭自己创建的 pane（会一并结束 Codex）：

```bash
herdr pane close <pane-id>
```

**异常**：`prompt --wait` 返回 `blocked`、`timeout`、`agent_prompt_stalled` 时，先 `herdr agent get` + `herdr agent read` 查看现场，把情况报告给用户，由用户决定下一步。不要替用户回答审批/问题，不要自动杀掉或关闭 pane，也不要盲目重发简报——超时并不代表提示没送达。

## 3b. 兜底模式（不在 Herdr 内）

用 `run_in_background: true` 运行，`-o` 把 Codex 最终回复写入文件：

```bash
codex exec -s <sandbox> -C "$PWD" [-m <model>] \
  -o <scratchpad>/codex-<task>/report.md \
  "$(cat <scratchpad>/codex-<task>/brief.md)"
```

完成后读取 `report.md`。命令失败或超时时，把输出报告给用户，不要自动重试。

## 4. 并行

可以同时启动多个 Codex，各自使用唯一名字和独立 pane。多个 `workspace-write` 任务并行时，确保它们修改的文件范围互不重叠；有重叠就串行执行。新增 pane 时避免连续同向切分出过窄的列或过矮的行。

## 5. 汇报给用户

Codex 的输出是原始材料，不是最终答案。转述时标明哪些结论来自 Codex；对它声称的改动或事实，必要时自行核验（查看 `git diff`、读相关文件、跑测试）再下结论。

更复杂的 Herdr 用法（跨机器、pane 移动、按键控制等）参考 `herdr` skill。
