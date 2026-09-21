import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffEntry } from "./types";

const exec = promisify(execFile);
// git diff 输出缓冲区上限 10 MB，超大仓库可能需要调大
const GIT_MAX_BUFFER = 10 * 1024 * 1024;

/** diff 获取模式：工作区 / 单次提交 / 两个引用之间的范围 */
export type DiffMode =
  | { type: "workspace" }
  | { type: "commit"; sha: string }
  | { type: "range"; from: string; to: string };

/** 按模式获取 diff */
export async function getDiff(mode: DiffMode, cwd: string): Promise<DiffEntry[]> {
  switch (mode.type) {
    case "workspace":
      return getWorkspaceDiff(cwd);
    case "commit":
      return getCommitDiff(mode.sha, cwd);
    case "range":
      return getRangeDiff(mode.from, mode.to, cwd);
  }
}

/** 获取工作区差异（staged + unstaged） */
export async function getWorkspaceDiff(cwd: string): Promise<DiffEntry[]> {
  const [staged, unstaged] = await Promise.all([
    exec("git", ["diff", "--cached", "--unified=3"], { cwd, maxBuffer: GIT_MAX_BUFFER }),
    exec("git", ["diff", "--unified=3"], { cwd, maxBuffer: GIT_MAX_BUFFER }),
  ]);

  const combined = [staged.stdout, unstaged.stdout].filter(Boolean).join("\n");
  if (!combined.trim()) return [];

  return parseDiff(combined);
}

/** 获取单个提交的 diff，初始提交时回退到 git show */
export async function getCommitDiff(sha: string, cwd: string): Promise<DiffEntry[]> {
  try {
    const { stdout } = await exec("git", ["diff", `${sha}~1`, sha, "--unified=3"], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    });
    if (!stdout.trim()) return [];
    return parseDiff(stdout);
  } catch {
    // 初始提交没有父提交，sha~1 会报错，回退到 git show
    const { stdout } = await exec("git", ["show", sha, "--format=", "--unified=3"], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    });
    if (!stdout.trim()) return [];
    return parseDiff(stdout);
  }
}

/** 获取两个引用之间的 diff */
export async function getRangeDiff(from: string, to: string, cwd: string): Promise<DiffEntry[]> {
  const { stdout } = await exec("git", ["diff", from, to, "--unified=3"], {
    cwd,
    maxBuffer: GIT_MAX_BUFFER,
  });
  if (!stdout.trim()) return [];
  return parseDiff(stdout);
}

/** 解析 unified diff 为结构化对象 */
export function parseDiff(raw: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  // 按 "diff --git " 分割，每个块对应一个文件的 diff
  const fileDiffs = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileDiffs) {
    // 从 "a/path b/path" 头部提取文件路径，取 b/ 侧（变更后路径）
    const headerMatch = chunk.match(/^a\/(.+?) b\/(.+)/m);
    if (!headerMatch) continue;

    const pathB = headerMatch[2];
    const lines = chunk.split("\n");

    // 通过 diff 元数据行判定文件状态：新增 / 删除 / 重命名 / 修改
    let status: DiffEntry["status"] = "modified";
    if (lines.some((l) => l.startsWith("new file mode"))) status = "added";
    else if (lines.some((l) => l.startsWith("deleted file mode"))) status = "deleted";
    else if (lines.some((l) => l.startsWith("rename from"))) status = "renamed";

    // 统计增删行数，跳过 +++ / --- 文件标记行
    let insertions = 0;
    let deletions = 0;
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) insertions++;
      else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    entries.push({
      path: pathB,
      status,
      diff: `diff --git ${chunk}`,
      insertions,
      deletions,
    });
  }

  return entries;
}
