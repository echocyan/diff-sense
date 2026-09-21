/** 审查发现的严重程度 */
export type Severity = "high" | "medium" | "low";

/** 审查发现的分类 */
export type Category = "bug" | "security" | "performance" | "maintainability" | "style" | "other";

/** 一条锚定到代码位置的审查发现 */
export interface Finding {
  /** 文件路径（相对于仓库根目录） */
  path: string;
  /** 所在行号 */
  line: number;
  /** 严重程度 */
  severity: Severity;
  /** 分类 */
  category: Category;
  /** 发现描述 */
  content: string;
  /** diff 中的原始代码片段，用于锚定位置 */
  existingCode: string;
  /** 建议的修复代码 */
  suggestionCode?: string;
}

/** 一个文件的 diff 元数据 */
export interface DiffEntry {
  /** 文件路径（取 b/ 侧，即变更后的路径） */
  path: string;
  /** 文件变更状态 */
  status: "added" | "modified" | "deleted" | "renamed";
  /** 完整的 unified diff 文本 */
  diff: string;
  /** 新增行数 */
  insertions: number;
  /** 删除行数 */
  deletions: number;
}

/** 审查结果（findings + token 用量 + 耗时） */
export interface ReviewResult {
  /** 所有审查发现 */
  findings: Finding[];
  /** LLM 总 token 消耗 */
  totalTokens: number;
  /** 审查耗时（毫秒） */
  durationMs: number;
}
