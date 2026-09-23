import { describe, it, expect } from "vitest";
import { formatJson } from "./json";
import type { Finding, ReviewResult } from "../types";

const finding: Finding = {
  content: "空指针",
  category: "bug",
  severity: "high",
  endLine: 45,
  line: 42,
  path: "src/foo.ts",
  existingCode: "a.b()",
};

/** 以给定发现构造审查结果，其余字段与输出无关 */
function result(findings: Finding[]): ReviewResult {
  return { findings, entries: [], totalTokens: 0, durationMs: 0 };
}

describe("formatJson", () => {
  it("输出可解析的发现数组，字段齐全且顺序固定，缺省建议为 null", () => {
    const out = formatJson(result([finding]));
    const parsed = JSON.parse(out);
    expect(parsed).toEqual([
      {
        path: "src/foo.ts",
        line: 42,
        endLine: 45,
        severity: "high",
        category: "bug",
        content: "空指针",
        existingCode: "a.b()",
        suggestionCode: null,
      },
    ]);
    expect(Object.keys(parsed[0])).toEqual([
      "path",
      "line",
      "endLine",
      "severity",
      "category",
      "content",
      "existingCode",
      "suggestionCode",
    ]);
  });

  it("无发现时输出空数组", () => {
    expect(JSON.parse(formatJson(result([])))).toEqual([]);
  });
});
