import type { LanguageModel } from "ai";
import type { DiffEntry, ReviewResult } from "./types.js";
import { getDiff, type DiffMode } from "./diff.js";
import { filterFiles, type FilterOptions } from "./filter.js";
import { runReviewAgent } from "./agent/loop.js";

export interface ReviewOptions {
  model: LanguageModel;
  cwd: string;
  diffMode?: DiffMode;
  background?: string;
  excludePatterns?: string[];
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
