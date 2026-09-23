# 09: 配置系统 + 多提供商注册

**What to build:** 完整的配置管理和多 LLM 提供商支持。配置文件 `~/.diff-sense/config.json` 存储 provider / model / apiKey 等设置，环境变量（`DIFF_SENSE_PROVIDER` 等）优先级高于配置文件。`diff-sense config` 无参数启动交互式向导引导首次配置，`diff-sense config set <key> <value>` / `config get <key>` 支持脚本化操作。使用 AI SDK 的 `createProviderRegistry` 创建统一注册表，运行时解析 `provider:model` 到具体模型实例。替换 tracer bullet 中的硬编码环境变量读取。

**Blocked by:** 05 (最小审查流水线)

**Status:** done

- [x] 配置文件读写：`~/.diff-sense/config.json` 的加载、创建、更新
- [x] 环境变量合并：DIFF_SENSE_PROVIDER / DIFF_SENSE_MODEL / DIFF_SENSE_API_KEY 优先于配置文件
- [x] `config` 命令：无参数 → 交互式向导（inquirer 或类似库），`set`/`get` 子命令
- [x] `createProviderRegistry` 多提供商注册：支持 Anthropic、OpenAI 等 AI SDK 提供商
- [x] 替换 tracer bullet 中的硬编码 provider 逻辑，统一走配置 → 注册表路径
- [x] 配置校验：缺少必填项时给出清晰错误提示

## Comments

- 实现记录（2026-09-23）：配置项限定为 provider / model / apiKey；provider 限定为 anthropic、deepseek、openai。交互式向导基于已有依赖 @clack/prompts（而非 inquirer）。
- 审查修复（2026-09-23）：
  - 配置文件的 apiKey 仅用于其所属的 provider，环境变量切换提供商时不再沿用。
  - 环境变量已提供 provider 与 model 时忽略配置文件。
  - 配置文件原子写入（0600 临时文件 + rename），已有目录收紧为 0700。
  - 向导一次性写入，切换提供商时不沿用原密钥。
  - set 去除首尾空白并拒绝空值。
  - 抽取 `readJsonConfig` 与项目配置共用读取逻辑。
- 遗留（2026-09-23）：`config get apiKey` 明文输出密钥；`config set apiKey <value>` 会让密钥进入 shell 历史与进程列表。可考虑 get 默认打码、set 支持从 stdin 读取；待有需求时处理。
- 遗留（2026-09-23）：暂无 `config unset`，已保存的 apiKey 只能通过向导切换提供商或手动编辑文件移除。
