import { InvalidArgumentError, Option, type Command } from "commander";
import { spinner } from "@clack/prompts";
import { resolveModel } from "../config";
import { DEFAULT_CONCURRENCY, review } from "../review";
import { formatText } from "../output/text";
import { formatJson } from "../output/json";
import { formatGithub } from "../output/github";
import type { DiffMode } from "../diff";
import { OUTPUT_FORMATS, type OutputFormat, type ReviewResult } from "../types";

/** 各输出格式对应的格式化器 */
const FORMATTERS: Record<OutputFormat, (result: ReviewResult) => string> = {
  text: formatText,
  json: formatJson,
  github: formatGithub,
};

/** review 子命令的 CLI 选项 */
interface ReviewCliOptions {
  format: OutputFormat;
  background?: string;
  commit?: string;
  from?: string;
  to?: string;
  exclude?: string[];
  concurrency: number;
}

/** 注册 review 子命令到 Commander 程序 */
export function registerReviewCommand(program: Command) {
  program
    .command("review")
    .description("审查代码变更")
    .addOption(new Option("--format <format>", "输出格式").choices(OUTPUT_FORMATS).default("text"))
    .option("--background <text>", "业务上下文")
    .option("--commit <sha>", "审查单个提交")
    .option("--from <ref>", "范围起点（需配合 --to）")
    .option("--to <ref>", "范围终点（需配合 --from）")
    .option("--exclude <pattern...>", "排除文件模式")
    .option("--concurrency <n>", "同时审查的分组数", parseConcurrency, DEFAULT_CONCURRENCY)
    .action(async (opts: ReviewCliOptions) => {
      // 进度写到 stderr，stdout 只留审查结果（便于管道处理 JSON）
      const s = spinner({ output: process.stderr });

      try {
        const diffMode = resolveDiffMode(opts);
        const { model, settings } = await resolveModel();
        s.start(`使用 ${settings.provider}/${settings.model} 审查中...`);

        const result = await review({
          model,
          cwd: process.cwd(),
          diffMode,
          background: opts.background,
          excludePatterns: opts.exclude,
          concurrency: opts.concurrency,
          onProgress: ({ groupsDone, groupsTotal, steps }) => {
            s.message(`审查中...（已完成 ${groupsDone}/${groupsTotal} 组，共 ${steps} 步）`);
          },
        });

        s.stop("审查完成");
        console.log(FORMATTERS[opts.format](result));
      } catch (err) {
        // spinner 未启动（如参数校验失败）时 stop 不输出任何内容
        s.stop("审查失败");
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

/** 解析 --concurrency，仅接受正整数 */
function parseConcurrency(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1) {
    throw new InvalidArgumentError("必须为正整数");
  }
  return n;
}

/** 从 CLI 选项解析 diff 模式，校验 --commit 与 --from/--to 的互斥关系 */
function resolveDiffMode(opts: ReviewCliOptions): DiffMode {
  if (opts.commit) {
    if (opts.from || opts.to) {
      throw new Error("--commit 不能与 --from/--to 同时使用");
    }
    return { type: "commit", sha: opts.commit };
  }
  if (opts.from || opts.to) {
    if (!opts.from || !opts.to) {
      throw new Error("--from 和 --to 必须同时指定");
    }
    return { type: "range", from: opts.from, to: opts.to };
  }
  return { type: "workspace" };
}
