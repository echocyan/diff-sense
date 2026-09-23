# 07: 规则系统

**What to build:** 内置语言审查规则 + glob 匹配 + 项目级覆盖。为 TS/JS、Python、Go、Java、Rust、Dockerfile、GitHub Actions YAML、通用 YAML 编写内置规则检查清单，加一条默认回退规则。规则通过 glob 模式匹配文件（先匹配者优先，路径小写化）。项目可通过 `.diff-sense/rules.json` 覆盖内置规则。匹配到的规则文本注入审查提示词的 Review Checklist 区域；多语言组使用 `<rules for="paths">` XML 标签。

**Blocked by:** 05 (最小审查流水线)

**Status:** done

- [x] 内置规则内容：TS/JS、Python、Go、Java、Rust、Dockerfile、GitHub Actions YAML、通用 YAML、默认回退（参考 `docs/research/ocr-builtin-rules.md` 中的推荐规则）
- [x] Glob 匹配引擎：先匹配者优先，路径小写化（大小写不敏感）
- [x] 项目覆盖：读取 `.diff-sense/rules.json`，其 rules 数组覆盖内置默认
- [x] 规则注入：匹配规则文本写入审查提示词的 Review Checklist
- [x] 多语言组处理：同组内不同语言文件使用 `<rules for="paths">` XML 标签分别注入
- [x] 单元测试：glob 匹配优先级、项目覆盖合并、多语言注入格式

## Comments

- 实现记录（2026-09-23）：`.diff-sense/rules.json` 的 `rules` 格式为 `[{ "pattern": "<glob>", "rule": "<text>" }]`，数组顺序即优先级，项目规则整体排在内置规则之前。内置规则文本取自 `docs/research/ocr-builtin-rules.md` 第 6 节。业务上下文由 `<background>` 标签改为 `<user_task>` 内的 `### Requirement Background` 区域（与 OCR 模板一致）。spec 中 rules.json 的 `include` 字段不在本工单范围内，尚未实现。
