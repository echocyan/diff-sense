export type Severity = "high" | "medium" | "low";

export type Category = "bug" | "security" | "performance" | "maintainability" | "style" | "other";

export interface Finding {
  path: string;
  line: number;
  severity: Severity;
  category: Category;
  content: string;
  existingCode: string;
  suggestionCode?: string;
}

export interface DiffEntry {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  diff: string;
  insertions: number;
  deletions: number;
}

export interface ReviewResult {
  findings: Finding[];
  totalTokens: number;
  durationMs: number;
}
