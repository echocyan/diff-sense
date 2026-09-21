# 08: 行号锚定

**What to build:** 三步锚定算法，将 code_comment 工具的 `existing_code` 字段映射到精确行号。第一步：在 diff hunk 新侧做滑动窗口匹配（空白不敏感）。第二步：若 hunk 匹配失败，扫描变更后的完整文件。第三步：若仍无匹配，回退到 line=0（未锚定发现）。锚定结果写入发现的 `line` 字段，Text 输出中展示精确行号，未锚定发现标记为 unanchored。

**Blocked by:** 05 (最小审查流水线)

**Status:** ready-for-agent

- [ ] Hunk 新侧滑动窗口匹配：提取 hunk 的新增行，空白不敏感搜索 existing_code
- [ ] 全文件扫描：读取变更后的完整文件内容，搜索 existing_code
- [ ] 回退到 line=0：标记为未锚定发现
- [ ] 集成到审查流水线：Agent 产出的 code_comment 经过锚定后再输出
- [ ] Text 输出中展示行号（如 `src/foo.ts:42`），未锚定发现单独标记
- [ ] 单元测试：精确匹配、空白差异匹配、多行代码片段、无匹配回退
