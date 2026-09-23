import type { DiffEntry } from "./types";

/** 发现锚定到的代码位置；line=0 表示未锚定 */
export interface Location {
  /** 文件路径 */
  path: string;
  /** 起始行号（变更后文件，1 起），未锚定时为 0 */
  line: number;
  /** 结束行号，未锚定时为 0 */
  endLine: number;
}

/** 带行号的一行代码 */
interface NumberedLine {
  line: number;
  text: string;
}

/**
 * 将 existing_code 锚定到变更后文件的行号
 *
 * 第一步：在 hunk 新侧（上下文行 + 新增行）滑动窗口匹配，空白不敏感；
 * 第二步：未命中时扫描变更后的完整文件；
 * 第三步：仍未命中则回退到 line=0（未锚定）
 *
 * 仅在送审文件（entries）范围内查找，不读取其他文件
 */
export async function anchor(
  existingCode: string,
  path: string | undefined,
  entries: DiffEntry[],
  readNewFile: (path: string) => Promise<string | undefined>,
): Promise<Location> {
  const candidates = path === undefined ? entries : entries.filter((e) => e.path === path);
  for (const e of candidates) {
    for (const hunk of hunkNewSides(e.diff)) {
      const range = matchSnippet(existingCode, hunk);
      if (range) return { path: e.path, ...range };
    }
  }
  for (const e of candidates) {
    const content = await readNewFile(e.path);
    if (content === undefined) continue;
    const lines = content.split("\n").map((text, i) => ({ line: i + 1, text }));
    const range = matchSnippet(existingCode, lines);
    if (range) return { path: e.path, ...range };
  }
  // 未传 path 且无法推断时：单文件审查即为该文件，否则无从确定
  const fallback = path ?? (entries.length === 1 ? entries[0].path : "unknown");
  return { path: fallback, line: 0, endLine: 0 };
}

/** 提取每个 hunk 新侧的行（跳过删除行），附带变更后文件中的行号 */
function hunkNewSides(diff: string): NumberedLine[][] {
  const hunks: NumberedLine[][] = [];
  let current: NumberedLine[] | undefined;
  let line = 0;
  for (const raw of diff.split("\n")) {
    const header = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      current = [];
      hunks.push(current);
      line = Number(header[1]);
    } else if (current && (raw.startsWith(" ") || raw.startsWith("+"))) {
      current.push({ line: line++, text: raw.slice(1) });
    }
  }
  return hunks;
}

/** 在带行号的代码中滑动窗口查找片段，返回首个命中的行号范围 */
function matchSnippet(
  snippet: string,
  lines: NumberedLine[],
): { line: number; endLine: number } | undefined {
  const target = stripDiffPrefix(snippet.split("\n")).map(normalize).filter(Boolean);
  const source = lines.map((l) => ({ ...l, text: normalize(l.text) })).filter((l) => l.text);
  if (target.length === 0) return undefined;
  for (let i = 0; i + target.length <= source.length; i++) {
    if (target.every((t, j) => source[i + j].text === t)) {
      return { line: source[i].line, endLine: source[i + target.length - 1].line };
    }
  }
  return undefined;
}

/** LLM 常照抄 diff 格式：若所有非空行均以 + 开头，去掉该前缀 */
function stripDiffPrefix(lines: string[]): string[] {
  const nonBlank = lines.filter((l) => l.trim());
  if (nonBlank.length === 0 || !nonBlank.every((l) => l.startsWith("+"))) return lines;
  return lines.map((l) => l.slice(1));
}

/** 去除全部空白字符，实现空白不敏感比较 */
function normalize(text: string): string {
  return text.replace(/\s+/g, "");
}
