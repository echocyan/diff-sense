# diff-sense v1 Wayfinding Map

Status: active
Labels: wayfinder:map

## Destination

diff-sense v1 的所有设计决策已落定——架构、模块划分、CLI 接口、Prompt 策略、集成契约——清晰到足以交给 `to-spec` 产出实现规格。

## Notes

- 领域：TypeScript CLI 工具，AI 驱动代码审查
- 参考项目：alibaba/open-code-review（OCR）
- 每次 session 应查阅：`docs/research/open-code-review.md`（OCR 研究报告）
- Skills：grilling, domain-modeling, research, to-spec

## Decisions so far

- **技术栈**：TypeScript + Vercel AI SDK + pnpm
- **集成面**：CLI + Skill（源文件在 `skills/`，经 skills.sh 分发）+ GitHub Action（Composite Action）
- **LLM 提供商**：多提供商，AI SDK 原生支持
- **Diff 模式**：workspace / commit / range 三种
- **语义分组**：包含，单次 LLM 调用，仅传文件元数据
- **输出格式**：text + JSON
- **规则系统**：两层——内置默认规则 → 项目配置（`.diff-sense/rules.json`）
- **Agent 工具**：task_done / code_comment / file_read / code_search（4 个）
- **配置系统**：环境变量优先 + 配置文件兜底（`~/.diff-sense/config.json`），config 命令有参数走 CLI、无参数走交互式
- **npm 发布**：包名 `diff-sense`（unscoped），支持 `npx diff-sense`
- **审查范围**：通用 LLM 审查 + 按语言/文件类型的规则引导
- **CLI 命令**：`review` + `config` + `version`，框架 Commander.js
- **Prompt 模板**：grouping + review 两个，参考 OCR 实现
- **行号锚定**：三步——hunk 新侧匹配 → 全文件扫描 → line=0
- **文件过滤**：四道门——binary → 敏感路径 → 用户排除 → 扩展名白名单
- **并发**：Promise.all + p-limit，默认并发数 4
- **项目结构**：单包，src/ 内部模块化
- **构建工具**：tsup
- **GitHub Action 评论**：行内评论 + 摘要评论
- **Skill 输出**：Markdown 摘要，按严重程度分类（High/Medium/Low）
- **code_comment schema**：severity 结构化字段（high/medium/low）、existing_code 必填、包含 suggestion_code
- **业务上下文**：包含 `--background` 标志
- **测试**：确定性层 + Mock LLM，框架 Vitest
- [OCR Prompt 模板分析](.scratch/diff-sense/issues/01-ocr-prompt-templates.md)：OCR 用 XML 标签包裹 diff，元数据与内容分离，code_comment 批量数组 + 4 级严重度 + 8 个分类。diff-sense 采用同样模式。详见 `docs/research/ocr-prompt-templates.md`
- [AI SDK Agent Loop 模式](.scratch/diff-sense/issues/02-ai-sdk-agent-loop.md)：使用 ToolLoopAgent + stopWhen 组合式终止条件（hasToolCall('task_done') + isStepCount(30)），createProviderRegistry 多提供商，agent.generate() 非流式 + 生命周期回调。详见 `docs/research/ai-sdk-agent-loop.md`
- [OCR 内置规则分析](.scratch/diff-sense/issues/03-ocr-builtin-rules.md)：OCR 48 个 glob 映射 + 52 个语言特定检查清单。diff-sense v1 覆盖 TS/JS、Python、Go、Java、Rust、Dockerfile、GitHub Actions YAML + 默认规则。详见 `docs/research/ocr-builtin-rules.md`

## Not yet specified

（研究完成后，原有迷雾已可在 spec 阶段解决，无需额外 ticket）

## Out of scope

（暂无）
