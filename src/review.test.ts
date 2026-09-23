import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MockLanguageModelV4 } from "ai/test";
import { review } from "./review";

const exec = promisify(execFile);

let repo: string;

/** 在临时仓库中执行 git 命令 */
async function git(...args: string[]): Promise<void> {
  await exec("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
}

/** 模拟一步内调用 code_comment 与 task_done 的模型 */
function mockModel(existingCode: string): MockLanguageModelV4 {
  const call = (id: string, toolName: string, input: unknown) => ({
    type: "tool-call" as const,
    toolCallId: id,
    toolName,
    input: JSON.stringify(input),
  });
  return new MockLanguageModelV4({
    doGenerate: {
      content: [
        call("1", "code_comment", {
          severity: "high",
          category: "bug",
          content: "问题",
          existing_code: existingCode,
        }),
        call("2", "task_done", { summary: "done" }),
      ],
      finishReason: { unified: "tool-calls", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

// src/a.ts 共 20 行，第 2 行远离第 20 行的改动，只能经全文件扫描锚定
const LINES = Array.from({ length: 20 }, (_, i) => `const v${i + 1} = ${i + 1};`);
LINES[1] = "export function helper() {}";

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "diff-sense-review-"));
  await mkdir(join(repo, "src"));
  await mkdir(join(repo, ".diff-sense"));
  await writeFile(
    join(repo, ".diff-sense/rules.json"),
    JSON.stringify({ exclude: ["excluded.ts"] }),
  );
  await writeFile(join(repo, "src/a.ts"), LINES.join("\n") + "\n");
  await writeFile(join(repo, "src/excluded.ts"), "export const x = 1;\n");
  await git("init", "-q");
  await git("add", ".");
  await git("commit", "-q", "-m", "init");
  await writeFile(
    join(repo, "src/a.ts"),
    [...LINES.slice(0, 19), "const v20 = 0;"].join("\n") + "\n",
  );
  await writeFile(join(repo, "src/excluded.ts"), "export const x = 2;\n");
  await writeFile(join(repo, "top-level.ts"), "export const top = 1;\n");
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("review", () => {
  it("在子目录中运行时以仓库根目录为准", async () => {
    const model = mockModel("export function helper() {}");
    const result = await review({ model, cwd: join(repo, "src") });

    expect(result.findings[0]).toMatchObject({ path: "src/a.ts", line: 2, endLine: 2 });
    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(prompt).toContain("top-level.ts");
    expect(prompt).not.toContain("excluded.ts");
  });
});
