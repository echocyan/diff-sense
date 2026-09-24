# 08: 行号锚定

**What to build:** 三步锚定算法，将 code_comment 工具的 `existing_code` 字段映射到精确行号。第一步：在 diff hunk 新侧做滑动窗口匹配（空白不敏感）。第二步：若 hunk 匹配失败，扫描变更后的完整文件。第三步：若仍无匹配，回退到 line=0（未锚定发现）。锚定结果写入发现的 `line` 字段，Text 输出中展示精确行号，未锚定发现标记为 unanchored。

**Blocked by:** 05 (最小审查流水线)

**Status:** done

- [x] Hunk 新侧滑动窗口匹配：提取 hunk 的新增行，空白不敏感搜索 existing_code
- [x] 全文件扫描：读取变更后的完整文件内容，搜索 existing_code
- [x] 回退到 line=0：标记为未锚定发现
- [x] `code_comment` 未传 `path` 时推断所属文件：用 existing_code 在各文件 hunk 中匹配到的位置确定 path（spec："optional, defaults to current review file"），替换当前的 `"unknown"` 占位
- [x] 集成到审查流水线：Agent 产出的 code_comment 经过锚定后再输出
- [x] Text 输出中展示行号（如 `src/foo.ts:42`），未锚定发现单独标记
- [x] 单元测试：精确匹配、空白差异匹配、多行代码片段、无匹配回退

## Comments

- 实现说明（2026-09-23）：hunk 匹配范围为新侧的上下文行 + 新增行（而非仅新增行）。LLM 引用的片段常跨越上下文行；该范围只会多命中、不会少命中，spec 已同步。
- 审查修复（2026-09-23）：path 去掉 `./` 前缀，不在送审文件中时按片段推断；片段混合 `+` / 空格 diff 标记时追加去标记形式匹配，原样形式优先。
- 遗留（2026-09-23）：短片段（如 `}`、`return;`）取首个命中位置，多处命中时可能锚错；待实际遇到再处理（可考虑优先新增行或要求片段唯一）。
- 遗留（2026-09-23）：`readNewFile` 的 workspace 分支与 `file_read` 均按 `cwd` 解析路径，而 diff 路径相对仓库根目录；在子目录中运行时全文件扫描会失败。需统一改为以 `git rev-parse --show-toplevel` 为根，见工单 15。
- 架构检查修复（2026-09-24）：锚定按差异模式读取被审查的提交，而 file_read 读工作区、code_search 执行不带版本的 git grep，审查历史提交或在 Action 中（检出的是 PR 合并提交）时 Agent 看到的代码与被审查的版本不一致。改由 `newSideRev()`（src/diff.ts）统一决定新侧版本，锚定、file_read 与 code_search 共用。
