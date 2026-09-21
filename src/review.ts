import type { LanguageModel } from "ai";
import type { DiffEntry, ReviewResult } from "./types";
import { getDiff, type DiffMode } from "./diff";
import { filterFiles, type FilterOptions } from "./filter";
import { runReviewAgent } from "./agent/loop";

/** 审查编排选项 */
export interface ReviewOptions {
  /** LLM 模型实例 */
  model: LanguageModel;
  /** 项目根目录 */
  cwd: string;
  /** diff 获取模式，默认 workspace */
  diffMode?: DiffMode;
  /** 业务上下文，传入 Agent 的用户提示词 */
  background?: string;
  /** 用户排除模式（CLI --exclude） */
  excludePatterns?: string[];
  /** 每个 Agent 步骤结束时的回调（用于更新 spinner） */
  onStepEnd?: (info: { stepNumber: number }) => void;
}

/** 核心审查编排（测试接缝） */
export async function review(options: ReviewOptions): Promise<ReviewResult> {
  const { model, cwd, background, excludePatterns, onStepEnd } = options;
  const diffMode = options.diffMode ?? { type: "workspace" };

  const rawEntries = await getDiff(diffMode, cwd);
  if (rawEntries.length === 0) {
    return { findings: [], totalTokens: 0, durationMs: 0 };
  }

  const filterOpts: FilterOptions = { excludePatterns, cwd };
  const entries = await filterFiles(rawEntries, filterOpts);
  if (entries.length === 0) {
    return { findings: [], totalTokens: 0, durationMs: 0 };
  }

  return runReviewAgent({ model, entries, cwd, background, onStepEnd });
}

/** 允许注入已解析的 diff（测试 / 未来扩展） */
export async function reviewEntries(
  entries: DiffEntry[],
  options: Omit<ReviewOptions, "cwd"> & { cwd: string },
): Promise<ReviewResult> {
  const filterOpts: FilterOptions = { excludePatterns: options.excludePatterns, cwd: options.cwd };
  const filtered = await filterFiles(entries, filterOpts);
  if (filtered.length === 0) {
    return { findings: [], totalTokens: 0, durationMs: 0 };
  }

  return runReviewAgent({
    model: options.model,
    entries: filtered,
    cwd: options.cwd,
    background: options.background,
    onStepEnd: options.onStepEnd,
  });
}
