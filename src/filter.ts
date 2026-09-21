import type { DiffEntry } from "./types.js";

const BINARY_MARKER = "Binary files";

/** 最小过滤：排除二进制文件和删除的文件 */
export function filterFiles(entries: DiffEntry[]): DiffEntry[] {
  return entries.filter((e) => {
    if (e.status === "deleted") return false;
    if (e.diff.includes(BINARY_MARKER)) return false;
    return true;
  });
}
