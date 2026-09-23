import { describe, it, expect } from "vitest";
import { buildUserPrompt } from "./prompts";
import type { DiffEntry } from "../types";

const ENTRY: DiffEntry = {
  path: "src/a.ts",
  status: "modified",
  diff: "diff --git a/src/a.ts b/src/a.ts",
  insertions: 1,
  deletions: 0,
};

/** 提取 <user_task> 区块内容 */
function userTask(prompt: string): string | undefined {
  return prompt.match(/<user_task>\n([\s\S]*)\n<\/user_task>/)?.[1];
}

describe("buildUserPrompt", () => {
  it("规则文本注入 <user_task> 的 Review Checklist 区域", () => {
    const task = userTask(buildUserPrompt([ENTRY], { checklist: "CHECK A\nCHECK B" }));
    expect(task).toContain("### Review Checklist\nCHECK A\nCHECK B");
  });

  it("业务上下文位于 Review Checklist 之前，未提供时不输出该区域", () => {
    const withBg = userTask(buildUserPrompt([ENTRY], { checklist: "C", background: "BG" }))!;
    expect(withBg.indexOf("### Requirement Background\nBG")).toBeLessThan(
      withBg.indexOf("### Review Checklist"),
    );
    expect(withBg.indexOf("### Requirement Background")).toBeGreaterThanOrEqual(0);

    const noBg = userTask(buildUserPrompt([ENTRY], { checklist: "C" }))!;
    expect(noBg).not.toContain("Requirement Background");
  });

  it("文件路径中的 & 与双引号在 path 属性里转义", () => {
    const prompt = buildUserPrompt([{ ...ENTRY, path: 'a"b&c.ts' }], { checklist: "C" });
    expect(prompt).toContain('<file path="a&quot;b&amp;c.ts">');
  });
});
