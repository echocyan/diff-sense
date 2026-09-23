import { describe, it, expect } from "vitest";
import { stripVTControlCharacters as plain } from "node:util";
import { formatText } from "./text";
import type { Finding, ReviewResult } from "../types";

/** 创建默认 Finding，可通过 overrides 覆盖任意字段 */
function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    path: "src/foo.ts",
    line: 42,
    endLine: 42,
    severity: "high",
    category: "bug",
    content: "空指针",
    existingCode: "a.b()",
    ...overrides,
  };
}

/** 以给定发现构造审查结果，其余字段与输出无关 */
function result(findings: Finding[]): ReviewResult {
  return { findings, entries: [], totalTokens: 0, durationMs: 0 };
}

describe("formatText", () => {
  it("已锚定发现展示 path:line", () => {
    const out = plain(formatText(result([finding()])));
    expect(out).toContain("src/foo.ts:42");
  });

  it("多行发现展示起止行范围", () => {
    const out = plain(formatText(result([finding({ endLine: 45 })])));
    expect(out).toContain("src/foo.ts:42-45");
  });

  it("未锚定发现单独标记，不展示行号", () => {
    const out = plain(formatText(result([finding({ line: 0, endLine: 0 })])));
    expect(out).toContain("未锚定");
    expect(out).not.toContain("src/foo.ts:0");
  });
});
