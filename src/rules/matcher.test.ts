import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveRule, resolveGroupRules, loadRules } from "./matcher";
import { BUILTIN_RULES, DEFAULT_RULE } from "./builtin";
import type { Rule } from "../types";

const RULES: Rule[] = [
  { pattern: ".github/workflows/**/*.{yaml,yml}", rule: "GHA" },
  { pattern: "**/*.{yaml,yml}", rule: "YAML" },
];

describe("resolveRule", () => {
  it("按声明顺序先匹配者优先", () => {
    expect(resolveRule(".github/workflows/ci.yml", RULES)).toBe("GHA");
    expect(resolveRule("deploy/app.yaml", RULES)).toBe("YAML");
  });

  it("无匹配时回退到默认规则", () => {
    expect(resolveRule("src/main.zig", RULES)).toBe(DEFAULT_RULE);
  });

  it("路径匹配大小写不敏感", () => {
    expect(resolveRule(".GitHub/Workflows/CI.YML", RULES)).toBe("GHA");
  });
});

describe("内置规则路由", () => {
  it.each([
    ["docker/Dockerfile", "Running as root"],
    ["Dockerfile.prod", "Running as root"],
    ["build/app.dockerfile", "Running as root"],
    ["Dockerfile.dev.yml", "spelling errors in YAML keys"],
    [".github/workflows/ci.yml", "pull_request_target"],
    ["types/stub.pyi", "Mutable default arguments"],
  ])("%s 命中对应规则", (path, marker) => {
    expect(resolveRule(path, BUILTIN_RULES)).toContain(marker);
  });
});

describe("resolveGroupRules", () => {
  it("组内文件命中同一规则时注入裸规则文本", () => {
    expect(resolveGroupRules(["a.yml", "b/c.yaml"], RULES)).toBe("YAML");
  });

  it("组内命中多条规则时按规则分块，用 <rules for> 标注适用路径", () => {
    const paths = ["a.yml", ".github/workflows/ci.yml", "b.yaml"];
    expect(resolveGroupRules(paths, RULES)).toBe(
      '<rules for="a.yml, b.yaml">\nYAML\n</rules>\n\n<rules for=".github/workflows/ci.yml">\nGHA\n</rules>',
    );
  });

  it("路径中的 & 与双引号在 for 属性里转义", () => {
    const out = resolveGroupRules(['a"b.yml', "c&d.yml", ".github/workflows/x.yml"], RULES);
    expect(out).toContain('<rules for="a&quot;b.yml, c&amp;d.yml">');
  });
});

describe("loadRules", () => {
  it("项目规则优先于内置规则，未覆盖的文件仍用内置规则", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diff-sense-rules-"));
    try {
      await mkdir(join(dir, ".diff-sense"));
      await writeFile(
        join(dir, ".diff-sense/rules.json"),
        JSON.stringify({ rules: [{ pattern: "**/*.ts", rule: "PROJECT" }] }),
      );
      const rules = await loadRules(dir);
      expect(resolveRule("src/a.ts", rules)).toBe("PROJECT");
      expect(resolveRule("src/b.py", rules)).toContain("Mutable default arguments");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
