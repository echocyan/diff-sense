import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffEntry } from "./types.js";

const exec = promisify(execFile);

/** 获取工作区差异（staged + unstaged） */
export async function getWorkspaceDiff(cwd: string): Promise<DiffEntry[]> {
  const [staged, unstaged] = await Promise.all([
    exec("git", ["diff", "--cached", "--unified=3"], { cwd, maxBuffer: 10 * 1024 * 1024 }),
    exec("git", ["diff", "--unified=3"], { cwd, maxBuffer: 10 * 1024 * 1024 }),
  ]);

  const combined = [staged.stdout, unstaged.stdout].filter(Boolean).join("\n");
  if (!combined.trim()) return [];

  return parseDiff(combined);
}

/** 解析 unified diff 为结构化对象 */
export function parseDiff(raw: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const fileDiffs = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileDiffs) {
    const headerMatch = chunk.match(/^a\/(.+?) b\/(.+)/m);
    if (!headerMatch) continue;

    const pathB = headerMatch[2];
    const lines = chunk.split("\n");

    let status: DiffEntry["status"] = "modified";
    if (lines.some((l) => l.startsWith("new file mode"))) status = "added";
    else if (lines.some((l) => l.startsWith("deleted file mode"))) status = "deleted";
    else if (lines.some((l) => l.startsWith("rename from"))) status = "renamed";

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
