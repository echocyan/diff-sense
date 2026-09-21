import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff.js";

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 export { a };
diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,2 @@
+export const bar = true;
+export const baz = false;
`;

describe("parseDiff", () => {
  it("解析多文件 diff", () => {
    const entries = parseDiff(SAMPLE_DIFF);
    expect(entries).toHaveLength(2);
  });

  it("提取正确的路径", () => {
    const entries = parseDiff(SAMPLE_DIFF);
    expect(entries[0].path).toBe("src/foo.ts");
    expect(entries[1].path).toBe("src/bar.ts");
  });

  it("检测文件状态", () => {
    const entries = parseDiff(SAMPLE_DIFF);
    expect(entries[0].status).toBe("modified");
    expect(entries[1].status).toBe("added");
  });

  it("统计增删行数", () => {
    const entries = parseDiff(SAMPLE_DIFF);
    expect(entries[0].insertions).toBe(2);
    expect(entries[0].deletions).toBe(1);
    expect(entries[1].insertions).toBe(2);
    expect(entries[1].deletions).toBe(0);
  });

  it("空输入返回空数组", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("   ")).toEqual([]);
  });
});
