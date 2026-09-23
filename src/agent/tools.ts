import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { readFile, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Finding, Location } from "../types";

const exec = promisify(execFile);

/** 将 existing_code 锚定到文件行号；path 缺省时由实现推断 */
export type Locate = (existingCode: string, path?: string) => Promise<Location>;

/** 创建审查 Agent 的四个工具：code_comment / file_read / code_search / task_done */
export function createTools(cwd: string, findings: Finding[], locate: Locate): ToolSet {
  return {
    code_comment: tool({
      description: "Report a code review finding",
      inputSchema: z.object({
        severity: z.enum(["high", "medium", "low"]),
        content: z.string().describe("Finding description"),
        existing_code: z.string().describe("Code snippet from the diff for anchoring"),
        suggestion_code: z.string().optional().describe("Suggested fix code"),
        category: z.enum(["bug", "security", "performance", "maintainability", "style", "other"]),
        path: z.string().optional().describe("File path; inferred from existing_code when omitted"),
      }),
      execute: async (input) => {
        const loc = await locate(input.existing_code, input.path);
        findings.push({
          ...loc,
          severity: input.severity,
          category: input.category,
          content: input.content,
          existingCode: input.existing_code,
          suggestionCode: input.suggestion_code,
        });
        const at = loc.line > 0 ? `${loc.path}:${loc.line}` : `${loc.path} (unanchored)`;
        return `Finding recorded at ${at}: [${input.severity}] ${input.content.slice(0, 80)}`;
      },
    }),

    file_read: tool({
      description: "Read a file from the repository",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repository root"),
      }),
      execute: async ({ path: filePath }) => {
        try {
          // 解析符号链接后再校验，拒绝仓库外路径（../、绝对路径、指向外部的链接）
          const root = await realpath(cwd);
          const fullPath = await realpath(resolve(cwd, filePath));
          const rel = relative(root, fullPath);
          if (rel.split(sep)[0] === ".." || isAbsolute(rel)) {
            return `Error: path is outside the repository: ${filePath}`;
          }
          const content = await readFile(fullPath, "utf-8");
          // 截断过长文件，防止单文件占满 LLM 上下文窗口
          if (content.length > 50_000) {
            return content.slice(0, 50_000) + "\n... (truncated)";
          }
          return content;
        } catch {
          return `Error: file not found or unreadable: ${filePath}`;
        }
      },
    }),

    code_search: tool({
      description: "Search the codebase using git grep",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        file_pattern: z.string().optional().describe("File glob pattern"),
      }),
      execute: async ({ query, file_pattern }) => {
        try {
          // 用 -e 传入查询，防止以 - 开头的查询被解析为 git 选项（如 --open-files-in-pager）
          const args = ["grep", "-n", "--no-color", "-e", query];
          if (file_pattern) args.push("--", file_pattern);
          const { stdout } = await exec("git", args, { cwd, maxBuffer: 1024 * 1024 });
          const lines = stdout.split("\n").filter(Boolean);
          // 限制搜索结果行数，避免输出过长
          if (lines.length > 50) {
            return lines.slice(0, 50).join("\n") + `\n... (${lines.length} total matches)`;
          }
          return stdout || "No matches found.";
        } catch {
          return "No matches found.";
        }
      },
    }),

    // 信号工具：无 execute 实现，ToolLoopAgent 通过 hasToolCall("task_done") 检测到调用后终止循环
    task_done: tool({
      description: "Signal that the review is complete",
      inputSchema: z.object({
        summary: z.string().describe("Brief summary of the review"),
      }),
    }),
  };
}
