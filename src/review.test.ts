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

describe("review 语义分组", () => {
  let multi: string;
  const FILES = ["api/handler.ts", "api/service.ts", "ui/view.ts", "ui/style.ts"];

  beforeAll(async () => {
    multi = await mkdtemp(join(tmpdir(), "diff-sense-group-"));
    await mkdir(join(multi, "api"));
    await mkdir(join(multi, "ui"));
    await exec("git", ["init", "-q"], { cwd: multi });
    for (const f of FILES) {
      await writeFile(join(multi, f), `export const id = "${f}";\n`);
    }
  });

  afterAll(async () => {
    await rm(multi, { recursive: true, force: true });
  });

  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  };

  /**
   * 分组调用返回 api / ui 两组；审查调用对组内第一个文件发布一条发现后结束。
   * 审查调用会等待一个宏任务，以便统计同时进行的审查数
   */
  function groupingModel() {
    const stats = { inFlight: 0, maxInFlight: 0 };
    const model = new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => {
        const text = JSON.stringify(prompt);
        if (text.includes("file grouping assistant")) {
          return {
            content: [
              {
                type: "text" as const,
                text: '[{"label":"api","files":[0,1]},{"label":"ui","files":[2,3]}]',
              },
            ],
            finishReason: { unified: "stop" as const, raw: undefined },
            usage,
            warnings: [],
          };
        }
        stats.inFlight++;
        stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
        await new Promise((r) => setTimeout(r, 10));
        stats.inFlight--;
        const target = FILES.find((f) => text.includes(`<file path=\\"${f}\\">`))!;
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "1",
              toolName: "code_comment",
              input: JSON.stringify({
                severity: "low",
                category: "other",
                content: target,
                existing_code: `export const id = "${target}";`,
              }),
            },
            {
              type: "tool-call" as const,
              toolCallId: "2",
              toolName: "task_done",
              input: JSON.stringify({ summary: "done" }),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        };
      },
    });
    return { model, stats };
  }

  it("文件数 ≥4 时按分组并发审查，组外文件列入 <other_changed_files>", async () => {
    const { model, stats } = groupingModel();
    const result = await review({ model, cwd: multi });

    // 1 次分组调用 + 2 组各 1 次审查调用
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(stats.maxInFlight).toBe(2);
    expect(result.totalTokens).toBe(6);
    expect(result.findings.map((f) => [f.path, f.line])).toEqual([
      ["api/handler.ts", 1],
      ["ui/view.ts", 1],
    ]);

    const apiPrompt = JSON.stringify(
      model.doGenerateCalls.find((c) => JSON.stringify(c.prompt).includes('api/handler.ts\\">'))!
        .prompt,
    );
    const others = apiPrompt.match(/<other_changed_files>(.*?)<\/other_changed_files>/)?.[1];
    expect(others).toContain("ui/view.ts");
    expect(others).toContain("ui/style.ts");
    expect(others).not.toContain("api/");
  });

  it("concurrency 限制同时进行的审查数", async () => {
    const { model, stats } = groupingModel();
    await review({ model, cwd: multi, concurrency: 1 });
    expect(stats.maxInFlight).toBe(1);
  });
});
