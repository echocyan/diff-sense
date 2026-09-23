import { Option, type Command } from "commander";
import { spinner } from "@clack/prompts";
import { resolveModel } from "../config";
import { review } from "../review";
import { formatText } from "../output/text";
import { formatJson } from "../output/json";
import type { DiffMode } from "../diff";

/** review 子命令的 CLI 选项 */
interface ReviewCliOptions {
  format: "text" | "json";
  audience: "human" | "agent";
  background?: string;
  commit?: string;
  from?: string;
  to?: string;
  exclude?: string[];
}

/** 注册 review 子命令到 Commander 程序 */
export function registerReviewCommand(program: Command) {
  program
    .command("review")
    .description("审查代码变更")
    .addOption(
      new Option("--format <format>", "输出格式").choices(["text", "json"]).default("text"),
    )
    .addOption(
      new Option("--audience <audience>", "输出受众：agent 不显示进度")
        .choices(["human", "agent"])
        .default("human"),
    )
    .option("--background <text>", "业务上下文")
    .option("--commit <sha>", "审查单个提交")
    .option("--from <ref>", "范围起点（需配合 --to）")
    .option("--to <ref>", "范围终点（需配合 --from）")
    .option("--exclude <pattern...>", "排除文件模式")
    .action(async (opts: ReviewCliOptions) => {
      // 进度写到 stderr，stdout 只留审查结果（便于管道处理 JSON）；agent 受众不显示进度
      const s = opts.audience === "human" ? spinner({ output: process.stderr }) : undefined;
      let started = false;

      try {
        const diffMode = resolveDiffMode(opts);
        const { model, settings } = await resolveModel();
        s?.start(`使用 ${settings.provider}/${settings.model} 审查中...`);
        started = true;

        const result = await review({
          model,
          cwd: process.cwd(),
          diffMode,
          background: opts.background,
          excludePatterns: opts.exclude,
          onStepEnd: ({ stepNumber }) => {
            s?.message(`审查中...（第 ${stepNumber + 1} 步）`);
          },
        });

        s?.stop("审查完成");
        console.log(opts.format === "json" ? formatJson(result) : formatText(result));
      } catch (err) {
        // 参数校验等失败发生在 spinner 启动前，此时无需停止
        if (started) s?.stop("审查失败");
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
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
