# OCR 内置规则分析

Type: research
Status: resolved

## Question

研究 OCR 的内置审查规则（system_rules.json）的内容和结构，决定 diff-sense v1 的内置规则覆盖范围。

需要搞清楚：
1. OCR 的 system_rules.json 覆盖了哪些语言/文件类型
2. 每条规则的内容长什么样——是通用指令还是语言特定的检查清单
3. 规则匹配机制：glob pattern 怎么匹配文件到规则
4. 规则内容怎么注入到 prompt 的 `{{system_rule}}` 占位符

基于研究结果，提出 diff-sense v1 内置规则的建议覆盖范围（建议覆盖 TypeScript/JavaScript、Python、Go、Java、Rust 等主流语言 + Dockerfile、GitHub Actions YAML）。

研究来源：
- OCR 仓库的 `internal/config/rules/system_rules.go` 或 `system_rules.json`
- OCR 规则文档：https://github.com/alibaba/open-code-review/blob/main/pages/src/content/docs/en/review-rules.md

## Answer

详细研究结果见 `docs/research/ocr-builtin-rules.md`。

核心发现：
- **OCR 覆盖范围**：48 个 glob 映射 + 52 个规则文档，覆盖 Java/Go/TS/Python/Rust/Kotlin/C/C++/PHP/Swift 等主流语言，以及 YAML/Terraform/Protobuf/GraphQL 等配置格式
- **规则结构**：语言特定的详细检查清单（非通用指令），含精确优先于召回的前言、分类缺陷模式（correctness/security/performance/concurrency 等）、误报抑制条款、工具使用提示
- **规则长度差异大**：YAML 1 行，TS/JS 50-80 行，Python 200+ 行，Go 500+ 行
- **匹配机制**：glob pattern，声明顺序优先匹配，路径小写化（大小写不敏感），特定 pattern 优先于通用 pattern
- **diff-sense v1 建议**：研究报告已包含为 TS/JS、Python、Go、Java、Rust、Dockerfile、GitHub Actions YAML、通用 YAML、默认规则编写的推荐规则集（每条 20-40 行）
