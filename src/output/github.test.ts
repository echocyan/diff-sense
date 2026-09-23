import { describe, it, expect } from "vitest";
import { formatGithub, type GithubReview } from "./github";
import type { DiffEntry, Finding } from "../types";

/** src/foo.ts 的 diff：两个 hunk，新侧分别为 10–13 行与 30–31 行 */
const entry: DiffEntry = {
  path: "src/foo.ts",
  status: "modified",
  insertions: 2,
  deletions: 1,
  diff: [
    "diff --git a/src/foo.ts b/src/foo.ts",
    "--- a/src/foo.ts",
    "+++ b/src/foo.ts",
    "@@ -10,3 +10,4 @@ function f() {",
    " const a = 1;",
    "-const b = 2;",
    "+const b = 3;",
    "+const c = 4;",
    " return a;",
    "@@ -29,2 +30,2 @@",
    " x();",
    " y();",
  ].join("\n"),
};

/** 构造一条发现，默认锚定在第一个 hunk 内的第 11 行 */
function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    path: "src/foo.ts",
    line: 11,
    endLine: 11,
    severity: "high",
    category: "bug",
    content: "b 的取值错误",
    existingCode: "const b = 3;",
    ...overrides,
  };
}

function format(findings: Finding[]): GithubReview {
  return JSON.parse(formatGithub({ findings, entries: [entry], totalTokens: 0, durationMs: 0 }));
}

describe("formatGithub", () => {
  it("diff 内的单行发现作为行内评论，含严重程度、分类、内容与建议代码", () => {
    const { review, summary } = format([finding({ suggestionCode: "const b = 2;" })]);
    expect(summary).toBeNull();
    expect(review?.event).toBe("COMMENT");
    expect(review?.body).toContain("diff-sense");
    expect(review?.comments).toHaveLength(1);
    const [comment] = review!.comments;
    expect(comment).toMatchObject({ path: "src/foo.ts", line: 11, side: "RIGHT" });
    expect(comment).not.toHaveProperty("start_line");
    expect(comment.body).toContain("HIGH");
    expect(comment.body).toContain("bug");
    expect(comment.body).toContain("b 的取值错误");
    expect(comment.body).toContain("```ts\nconst b = 2;\n```");
  });

  it("同一 hunk 内的多行发现带 start_line", () => {
    const { review } = format([finding({ line: 10, endLine: 13 })]);
    expect(review?.comments[0]).toMatchObject({
      start_line: 10,
      start_side: "RIGHT",
      line: 13,
      side: "RIGHT",
    });
  });

  it("未锚定、落在 hunk 外或跨 hunk 的发现汇入摘要评论", () => {
    const { review, summary } = format([
      finding({ line: 0, endLine: 0, content: "未锚定" }),
      finding({ line: 20, endLine: 20, severity: "low", content: "hunk 之外" }),
      finding({ line: 12, endLine: 30, severity: "medium", content: "跨 hunk" }),
      finding({ path: "src/other.ts", content: "不在 diff 中的文件" }),
    ]);
    expect(review).toBeNull();
    expect(summary?.match(/^- /gm)).toHaveLength(4);
    expect(summary).toContain("`src/foo.ts`");
    expect(summary).toContain("`src/foo.ts:20`");
    expect(summary).toContain("`src/foo.ts:12-30`");
    for (const text of ["未锚定", "hunk 之外", "跨 hunk", "不在 diff 中的文件"]) {
      expect(summary).toContain(text);
    }
  });

  it("行内与摘要同时存在时各归其位", () => {
    const { review, summary } = format([finding(), finding({ line: 0, endLine: 0 })]);
    expect(review?.comments).toHaveLength(1);
    expect(summary).not.toBeNull();
  });

  it("路径含反引号时摘要中的行内代码不被截断", () => {
    const { summary } = format([finding({ path: "a`b.ts", line: 0, endLine: 0 })]);
    expect(summary).toContain("``a`b.ts``");
  });

  it("没有发现时 review 与 summary 均为 null", () => {
    expect(format([])).toEqual({ review: null, summary: null });
  });

  it("建议代码自身含代码围栏时使用更长的围栏", () => {
    const { review } = format([finding({ suggestionCode: "```\nx\n```" })]);
    expect(review?.comments[0].body).toContain("````ts\n```\nx\n```\n````");
  });
});
