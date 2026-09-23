import { createProviderRegistry } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { readJsonConfig } from "./json-config";

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
  return readJsonConfig(path, SettingsSchema);
}

/**
 * 整体写入配置文件；文件含 API Key，权限为仅所有者可读写
 *
 * 先以 0600 写入同目录临时文件再重命名替换，避免密钥在收紧权限前以旧权限落盘
 */
export async function writeConfigFile(settings: Settings, path = CONFIG_FILE) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // mkdir 不会修改已存在目录的权限，显式收紧
  await chmod(dir, 0o700);
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** 写入单个配置项，值去除首尾空白且不能为空 */
export async function setConfigValue(key: string, value: string, path = CONFIG_FILE) {
  const k = toConfigKey(key);
  const v = value.trim();
  if (!v) throw new Error(`${k} 不能为空`);
  const settings = await readConfigFile(path);
  if (k === "provider") settings.provider = assertOneOf(v, PROVIDERS, `不支持的 provider：${v}`);
  else settings[k] = v;
  await writeConfigFile(settings, path);
}

/** 读取单个配置项，未设置时返回 undefined */
export async function getConfigValue(key: string, path = CONFIG_FILE) {
  const k = toConfigKey(key);
  return (await readConfigFile(path))[k];
}

/** 校验配置项名称 */
function toConfigKey(key: string): ConfigKey {
  return assertOneOf(key, CONFIG_KEYS, `未知配置项 ${key}`);
}

/** 各配置项对应的环境变量，优先级高于配置文件 */
const ENV_VARS: Record<ConfigKey, string> = {
  provider: "DIFF_SENSE_PROVIDER",
  model: "DIFF_SENSE_MODEL",
  apiKey: "DIFF_SENSE_API_KEY",
};

/** API Key 来源：某个环境变量，或配置文件 */
export type ApiKeySource = { type: "env"; name: string } | { type: "file" };

/** 合并后的生效配置 */
export interface ResolvedSettings {
  provider: Provider;
  model: string;
  /** 显式传给提供商的 API Key；缺省时由各提供商读取自身环境变量（如 ANTHROPIC_API_KEY） */
  apiKey?: string;
  /** API Key 的生效来源；各处均未提供时为 undefined */
  apiKeySource?: ApiKeySource;
}

/**
 * 合并配置文件与环境变量（环境变量逐项优先，空字符串视为未设置），校验必填项
 *
 * API Key 优先级：DIFF_SENSE_API_KEY → 配置文件 → 提供商自身的环境变量（由提供商读取，不经 apiKey 传入）
 */
export function resolveSettings(
  file: Settings,
  env: Record<string, string | undefined>,
): ResolvedSettings {
  const fromEnv = (key: ConfigKey) => env[ENV_VARS[key]] || undefined;
  const envProvider = fromEnv("provider");
  const provider =
    envProvider === undefined
      ? file.provider
      : assertOneOf(
          envProvider,
          PROVIDERS,
          `${ENV_VARS.provider} 中不支持的 provider：${envProvider}`,
        );
  const model = fromEnv("model") ?? file.model;

  if (!provider || !model) {
    const missing = (["provider", "model"] as const).filter((k) => !{ provider, model }[k]);
    throw new Error(
      `缺少 ${missing.join("、")}：请运行 diff-sense config 进行配置，` +
        `或设置环境变量 ${missing.map((k) => ENV_VARS[k]).join("、")}`,
    );
  }
  const envKey = fromEnv("apiKey");
  if (envKey) {
    return {
      provider,
      model,
      apiKey: envKey,
      apiKeySource: { type: "env", name: ENV_VARS.apiKey },
    };
  }
  // 配置文件中的 apiKey 属于文件中的 provider；环境变量切换到其他提供商时不沿用，避免把密钥发给错误的服务
  const fileKey = provider === file.provider ? file.apiKey : undefined;
  if (fileKey) return { provider, model, apiKey: fileKey, apiKeySource: { type: "file" } };
  const providerEnvVar = providerApiKeyEnvVar(provider);
  const apiKeySource = env[providerEnvVar]
    ? { type: "env" as const, name: providerEnvVar }
    : undefined;
  return { provider, model, apiKeySource };
}

/** 校验取值属于给定选项，否则以 message 加上可选值列表报错 */
function assertOneOf<T extends string>(value: string, options: readonly T[], message: string): T {
  if ((options as readonly string[]).includes(value)) return value as T;
  throw new Error(`${message}，可选：${options.join("、")}`);
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

/**
 * 加载生效配置
 *
 * 环境变量已提供 provider 与 model 时完全忽略配置文件（CI 中不受本机配置文件影响，
 * 此时 apiKey 取 DIFF_SENSE_API_KEY 或提供商自身的环境变量）；否则读取配置文件并合并
 */
async function loadSettings(
  env: Record<string, string | undefined>,
  path: string,
): Promise<ResolvedSettings> {
  const envComplete = Boolean(env[ENV_VARS.provider] && env[ENV_VARS.model]);
  const file = envComplete ? {} : await readConfigFile(path);
  return resolveSettings(file, env);
}

/** 解析审查使用的 LLM 模型，配置加载规则见 {@link loadSettings} */
export async function resolveModel(
  env: Record<string, string | undefined> = process.env,
  path = CONFIG_FILE,
): Promise<{ model: LanguageModel; settings: ResolvedSettings }> {
  const settings = await loadSettings(env, path);
  return { model: createModel(settings), settings };
}

/** 生效配置的检查结果；只含 API Key 的来源，不含密钥本身 */
export interface ConfigCheck {
  provider: Provider;
  model: string;
  apiKeySource: ApiKeySource;
}

/**
 * 检查合并环境变量与配置文件后的生效配置是否完整，供 Skill / Action 判断是否已配置
 *
 * 与 {@link resolveModel} 使用相同的加载规则；缺少 provider、model 或 API Key 时报错并提示配置方式
 */
export async function checkConfig(
  env: Record<string, string | undefined> = process.env,
  path = CONFIG_FILE,
): Promise<ConfigCheck> {
  const { provider, model, apiKeySource } = await loadSettings(env, path);
  if (!apiKeySource) {
    throw new Error(
      "缺少 API Key：请运行 diff-sense config 进行配置，" +
        `或设置环境变量 ${ENV_VARS.apiKey} 或 ${providerApiKeyEnvVar(provider)}`,
    );
  }
  return { provider, model, apiKeySource };
}

/** 提供商自身读取的 API Key 环境变量名（如 ANTHROPIC_API_KEY），apiKey 缺省时生效 */
export function providerApiKeyEnvVar(provider: Provider): string {
  return `${provider.toUpperCase()}_API_KEY`;
}
