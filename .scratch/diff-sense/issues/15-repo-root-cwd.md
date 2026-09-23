# 15: 以仓库根目录为工作目录

**What to build:** 在仓库子目录中运行 `diff-sense review` 时行为与在根目录一致。diff 路径相对仓库根目录，而当前多处按 `process.cwd()` 解析：行号锚定的全文件扫描（workspace 模式）、`file_read` 工具、`.diff-sense/rules.json` 的读取（exclude 与自定义规则）、未跟踪文件列表（`git ls-files --others` 输出相对当前目录的路径且只含当前目录下的文件）。`review()` 开头通过 `git rev-parse --show-toplevel` 解析仓库根目录，后续步骤统一使用该目录。

**Blocked by:** 08 (行号锚定)

**Status:** ready-for-agent

- [ ] `review()` 解析仓库根目录，后续 diff 获取、文件过滤、规则加载、Agent 工具、行号锚定统一使用根目录
- [ ] 集成测试（mock LLM）：从子目录运行时，全文件扫描能锚定发现，项目配置的 exclude 生效，根目录下的未跟踪文件被送审

## Comments

- 来源（2026-09-23）：工单 08 审查发现的遗留问题（见工单 08 Comments）。
