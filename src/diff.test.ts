import { describe, it, expect, vi } from "vitest";
import { parseDiff, getCommitDiff, getRangeDiff, getWorkspaceDiff, getDiff } from "./diff";

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

const RENAMED_DIFF = `diff --git a/src/old.ts b/src/new.ts
similarity index 90%
rename from src/old.ts
rename to src/new.ts
index abc1234..def5678 100644
--- a/src/old.ts
+++ b/src/new.ts
@@ -1,2 +1,2 @@
-const old = 1;
+const renamed = 1;
`;

const DELETED_DIFF = `diff --git a/src/removed.ts b/src/removed.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/removed.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const a = 1;
-const b = 2;
-export { a, b };
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

  it("检测重命名文件", () => {
    const entries = parseDiff(RENAMED_DIFF);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("renamed");
    expect(entries[0].path).toBe("src/new.ts");
  });

  it("检测删除文件", () => {
    const entries = parseDiff(DELETED_DIFF);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("deleted");
    expect(entries[0].deletions).toBe(3);
  });
});

// mock execFile 为 vi.fn()，并让 promisify 直接返回原函数
// 这样源码中的 exec = promisify(execFile) 实际就是 mock 版 execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:util", () => ({
  promisify: (fn: unknown) => fn,
}));

const { execFile } = await import("node:child_process");
// 双重类型断言：vi.mocked 的返回类型与 vi.fn() 不完全兼容，需要中转 unknown
const mockExec = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>;

describe("getCommitDiff", () => {
  it("调用 git diff sha~1 sha", async () => {
    mockExec.mockResolvedValueOnce({ stdout: SAMPLE_DIFF, stderr: "" });
    const entries = await getCommitDiff("abc123", "/tmp/repo");
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["diff", "abc123~1", "abc123", "--unified=3"],
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
    expect(entries).toHaveLength(2);
  });

  it("空输出返回空数组", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    const entries = await getCommitDiff("abc123", "/tmp/repo");
    expect(entries).toEqual([]);
  });

  it("初始提交时回退到 git show", async () => {
    mockExec.mockRejectedValueOnce(new Error("unknown revision abc123~1"));
    mockExec.mockResolvedValueOnce({ stdout: SAMPLE_DIFF, stderr: "" });
    const entries = await getCommitDiff("abc123", "/tmp/repo");
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["show", "abc123", "--format=", "--unified=3"],
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
    expect(entries).toHaveLength(2);
  });
});

describe("getRangeDiff", () => {
  it("调用 git diff from to", async () => {
    mockExec.mockResolvedValueOnce({ stdout: SAMPLE_DIFF, stderr: "" });
    const entries = await getRangeDiff("main", "feature", "/tmp/repo");
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["diff", "main", "feature", "--unified=3"],
      expect.objectContaining({ cwd: "/tmp/repo" }),
    );
    expect(entries).toHaveLength(2);
  });

  it("空输出返回空数组", async () => {
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    const entries = await getRangeDiff("main", "feature", "/tmp/repo");
    expect(entries).toEqual([]);
  });
});

describe("getWorkspaceDiff", () => {
  it("合并 staged 和 unstaged diff", async () => {
    mockExec.mockResolvedValueOnce({ stdout: SAMPLE_DIFF, stderr: "" });
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    const entries = await getWorkspaceDiff("/tmp/repo");
    expect(entries).toHaveLength(2);
  });
});

describe("getDiff", () => {
  it("workspace 模式调用 getWorkspaceDiff", async () => {
    mockExec.mockResolvedValueOnce({ stdout: SAMPLE_DIFF, stderr: "" });
    mockExec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    const entries = await getDiff({ type: "workspace" }, "/tmp/repo");
    expect(entries).toHaveLength(2);
  });

  it("commit 模式调用 getCommitDiff", async () => {
    mockExec.mockResolvedValueOnce({ stdout: SAMPLE_DIFF, stderr: "" });
    const entries = await getDiff({ type: "commit", sha: "abc123" }, "/tmp/repo");
    expect(entries).toHaveLength(2);
  });

  it("range 模式调用 getRangeDiff", async () => {
    mockExec.mockResolvedValueOnce({ stdout: SAMPLE_DIFF, stderr: "" });
    const entries = await getDiff({ type: "range", from: "main", to: "feature" }, "/tmp/repo");
    expect(entries).toHaveLength(2);
  });
});
