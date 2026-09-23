import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getRepoRoot, readNewFile } from "./diff";

// diff.test.ts 中 mock 了 child_process，读取真实仓库的用例放在本文件
const exec = promisify(execFile);

let repo: string;

/** 在临时仓库中执行 git 命令 */
async function git(...args: string[]): Promise<void> {
  await exec("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "diff-sense-read-"));
  await git("init", "-q");
  await writeFile(join(repo, "a.ts"), "v1\n");
  await git("add", ".");
  await git("commit", "-q", "-m", "c1");
  await writeFile(join(repo, "a.ts"), "v2\n");
  await git("commit", "-q", "-am", "c2");
  await writeFile(join(repo, "a.ts"), "working\n");
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("readNewFile", () => {
  it("workspace 模式读取工作区文件", async () => {
    expect(await readNewFile({ type: "workspace" }, "a.ts", repo)).toBe("working\n");
  });

  it("commit 模式读取该提交中的版本", async () => {
    expect(await readNewFile({ type: "commit", sha: "HEAD~1" }, "a.ts", repo)).toBe("v1\n");
  });

  it("range 模式读取 to 端的版本", async () => {
    expect(await readNewFile({ type: "range", from: "HEAD~1", to: "HEAD" }, "a.ts", repo)).toBe(
      "v2\n",
    );
  });

  it("文件不存在时返回 undefined", async () => {
    expect(await readNewFile({ type: "commit", sha: "HEAD" }, "missing.ts", repo)).toBeUndefined();
    expect(await readNewFile({ type: "workspace" }, "missing.ts", repo)).toBeUndefined();
  });
});

describe("getRepoRoot", () => {
  it("不在 git 仓库中时给出明确提示", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diff-sense-norepo-"));
    try {
      await expect(getRepoRoot(dir)).rejects.toThrow(`${dir} 不在 git 仓库中`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("其他失败保留原始错误，不误报为非仓库", async () => {
    const missing = join(tmpdir(), "diff-sense-missing-dir-xyz");
    const err = await getRepoRoot(missing).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("不在 git 仓库中");
  });
});
