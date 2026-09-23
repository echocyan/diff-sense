import { describe, it, expect } from "vitest";
import { anchor } from "./anchor";
import type { DiffEntry } from "./types";

// 新侧行号：10 ctx、11 +const a、12 +const b、13 ctx；第 20 行起第二个 hunk
const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,3 +10,4 @@ function f() {
 const keep = 1;
-const old = 0;
+const a = foo(1, 2);
+const b = bar();
 return keep;
@@ -30,2 +20,3 @@
 const x = 1;
+if (x) run();
 end();
`;

function entry(path: string, diff = DIFF): DiffEntry {
  return { path, status: "modified", diff, insertions: 3, deletions: 1 };
}

/** 未提供文件内容的读取器 */
const noFile = async () => undefined;

describe("anchor", () => {
  it("在 hunk 新侧精确匹配单行", async () => {
    const loc = await anchor("const a = foo(1, 2);", "src/a.ts", [entry("src/a.ts")], noFile);
    expect(loc).toEqual({ path: "src/a.ts", line: 11, endLine: 11 });
  });

  it("空白差异不影响匹配", async () => {
    const loc = await anchor("  const a=foo(1,2);\t", "src/a.ts", [entry("src/a.ts")], noFile);
    expect(loc).toEqual({ path: "src/a.ts", line: 11, endLine: 11 });
  });

  it("多行片段匹配返回起止行，行号按新侧计算（跳过删除行）", async () => {
    const snippet = "const keep = 1;\nconst a = foo(1, 2);\n\nconst b = bar();";
    const loc = await anchor(snippet, "src/a.ts", [entry("src/a.ts")], noFile);
    expect(loc).toEqual({ path: "src/a.ts", line: 10, endLine: 12 });
  });

  it("在后续 hunk 中按其起始行号计算", async () => {
    const loc = await anchor("if (x) run();", "src/a.ts", [entry("src/a.ts")], noFile);
    expect(loc).toEqual({ path: "src/a.ts", line: 21, endLine: 21 });
  });

  it("hunk 未命中时扫描变更后的完整文件", async () => {
    const content = "line1\nline2\nfunction helper() {\n  return 42;\n}\n";
    const read = async (p: string) => (p === "src/a.ts" ? content : undefined);
    const loc = await anchor(
      "function helper() {\n return 42;",
      "src/a.ts",
      [entry("src/a.ts")],
      read,
    );
    expect(loc).toEqual({ path: "src/a.ts", line: 3, endLine: 4 });
  });

  it("均未命中时回退到 line=0，保留给定路径", async () => {
    const loc = await anchor("nothing like this", "src/a.ts", [entry("src/a.ts")], noFile);
    expect(loc).toEqual({ path: "src/a.ts", line: 0, endLine: 0 });
  });

  it("片段带 diff 的 + 前缀时仍可匹配", async () => {
    const snippet = "+const a = foo(1, 2);\n+const b = bar();";
    const loc = await anchor(snippet, "src/a.ts", [entry("src/a.ts")], noFile);
    expect(loc).toEqual({ path: "src/a.ts", line: 11, endLine: 12 });
  });

  it("未传 path 时按匹配到的文件推断路径", async () => {
    const other = `@@ -1,1 +1,2 @@\n ctx\n+const only = here();\n`;
    const entries = [entry("src/a.ts"), entry("src/b.ts", other)];
    const loc = await anchor("const only = here();", undefined, entries, noFile);
    expect(loc).toEqual({ path: "src/b.ts", line: 2, endLine: 2 });
  });

  it("未传 path 且未命中时，单文件审查取该文件路径", async () => {
    const loc = await anchor("nothing like this", undefined, [entry("src/a.ts")], noFile);
    expect(loc).toEqual({ path: "src/a.ts", line: 0, endLine: 0 });
  });
});
