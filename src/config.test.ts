import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readConfigFile, setConfigValue, getConfigValue } from "./config";

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
