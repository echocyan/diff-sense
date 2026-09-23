import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectConfig } from "./project-config";

let dir: string;

/** 写入 .diff-sense/rules.json */
async function writeConfig(content: string) {
  await mkdir(join(dir, ".diff-sense"), { recursive: true });
  await writeFile(join(dir, ".diff-sense/rules.json"), content);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "diff-sense-config-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadProjectConfig", () => {
  it("配置文件不存在时返回空配置", async () => {
    expect(await loadProjectConfig(dir)).toEqual({ exclude: [], rules: [] });
  });

  it("读取 exclude 与 rules", async () => {
    await writeConfig(
      JSON.stringify({ exclude: ["vendor/**"], rules: [{ pattern: "src/api/**", rule: "R" }] }),
    );
    expect(await loadProjectConfig(dir)).toEqual({
      exclude: ["vendor/**"],
      rules: [{ pattern: "src/api/**", rule: "R" }],
    });
  });

  it.each([
    ["JSON 语法错误", "{ rules: "],
    ["rules 条目缺少 rule 字段", JSON.stringify({ rules: [{ pattern: "**/*.ts" }] })],
    ["exclude 不是字符串数组", JSON.stringify({ exclude: "vendor" })],
  ])("配置无效时报错并指明文件：%s", async (_, content) => {
    await writeConfig(content);
    await expect(loadProjectConfig(dir)).rejects.toThrow(/\.diff-sense\/rules\.json/);
  });
});
