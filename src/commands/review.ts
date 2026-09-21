import type { Command } from "commander";
import { spinner } from "@clack/prompts";
import { resolveModel } from "../config.js";
import { review } from "../review.js";
import { formatText } from "../output/text.js";

export function registerReviewCommand(program: Command) {
  program
    .command("review")
    .description("审查代码变更")
    .option("--background <text>", "业务上下文")
    .action(async (opts: { background?: string }) => {
      const s = spinner();

      try {
        const { model, provider, modelId } = resolveModel();
        s.start(`使用 ${provider}/${modelId} 审查中...`);

        const result = await review({
          model,
          cwd: process.cwd(),
          background: opts.background,
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
