import { hunkNewSides } from "../diff";
import type { DiffEntry, Finding, ReviewResult } from "../types";

/** Pull Request Review API 的一条行内评论（均评论变更后的一侧） */
export interface GithubReviewComment {
  path: string;
  /** 评论所在行；多行评论时为最后一行 */
  line: number;
  side: "RIGHT";
  /** 多行评论的起始行 */
  start_line?: number;
  start_side?: "RIGHT";
  body: string;
}

/** GitHub 输出：PR Review 请求体与摘要评论，供 GitHub Action 直接发布 */
export interface GithubReview {
  /** `POST /repos/{owner}/{repo}/pulls/{number}/reviews` 的请求体；没有行内评论时为 null */
  review: { event: "COMMENT"; comments: GithubReviewComment[] } | null;
  /** 无法作为行内评论的发现，聚合为一条 PR 普通评论的 Markdown；没有时为 null */
  summary: string | null;
}

/**
 * 将审查结果格式化为 GitHub PR 评论载荷（JSON）
 *
 * Review API 只接受落在 diff hunk 内的行，任一评论越界整个请求都会失败；
 * 因此只有整段位于同一 hunk 新侧的发现作为行内评论，其余（未锚定、hunk 外、跨 hunk）汇入摘要评论
 */
export function formatGithub(result: ReviewResult): string {
  const hunkRanges = new Map(result.entries.map((e) => [e.path, newSideRanges(e)]));
  const inline: Finding[] = [];
  const rest: Finding[] = [];
  for (const f of result.findings) {
    const ranges = hunkRanges.get(f.path) ?? [];
    const inHunk = f.line > 0 && ranges.some(([start, end]) => start <= f.line && f.endLine <= end);
    (inHunk ? inline : rest).push(f);
  }

  const output: GithubReview = {
    review: inline.length > 0 ? { event: "COMMENT", comments: inline.map(toComment) } : null,
    summary: rest.length > 0 ? formatSummary(rest) : null,
  };
  return JSON.stringify(output, null, 2);
}

/** 每个 hunk 新侧的行号范围 [起, 止]；纯删除的 hunk 没有新侧，不产生范围 */
function newSideRanges(entry: DiffEntry): [number, number][] {
  return hunkNewSides(entry.diff)
    .filter((lines) => lines.length > 0)
    .map((lines) => [lines[0].line, lines[lines.length - 1].line]);
}

/** 构造行内评论；多行发现使用 start_line 标出起始行 */
function toComment(f: Finding): GithubReviewComment {
  const body = [heading(f), "", f.content, ...suggestion(f)].join("\n");
  if (f.endLine > f.line) {
    return {
      path: f.path,
      start_line: f.line,
      start_side: "RIGHT",
      line: f.endLine,
      side: "RIGHT",
      body,
    };
  }
  return { path: f.path, line: f.line, side: "RIGHT", body };
}

/** 摘要评论：说明原因后逐条列出发现，位置无法定位到行时只写路径 */
function formatSummary(findings: Finding[]): string {
  const items = findings.map((f) => {
    const location = f.line > 0 ? `${f.path}:${lineRange(f)}` : f.path;
    const detail = [f.content, ...suggestion(f)].map(indent).join("\n");
    return `- ${heading(f)} · \`${location}\`\n${detail}`;
  });
  return [
    "## diff-sense 审查摘要",
    "",
    `以下 ${findings.length} 条发现无法定位到本次 diff 的代码行，未作为行内评论发布：`,
    "",
    ...items,
  ].join("\n");
}

/** 严重程度与分类，如 `**HIGH** · bug` */
function heading(f: Finding): string {
  return `**${f.severity.toUpperCase()}** · ${f.category}`;
}

/** 行号范围：单行为 `line`，多行为 `line-endLine` */
function lineRange(f: Finding): string {
  return f.endLine > f.line ? `${f.line}-${f.endLine}` : `${f.line}`;
}

/** 建议代码块（语言取文件扩展名）；没有建议时为空 */
function suggestion(f: Finding): string[] {
  if (!f.suggestionCode) return [];
  const extension = /\.(\w+)$/.exec(f.path)?.[1] ?? "";
  // 围栏必须长于代码中出现的任何反引号串，否则代码块会被提前截断
  const longestRun = Math.max(0, ...(f.suggestionCode.match(/`+/g) ?? []).map((s) => s.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return ["", "建议修改：", "", `${fence}${extension}`, f.suggestionCode, fence];
}

/** Markdown 列表项的续行缩进两格；空行保持为空，避免产生行尾空白 */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}
