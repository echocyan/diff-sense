import { describe, it, expect } from "vitest";
import { globToRegExp } from "./glob";

describe("globToRegExp", () => {
  it("{a,b} 展开为多选一", () => {
    const re = globToRegExp("**/*.{ts,tsx}");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/a.tsx")).toBe(true);
    expect(re.test("src/a.js")).toBe(false);
  });

  it("默认区分大小写，ignoreCase 时不区分", () => {
    expect(globToRegExp("**/Dockerfile*").test("app/dockerfile")).toBe(false);
    expect(globToRegExp("**/Dockerfile*", { ignoreCase: true }).test("app/dockerfile")).toBe(true);
  });

  it("未闭合的 { 按字面匹配，不抛错", () => {
    expect(globToRegExp("src/{a,b.ts").test("src/{a,b.ts")).toBe(true);
  });
});
