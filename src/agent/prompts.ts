import type { DiffEntry } from "../types";

/** 构建审查 Agent 的系统提示词 */
export function buildSystemPrompt(): string {
  return `You are a senior code reviewer. Your job is to review code changes and find real defects.

Capabilities:
- Use code_comment to report each finding individually
- Use file_read to read full file contents for additional context
- Use code_search to search the codebase for references and usages
- Use task_done when you have finished reviewing all files

Rules:
- Only comment on files listed in <review_files>
- Focus on real bugs, security issues, and significant problems
- Do NOT comment on deleted code or unchanged code
- Do NOT report stylistic nitpicks unless they indicate a real problem
- Each finding must include the existing_code snippet from the diff
- When done reviewing all files, call task_done with a summary`;
}

/** 构建用户提示词，将 diff 条目包装为 XML 结构化格式供 LLM 解析 */
export function buildUserPrompt(entries: DiffEntry[], background?: string): string {
  // 每个文件的 diff 包装为 <file path="..."> 标签，便于 LLM 按文件定位
  const fileBlocks = entries.map((e) => `<file path="${e.path}">\n${e.diff}\n</file>`).join("\n\n");

  const parts = [`<review_files>\n${fileBlocks}\n</review_files>`];

  if (background) {
    parts.push(`<user_task>\n<background>${background}</background>\n</user_task>`);
  }

  parts.push(
    "Review the code changes above. Report each finding with code_comment. When finished, call task_done.",
  );

  return parts.join("\n\n");
}
