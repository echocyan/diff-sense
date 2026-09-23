import { describe, it, expect } from "vitest";
import { stripVTControlCharacters as plain } from "node:util";
import { formatText } from "./text";
import type { Finding } from "../types";

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

describe("formatText", () => {
  it("已锚定发现展示 path:line", () => {
    const out = plain(formatText({ findings: [finding()], totalTokens: 0, durationMs: 0 }));
    expect(out).toContain("src/foo.ts:42");
  });

  it("未锚定发现单独标记，不展示行号", () => {
    const out = plain(
      formatText({ findings: [finding({ line: 0, endLine: 0 })], totalTokens: 0, durationMs: 0 }),
    );
    expect(out).toContain("未锚定");
    expect(out).not.toContain("src/foo.ts:0");
  });
});
