import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import type { DiffEntry, FileGroup } from "./types";
import { buildGroupingSystemPrompt, buildGroupingUserPrompt } from "./agent/prompts";

/** 触发 LLM 分组的最少文件数；少于此数时全部文件归入一组 */
export const GROUPING_MIN_FILES = 4;

/** 每组文件数上限 */
export const MAX_FILES_PER_GROUP = 10;

/** 分组提示词期望的输出结构：`[{label, files}]`，files 为文件索引 */
const groupingResponseSchema = z.array(
  z.object({ label: z.string(), files: z.array(z.number().int()) }),
);

/** 语义分组结果 */
export interface GroupingResult {
  /** 分组列表，每个文件恰好出现在一组中 */
  groups: FileGroup[];
  /** 分组调用的 token 消耗（未调用 LLM 时为 0） */
  totalTokens: number;
}

/**
 * 将文件聚类为语义分组
 *
 * 文件数少于 {@link GROUPING_MIN_FILES} 时不调用 LLM，全部归入一组；
 * 否则以文件元数据调用分组提示词，调用失败时退化为单文件组
 */
export async function groupFiles(
  entries: DiffEntry[],
  model: LanguageModel,
): Promise<GroupingResult> {
  if (entries.length < GROUPING_MIN_FILES) {
    return { groups: [{ label: "all", entries }], totalTokens: 0 };
  }

  try {
    const result = await generateText({
      model,
      instructions: buildGroupingSystemPrompt(MAX_FILES_PER_GROUP),
      prompt: buildGroupingUserPrompt(entries),
    });
    return {
      groups: parseGroups(result.text, entries),
      totalTokens: result.usage.totalTokens ?? 0,
    };
  } catch {
    // 分组只影响审查粒度，失败时不中断审查；模型本身不可用时后续审查会报错
    return { groups: singleFileGroups(entries), totalTokens: 0 };
  }
}

/**
 * 解析分组提示词的输出
 *
 * 容忍 JSON 前后的说明文字与代码围栏；丢弃重复与越界索引，未分配的文件各成一组，
 * 超过 {@link MAX_FILES_PER_GROUP} 的组按上限拆分。无法解析时退化为单文件组
 */
export function parseGroups(text: string, entries: DiffEntry[]): FileGroup[] {
  const parsed = groupingResponseSchema.safeParse(extractJsonArray(text));
  if (!parsed.success) return singleFileGroups(entries);

  const assigned = new Set<number>();
  const groups: FileGroup[] = [];
  for (const { label, files } of parsed.data) {
    const indices = files.filter((i) => i >= 0 && i < entries.length && !assigned.has(i));
    indices.forEach((i) => assigned.add(i));
    for (let start = 0; start < indices.length; start += MAX_FILES_PER_GROUP) {
      const chunk = indices.slice(start, start + MAX_FILES_PER_GROUP);
      groups.push({ label, entries: chunk.map((i) => entries[i]) });
    }
  }
  const unassigned = entries.filter((_, i) => !assigned.has(i));
  return [...groups, ...singleFileGroups(unassigned)];
}

/** 截取文本中第一个 `[` 到最后一个 `]` 之间的内容并解析为 JSON，失败时返回 undefined */
function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** 每个文件单独成组，label 为文件路径 */
function singleFileGroups(entries: DiffEntry[]): FileGroup[] {
  return entries.map((e) => ({ label: e.path, entries: [e] }));
}
