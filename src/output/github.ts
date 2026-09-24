import { hunkNewSides } from "../diff";
import type { DiffEntry, Finding, ReviewResult } from "../types";
import { lineRange } from "./location";

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
  review: { event: "COMMENT"; body: string; comments: GithubReviewComment[] } | null;
  /** 无法作为行内评论的发现，聚合为一条 PR 普通评论的 Markdown；没有时为 null */
  summary: string | null;
  /** Review 被拒绝时改为发布的 PR 普通评论（Markdown），列出全部行内评论的发现；review 为 null 时为 null */
  fallback: string | null;
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
    const inHunk = f.line > 0 && ranges.some((r) => r.start <= f.line && f.endLine <= r.end);
    (inHunk ? inline : rest).push(f);
  }

  const output: GithubReview = {
    review:
      inline.length > 0
        ? {
            event: "COMMENT",
            // COMMENT 事件的 body 在文档中为必填，带上简短说明
            body: `diff-sense 审查：${inline.length} 条行内评论`,
            comments: inline.map(toComment),
          }
        : null,
    summary: rest.length > 0 ? formatSummary(rest) : null,
    fallback: inline.length > 0 ? formatFallback(inline) : null,
  };
  return JSON.stringify(output, null, 2);
}

/** 行号闭区间 */
interface LineSpan {
  start: number;
  end: number;
}

/** 每个 hunk 新侧的行号范围；纯删除的 hunk 没有新侧，不产生范围 */
function newSideRanges(entry: DiffEntry): LineSpan[] {
  return hunkNewSides(entry.diff)
    .filter((lines) => lines.length > 0)
    .map((lines) => ({ start: lines[0].line, end: lines[lines.length - 1].line }));
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

/** 摘要评论：说明原因后逐条列出发现 */
function formatSummary(findings: Finding[]): string {
  return [
    "## diff-sense 审查摘要",
    "",
    `以下 ${findings.length} 条发现无法定位到本次 diff 的代码行，未作为行内评论发布：`,
    "",
    ...findings.map(listItem),
  ].join("\n");
}

/**
 * 回退评论：本地 diff 与 GitHub 的 PR diff 不一致（如重命名检测、大文件折叠）时 Review API 会拒绝整个请求，
 * Action 改为发布此评论，行内评论的发现不会丢失
 */
function formatFallback(findings: Finding[]): string {
  return [
    "## diff-sense 审查发现",
    "",
    `GitHub 未接受行内评论，以下 ${findings.length} 条发现改为在此列出：`,
    "",
    ...findings.map(listItem),
  ].join("\n");
}

/** 一条发现的列表项：严重程度、分类与位置，续行为内容与建议代码；位置无法定位到行时只写路径 */
function listItem(f: Finding): string {
  const location = f.line > 0 ? `${f.path}:${lineRange(f)}` : f.path;
  const detail = [f.content, ...suggestion(f)].map(indent).join("\n");
  return `- ${heading(f)} · ${inlineCode(location)}\n${detail}`;
}

/** 严重程度与分类，如 `**HIGH** · bug` */
function heading(f: Finding): string {
  return `**${f.severity.toUpperCase()}** · ${f.category}`;
}

/** 建议代码块（语言取文件扩展名）；没有建议时为空 */
function suggestion(f: Finding): string[] {
  if (!f.suggestionCode) return [];
  const extension = /\.(\w+)$/.exec(f.path)?.[1] ?? "";
  const fence = backticks(f.suggestionCode, 3);
  return ["", "建议修改：", "", `${fence}${extension}`, f.suggestionCode, fence];
}

/** 行内代码；定界符长于文本中的反引号串，文本以反引号开头或结尾时两侧补空格 */
function inlineCode(text: string): string {
  const fence = backticks(text, 1);
  const padded = text.startsWith("`") || text.endsWith("`") ? ` ${text} ` : text;
  return `${fence}${padded}${fence}`;
}

/** 代码定界符：长于文本中最长的反引号串（否则代码会被提前截断），且不短于 min */
function backticks(text: string, min: number): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((s) => s.length));
  return "`".repeat(Math.max(min, longestRun + 1));
}

/** Markdown 列表项的续行缩进两格；空行保持为空，避免产生行尾空白 */
function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}
