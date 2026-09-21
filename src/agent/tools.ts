import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { Finding } from "../types.js";

const exec = promisify(execFile);

export function createTools(cwd: string, findings: Finding[]): ToolSet {
  return {
    code_comment: tool({
      description: "Report a code review finding",
      inputSchema: z.object({
        severity: z.enum(["high", "medium", "low"]),
        content: z.string().describe("Finding description"),
        existing_code: z.string().describe("Code snippet from the diff for anchoring"),
        suggestion_code: z.string().optional().describe("Suggested fix code"),
        category: z.enum(["bug", "security", "performance", "maintainability", "style", "other"]),
        path: z.string().optional().describe("File path"),
      }),
      execute: async (input) => {
        findings.push({
          path: input.path ?? "unknown",
          line: 0,
          severity: input.severity,
          category: input.category,
          content: input.content,
          existingCode: input.existing_code,
          suggestionCode: input.suggestion_code,
        });
        return `Finding recorded: [${input.severity}] ${input.content.slice(0, 80)}`;
      },
    }),

    file_read: tool({
      description: "Read a file from the repository",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repository root"),
      }),
      execute: async ({ path: filePath }) => {
        try {
          const content = await readFile(join(cwd, filePath), "utf-8");
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
          const args = ["grep", "-n", "--no-color", query];
          if (file_pattern) args.push("--", file_pattern);
          const { stdout } = await exec("git", args, { cwd, maxBuffer: 1024 * 1024 });
          const lines = stdout.split("\n").filter(Boolean);
          if (lines.length > 50) {
            return lines.slice(0, 50).join("\n") + `\n... (${lines.length} total matches)`;
          }
          return stdout || "No matches found.";
        } catch {
          return "No matches found.";
        }
      },
    }),

    task_done: tool({
      description: "Signal that the review is complete",
      inputSchema: z.object({
        summary: z.string().describe("Brief summary of the review"),
      }),
    }),
  };
}
