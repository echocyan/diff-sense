# OCR Prompt 模板分析

Type: research
Status: resolved

## Question

研究 OCR 的 GROUPING_TASK 和 MAIN_TASK prompt 模板的具体内容和设计模式，为 diff-sense 的 prompt 设计提供参考。

需要搞清楚：
1. GROUPING_TASK 的输入格式（文件元数据怎么传）、输出格式（分组 JSON 的 schema）、prompt 的关键指令
2. MAIN_TASK 的结构：system rule 怎么注入、diff 内容怎么格式化（XML 格式？）、工具使用指令怎么写、对 code_comment 输出质量的约束
3. 占位符体系：`{{system_rule}}`、`{{diffs}}`、`{{change_files}}` 等的实际内容和格式

研究来源：
- OCR 仓库的 `internal/config/template/task_template.json`
- OCR 架构文档：https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/architecture.md
- OCR 工具文档：https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/tools.md

## Answer

详细研究结果见 `docs/research/ocr-prompt-templates.md`。

核心发现：
- **GROUPING_TASK**：双消息 prompt（system + user），仅传文件元数据（路径、状态、增删行数），索引引用节省 token，输出 JSON 数组 `[{label, files}]`，每组上限 10 文件，文件数 ≥ 4 时才触发分组
- **MAIN_TASK**：XML 标签包裹 diff（`<file path="...">`），规则按 glob 匹配注入 `<rules for="...">` 块，严格限制只对 `<review_files>` 中的新增代码评论
- **code_comment 工具**：批量 comments 数组，4 个严重级别（critical/high/medium/low），8 个分类（bug/security/performance/maintainability/test/style/documentation/other），existing_code 必须是新增代码行
- **对 diff-sense 的启示**：采用 XML 标签包裹 diff、元数据与内容分离、批量评论接口、语言规则 glob 匹配注入
