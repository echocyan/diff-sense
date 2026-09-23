import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readConfigFile,
  setConfigValue,
  getConfigValue,
  resolveSettings,
  createModel,
  resolveModel,
} from "./config";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "diff-sense-config-"));
  path = join(dir, ".diff-sense", "config.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("配置文件读写", () => {
  it("文件不存在时返回空配置", async () => {
    expect(await readConfigFile(path)).toEqual({});
  });

  it("set 创建目录与文件，get 读回该值", async () => {
    await setConfigValue("provider", "anthropic", path);
    await setConfigValue("model", "claude-sonnet-5", path);
    expect(await getConfigValue("provider", path)).toBe("anthropic");
    expect(await readConfigFile(path)).toEqual({ provider: "anthropic", model: "claude-sonnet-5" });
  });

  it("配置文件仅所有者可读写", async () => {
    await setConfigValue("apiKey", "sk-secret", path);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("未设置的项 get 返回 undefined", async () => {
    expect(await getConfigValue("model", path)).toBeUndefined();
  });

  it.each([
    ["非法 JSON", "{ provider:"],
    ["未知字段", JSON.stringify({ baseURL: "x" })],
  ])("配置文件%s时报错并指明路径", async (_, content) => {
    await setConfigValue("model", "m", path);
    await writeFile(path, content);
    await expect(readConfigFile(path)).rejects.toThrow(path);
  });

  it("set 拒绝未知配置项", async () => {
    await expect(setConfigValue("baseURL", "x", path)).rejects.toThrow(
      "未知配置项 baseURL，可选：provider、model、apiKey",
    );
  });

  it("set 拒绝不支持的 provider", async () => {
    await expect(setConfigValue("provider", "gemini", path)).rejects.toThrow(
      "不支持的 provider：gemini，可选：anthropic、deepseek、openai",
    );
    await expect(readFile(path, "utf-8")).rejects.toThrow();
  });
});

describe("resolveSettings", () => {
  const file = { provider: "anthropic" as const, model: "claude-sonnet-5", apiKey: "file-key" };

  it("环境变量逐项覆盖配置文件", () => {
    const env = { DIFF_SENSE_MODEL: "claude-opus-5-5", DIFF_SENSE_API_KEY: "env-key" };
    expect(resolveSettings(file, env)).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      apiKey: "env-key",
    });
  });

  it("空字符串环境变量视为未设置", () => {
    expect(resolveSettings(file, { DIFF_SENSE_MODEL: "" }).model).toBe("claude-sonnet-5");
  });

  it("仅有环境变量时可用，apiKey 可缺省", () => {
    const env = { DIFF_SENSE_PROVIDER: "openai", DIFF_SENSE_MODEL: "gpt-5" };
    expect(resolveSettings({}, env)).toEqual({ provider: "openai", model: "gpt-5" });
  });

  it("缺少 provider 或 model 时提示配置方式", () => {
    expect(() => resolveSettings({ provider: "anthropic" }, {})).toThrow(
      /缺少 model[\s\S]*diff-sense config[\s\S]*DIFF_SENSE_MODEL/,
    );
  });

  it("环境变量中的 provider 不受支持时报错并指明来源", () => {
    expect(() => resolveSettings(file, { DIFF_SENSE_PROVIDER: "gemini" })).toThrow(
      "DIFF_SENSE_PROVIDER 中不支持的 provider：gemini",
    );
  });

  it("环境变量切换 provider 时不沿用配置文件中其他提供商的 apiKey", () => {
    const env = { DIFF_SENSE_PROVIDER: "openai", DIFF_SENSE_MODEL: "gpt-5" };
    expect(resolveSettings(file, env).apiKey).toBeUndefined();
  });

  it("环境变量指定的 provider 与配置文件一致时沿用其 apiKey", () => {
    expect(resolveSettings(file, { DIFF_SENSE_PROVIDER: "anthropic" }).apiKey).toBe("file-key");
  });
});

describe("createModel", () => {
  it("按 provider:model 解析到对应提供商的模型", () => {
    const model = createModel({ provider: "deepseek", model: "deepseek-flash" });
    expect(model).toMatchObject({ modelId: "deepseek-flash" });
    expect((model as unknown as { provider: string }).provider).toMatch(/^deepseek/);
  });
});

describe("resolveModel", () => {
  it("环境变量已提供 provider 与 model 时不读取配置文件", async () => {
    await setConfigValue("model", "m", path);
    await writeFile(path, "{ broken");
    const env = { DIFF_SENSE_PROVIDER: "deepseek", DIFF_SENSE_MODEL: "deepseek-flash" };
    const { settings } = await resolveModel(env, path);
    expect(settings).toEqual({ provider: "deepseek", model: "deepseek-flash" });
  });

  it("否则读取配置文件并合并", async () => {
    await setConfigValue("provider", "openai", path);
    await setConfigValue("model", "gpt-5", path);
    const { settings } = await resolveModel({}, path);
    expect(settings).toEqual({ provider: "openai", model: "gpt-5" });
  });
});
