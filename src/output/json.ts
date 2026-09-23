import type { ReviewResult } from "../types";

/**
 * 将审查结果格式化为 JSON 发现数组，供 GitHub Action、Skill 等机器消费
 *
 * 字段与顺序固定；无修复建议时 suggestionCode 为 null，使每条发现结构一致
 */
export function formatJson(result: ReviewResult): string {
  const findings = result.findings.map((f) => ({
    path: f.path,
    line: f.line,
    endLine: f.endLine,
    severity: f.severity,
    category: f.category,
    content: f.content,
    existingCode: f.existingCode,
    suggestionCode: f.suggestionCode ?? null,
  }));
  return JSON.stringify(findings, null, 2);
}
