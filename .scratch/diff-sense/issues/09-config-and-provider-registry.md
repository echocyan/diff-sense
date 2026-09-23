# 09: 配置系统 + 多提供商注册

**What to build:** 完整的配置管理和多 LLM 提供商支持。配置文件 `~/.diff-sense/config.json` 存储 provider / model / apiKey 等设置，环境变量（`DIFF_SENSE_PROVIDER` 等）优先级高于配置文件。`diff-sense config` 无参数启动交互式向导引导首次配置，`diff-sense config set <key> <value>` / `config get <key>` 支持脚本化操作。使用 AI SDK 的 `createProviderRegistry` 创建统一注册表，运行时解析 `provider:model` 到具体模型实例。替换 tracer bullet 中的硬编码环境变量读取。

**Blocked by:** 05 (最小审查流水线)

**Status:** in-progress

- [x] 配置文件读写：`~/.diff-sense/config.json` 的加载、创建、更新
- [x] 环境变量合并：DIFF_SENSE_PROVIDER / DIFF_SENSE_MODEL / DIFF_SENSE_API_KEY 优先于配置文件
- [x] `config` 命令：无参数 → 交互式向导（inquirer 或类似库），`set`/`get` 子命令
- [x] `createProviderRegistry` 多提供商注册：支持 Anthropic、OpenAI 等 AI SDK 提供商
- [x] 替换 tracer bullet 中的硬编码 provider 逻辑，统一走配置 → 注册表路径
- [x] 配置校验：缺少必填项时给出清晰错误提示
