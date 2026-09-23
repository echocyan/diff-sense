import { createProviderRegistry } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

/** 用户级配置文件路径 */
export const CONFIG_FILE = join(homedir(), ".diff-sense", "config.json");

/** 已注册的 LLM 提供商 */
export const PROVIDERS = ["anthropic", "deepseek", "openai"] as const;

/** 可配置项 */
export const CONFIG_KEYS = ["provider", "model", "apiKey"] as const;

/** 提供商名称 */
export type Provider = (typeof PROVIDERS)[number];

/** 可配置项名称 */
export type ConfigKey = (typeof CONFIG_KEYS)[number];

/** 配置文件内容：各项均可缺省 */
const SettingsSchema = z.strictObject({
  provider: z.enum(PROVIDERS).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

/** 配置文件内容 */
export type Settings = z.infer<typeof SettingsSchema>;

/** 读取配置文件，不存在时返回空配置 */
export async function readConfigFile(path = CONFIG_FILE): Promise<Settings> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} 不是合法的 JSON：${(err as Error).message}`);
  }

  const result = SettingsSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`${path} 格式无效：\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** 写入单个配置项；文件含 API Key，权限设为仅所有者可读写 */
export async function setConfigValue(key: string, value: string, path = CONFIG_FILE) {
  const settings = await readConfigFile(path);
  const k = assertConfigKey(key);
  if (k === "provider") settings.provider = assertProvider(value);
  else settings[k] = value;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
  // 文件已存在时 writeFile 不改权限，显式收紧
  await chmod(path, 0o600);
}

/** 读取单个配置项，未设置时返回 undefined */
export async function getConfigValue(key: string, path = CONFIG_FILE) {
  return (await readConfigFile(path))[assertConfigKey(key)];
}

/** 各配置项对应的环境变量，优先级高于配置文件 */
const ENV_VARS: Record<ConfigKey, string> = {
  provider: "DIFF_SENSE_PROVIDER",
  model: "DIFF_SENSE_MODEL",
  apiKey: "DIFF_SENSE_API_KEY",
};

/** 合并后的生效配置；apiKey 缺省时由各提供商读取自身环境变量（如 ANTHROPIC_API_KEY） */
export interface ResolvedSettings {
  provider: Provider;
  model: string;
  apiKey?: string;
}

/** 合并配置文件与环境变量（环境变量逐项优先，空字符串视为未设置），校验必填项 */
export function resolveSettings(
  file: Settings,
  env: Record<string, string | undefined>,
): ResolvedSettings {
  const pick = (key: ConfigKey) => env[ENV_VARS[key]] || file[key];
  const provider = pick("provider");
  const model = pick("model");

  if (!provider || !model) {
    const missing = (["provider", "model"] as const).filter((k) => !pick(k));
    throw new Error(
      `缺少 ${missing.join("、")}：请运行 diff-sense config 进行配置，` +
        `或设置环境变量 ${missing.map((k) => ENV_VARS[k]).join("、")}`,
    );
  }
  return { provider: assertProvider(provider), model, apiKey: pick("apiKey") };
}

/** 校验配置项名称 */
function assertConfigKey(key: string): ConfigKey {
  if ((CONFIG_KEYS as readonly string[]).includes(key)) return key as ConfigKey;
  throw new Error(`未知配置项 ${key}，可选：${CONFIG_KEYS.join("、")}`);
}

/** 校验提供商名称 */
function assertProvider(provider: string): Provider {
  if ((PROVIDERS as readonly string[]).includes(provider)) return provider as Provider;
  throw new Error(`不支持的 provider：${provider}，可选：${PROVIDERS.join("、")}`);
}

/** 模型解析结果 */
export interface ResolvedConfig {
  model: LanguageModel;
  provider: string;
  modelId: string;
}

/** 通过提供商注册表将 provider:model 解析为模型实例 */
export function createModel(settings: ResolvedSettings): LanguageModel {
  // apiKey 为 undefined 时各提供商回退到自身的环境变量（如 ANTHROPIC_API_KEY）
  const { apiKey } = settings;
  const registry = createProviderRegistry({
    anthropic: createAnthropic({ apiKey }),
    deepseek: createDeepSeek({ apiKey }),
    openai: createOpenAI({ apiKey }),
  });
  return registry.languageModel(`${settings.provider}:${settings.model}`);
}

/** 读取配置文件并合并环境变量，解析出审查使用的 LLM 模型 */
export async function resolveModel(): Promise<ResolvedConfig> {
  const settings = resolveSettings(await readConfigFile(), process.env);
  return { model: createModel(settings), provider: settings.provider, modelId: settings.model };
}
