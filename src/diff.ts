import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffEntry } from "./types";

const exec = promisify(execFile);
// git diff 输出缓冲区上限 10 MB，超大仓库可能需要调大
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
// git 内置的空树对象，用于尚无提交的仓库
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

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

/**
 * 获取工作区差异（staged + unstaged + untracked）
 *
 * 用 `git diff HEAD` 一次性对比 HEAD 与工作区，避免同一文件在 staged / unstaged 中各出一条；
 * 未跟踪文件（遵循 .gitignore）另行生成新增文件 diff
 */
export async function getWorkspaceDiff(cwd: string): Promise<DiffEntry[]> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["diff", "HEAD", "--unified=3"], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    }));
  } catch {
    // 尚无提交时 HEAD 不存在，改为对比空树
    ({ stdout } = await exec("git", ["diff", EMPTY_TREE, "--unified=3"], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    }));
  }
  const tracked = stdout.trim() ? parseDiff(stdout) : [];
  return [...tracked, ...(await getUntrackedDiff(cwd))];
}

/** 为未跟踪文件生成新增文件 diff（逐个串行执行，避免大量未跟踪文件时进程数暴涨） */
async function getUntrackedDiff(cwd: string): Promise<DiffEntry[]> {
  const { stdout } = await exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd,
    maxBuffer: GIT_MAX_BUFFER,
  });
  const files = stdout.split("\0").filter(Boolean);

  const entries: DiffEntry[] = [];
  for (const file of files) {
    let diff: string;
    try {
      ({ stdout: diff } = await exec(
        "git",
        ["diff", "--no-index", "--unified=3", "--", "/dev/null", file],
        { cwd, maxBuffer: GIT_MAX_BUFFER },
      ));
    } catch (err) {
      // --no-index 有差异时退出码为 1，属正常情况，diff 内容在 stdout 中
      const e = err as { code?: number; stdout?: string };
      if (e.code !== 1 || e.stdout === undefined) throw err;
      diff = e.stdout;
    }
    if (diff.trim()) entries.push(...parseDiff(diff));
  }
  return entries;
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
    const lines = chunk.split("\n");
    const pathB = parseHeaderPath(lines[0]);
    if (!pathB) continue;

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

/**
 * 从 diff 头部 `a/path b/path` 提取 b/ 侧（变更后）路径
 *
 * 含非 ASCII 或特殊字符的路径会被 git 加引号并转义，如 `"b/\\344\\270\\255.ts"`
 */
function parseHeaderPath(header: string): string | undefined {
  const quoted = header.match(/ "b\/((?:[^"\\]|\\.)*)"$/);
  if (quoted) return unquoteCPath(quoted[1]);
  // a/ 侧可能单独加了引号（如重命名自非 ASCII 路径）
  const plain = header.match(/^(?:"(?:[^"\\]|\\.)*"|a\/.+?) b\/(.+)$/);
  return plain?.[1];
}

/** git C 风格转义中的单字符转义 */
const C_ESCAPES: Record<string, number> = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 };

/** 还原 git 的 C 风格路径转义（\\"、\\\\、\\t 等，以及八进制表示的 UTF-8 字节） */
function unquoteCPath(s: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") {
      const cp = s.codePointAt(i)!;
      bytes.push(...Buffer.from(String.fromCodePoint(cp), "utf-8"));
      if (cp > 0xffff) i++;
    } else if (/[0-7]{3}/.test(s.slice(i + 1, i + 4))) {
      bytes.push(parseInt(s.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      const next = s[++i];
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString("utf-8");
}
