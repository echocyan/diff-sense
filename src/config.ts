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

/** 从环境变量解析 LLM 模型 */
export function resolveModel(): ResolvedConfig {
  const provider = process.env.DIFF_SENSE_PROVIDER;
  const modelId = process.env.DIFF_SENSE_MODEL;

  if (!provider || !modelId) {
    throw new Error(
      "缺少环境变量：请设置 DIFF_SENSE_PROVIDER 和 DIFF_SENSE_MODEL\n" +
        "例如：DIFF_SENSE_PROVIDER=anthropic DIFF_SENSE_MODEL=claude-sonnet-4-5",
    );
  }

  // 注册多 LLM 提供商，运行时按 DIFF_SENSE_PROVIDER 选择
  // DIFF_SENSE_API_KEY 未设置时 apiKey 为 undefined，各提供商回退到自身的环境变量（如 ANTHROPIC_API_KEY）
  const apiKey = process.env.DIFF_SENSE_API_KEY;
  const registry = createProviderRegistry({
    anthropic: createAnthropic({ apiKey }),
    deepseek: createDeepSeek({ apiKey }),
    openai: createOpenAI({ apiKey }),
  });

  // registry.languageModel() 接受 `provider:model` 格式，需要类型断言满足联合类型签名
  const id = `${provider}:${modelId}` as "anthropic:_" | "deepseek:_" | "openai:_";
  const model = registry.languageModel(id);
  return { model, provider, modelId };
}
