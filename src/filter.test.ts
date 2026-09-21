import { describe, it, expect } from "vitest";
import { filterFiles } from "./filter.js";
import type { DiffEntry } from "./types.js";

function entry(overrides: Partial<DiffEntry> = {}): DiffEntry {
  return {
    path: "src/test.ts",
    status: "modified",
    diff: "diff --git ...",
    insertions: 1,
    deletions: 0,
    ...overrides,
  };
}

describe("filterFiles", () => {
  it("保留普通文件", () => {
    const result = filterFiles([entry()]);
    expect(result).toHaveLength(1);
  });

  it("排除二进制文件", () => {
    const result = filterFiles([entry({ diff: "Binary files a/img.png and b/img.png differ" })]);
    expect(result).toHaveLength(0);
  });

  it("排除已删除文件", () => {
    const result = filterFiles([entry({ status: "deleted" })]);
    expect(result).toHaveLength(0);
  });
});
