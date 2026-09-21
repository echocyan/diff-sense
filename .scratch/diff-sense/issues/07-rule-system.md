# 07: 规则系统

**What to build:** 内置语言审查规则 + glob 匹配 + 项目级覆盖。为 TS/JS、Python、Go、Java、Rust、Dockerfile、GitHub Actions YAML、通用 YAML 编写内置规则检查清单，加一条默认回退规则。规则通过 glob 模式匹配文件（先匹配者优先，路径小写化）。项目可通过 `.diff-sense/rules.json` 覆盖内置规则。匹配到的规则文本注入审查提示词的 Review Checklist 区域；多语言组使用 `<rules for="paths">` XML 标签。

**Blocked by:** 05 (最小审查流水线)

**Status:** ready-for-agent

- [ ] 内置规则内容：TS/JS、Python、Go、Java、Rust、Dockerfile、GitHub Actions YAML、通用 YAML、默认回退（参考 `docs/research/ocr-builtin-rules.md` 中的推荐规则）
- [ ] Glob 匹配引擎：先匹配者优先，路径小写化（大小写不敏感）
- [ ] 项目覆盖：读取 `.diff-sense/rules.json`，其 rules 数组覆盖内置默认
- [ ] 规则注入：匹配规则文本写入审查提示词的 Review Checklist
- [ ] 多语言组处理：同组内不同语言文件使用 `<rules for="paths">` XML 标签分别注入
- [ ] 单元测试：glob 匹配优先级、项目覆盖合并、多语言注入格式
