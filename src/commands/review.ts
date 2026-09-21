import type { Command } from "commander";
import { spinner } from "@clack/prompts";
import { resolveModel } from "../config.js";
import { review } from "../review.js";
import { formatText } from "../output/text.js";
import type { DiffMode } from "../diff.js";

interface ReviewCliOptions {
  background?: string;
  commit?: string;
  from?: string;
  to?: string;
  exclude?: string[];
}

export function registerReviewCommand(program: Command) {
  program
    .command("review")
    .description("审查代码变更")
    .option("--background <text>", "业务上下文")
    .option("--commit <sha>", "审查单个提交")
    .option("--from <ref>", "范围起点（需配合 --to）")
    .option("--to <ref>", "范围终点（需配合 --from）")
    .option("--exclude <pattern...>", "排除文件模式")
    .action(async (opts: ReviewCliOptions) => {
      const diffMode = resolveDiffMode(opts);
      const s = spinner();

      try {
        const { model, provider, modelId } = resolveModel();
        s.start(`使用 ${provider}/${modelId} 审查中...`);

        const result = await review({
          model,
          cwd: process.cwd(),
          diffMode,
          background: opts.background,
          excludePatterns: opts.exclude,
          onStepEnd: ({ stepNumber }) => {
            s.message(`审查中... (step ${stepNumber + 1})`);
          },
        });

        s.stop("审查完成");
        console.log();
        console.log(formatText(result));
      } catch (err) {
        s.stop("审查失败");
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

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
