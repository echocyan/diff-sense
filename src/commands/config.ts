import type { Command } from "commander";
import { cancel, intro, isCancel, outro, password, select, text } from "@clack/prompts";
import {
  CONFIG_FILE,
  CONFIG_KEYS,
  PROVIDERS,
  getConfigValue,
  readConfigFile,
  setConfigValue,
  type Provider,
} from "../config";

/** 各提供商的模型 ID 示例，作为向导输入框的占位提示 */
const MODEL_EXAMPLES: Record<Provider, string> = {
  anthropic: "claude-sonnet-5",
  deepseek: "deepseek-flash",
  openai: "gpt-5",
};

/** 注册 config 子命令：无参数启动交互式向导，set / get 用于脚本化操作 */
export function registerConfigCommand(program: Command) {
  const config = program
    .command("config")
    .description("管理配置（无参数时启动交互式向导）")
    .action(() => run(runWizard));

  config
    .command("set <key> <value>")
    .description(`设置配置项（${CONFIG_KEYS.join(" / ")}）`)
    .action((key: string, value: string) => run(() => setConfigValue(key, value)));

  config
    .command("get <key>")
    .description("读取配置项，未设置时以退出码 1 结束")
    .action((key: string) =>
      run(async () => {
        const value = await getConfigValue(key);
        if (value === undefined) process.exit(1);
        console.log(value);
      }),
    );
}

/** 执行命令，出错时输出错误信息并以退出码 1 结束 */
async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/** 交互式向导：依次选择提供商、填写模型 ID 与 API Key，写入配置文件 */
async function runWizard() {
  const current = await readConfigFile();
  intro("diff-sense 配置");

  const provider = await select({
    message: "选择 LLM 提供商",
    options: PROVIDERS.map((p) => ({ value: p, label: p })),
    initialValue: current.provider,
  });
  if (isCancel(provider)) return abort();

  const model = await text({
    message: "模型 ID",
    placeholder: MODEL_EXAMPLES[provider],
    // 提供商未变时预填已有模型
    initialValue: provider === current.provider ? current.model : undefined,
    validate: (v) => (v?.trim() ? undefined : "模型 ID 不能为空"),
  });
  if (isCancel(model)) return abort();

  const apiKey = await password({
    message: current.apiKey
      ? "API Key（留空沿用已保存的值）"
      : `API Key（留空则读取环境变量 ${provider.toUpperCase()}_API_KEY）`,
  });
  if (isCancel(apiKey)) return abort();

  await setConfigValue("provider", provider);
  await setConfigValue("model", model.trim());
  if (apiKey) await setConfigValue("apiKey", apiKey);
  outro(`已保存到 ${CONFIG_FILE}`);
}

/** 用户取消向导时不写入任何配置 */
function abort() {
  cancel("已取消，配置未修改");
}
