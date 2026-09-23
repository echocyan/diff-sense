import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, access, symlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTools } from "./tools";
import type { Finding } from "../types";

const exec = promisify(execFile);

let root: string;
let repo: string;

/** 直接调用工具的 execute，绕过 LLM */
async function run(name: string, input: Record<string, unknown>): Promise<string> {
  const tools = createTools(repo, [], async () => ({ path: "unknown", line: 0, endLine: 0 }));
  return tools[name].execute!(input, { toolCallId: "t", messages: [] } as never) as Promise<string>;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "diff-sense-tools-"));
  repo = join(root, "repo");
  await mkdir(repo);
  await writeFile(join(root, "outside.txt"), "TOP_SECRET");
  await writeFile(join(repo, "a.ts"), "export const flag = '-n';\n");
  await symlink(join(root, "outside.txt"), join(repo, "link.txt"));
  await exec("git", ["init", "-q"], { cwd: repo });
  await exec("git", ["add", "."], { cwd: repo });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("code_comment", () => {
  it("记录经锚定后的路径与行号，并在结果中返回位置", async () => {
    const findings: Finding[] = [];
    const tools = createTools(repo, findings, async (code, path) => ({
      path: path ?? "src/inferred.ts",
      line: code === "x()" ? 42 : 0,
      endLine: code === "x()" ? 43 : 0,
    }));
    const out = await tools.code_comment.execute!(
      { severity: "high", category: "bug", content: "问题", existing_code: "x()" },
      { toolCallId: "t", messages: [] } as never,
    );
    expect(findings[0]).toMatchObject({ path: "src/inferred.ts", line: 42, endLine: 43 });
    expect(out).toContain("src/inferred.ts:42");
  });
});

describe("file_read", () => {
  it("读取仓库内文件", async () => {
    expect(await run("file_read", { path: "a.ts" })).toContain("flag");
  });

  it.each(["../outside.txt", "/etc/passwd", "link.txt"])("拒绝读取仓库外路径: %s", async (path) => {
    const out = await run("file_read", { path });
    expect(out).not.toContain("TOP_SECRET");
    expect(out).toMatch(/^Error:/);
  });
});

describe("code_search", () => {
  it("以 - 开头的查询按字面搜索，不被当作 git 选项", async () => {
    expect(await run("code_search", { query: "-n" })).toContain("a.ts");
  });

  it("无法通过选项注入执行命令", async () => {
    const marker = join(root, "pwned");
    await run("code_search", { query: `--open-files-in-pager=touch ${marker}` });
    await expect(access(marker)).rejects.toThrow();
  });
});
