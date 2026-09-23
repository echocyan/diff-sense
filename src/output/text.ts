import pc from "picocolors";
import type { Finding, ReviewResult } from "../types";
import { lineRange } from "./location";

/** 严重程度对应的终端彩色标签 */
const SEVERITY_BADGE: Record<string, string> = {
  high: pc.bgRed(pc.white(" HIGH ")),
  medium: pc.bgYellow(pc.black(" MEDIUM ")),
  low: pc.bgBlue(pc.white(" LOW ")),
};

/** 将审查结果格式化为终端可读的彩色文本 */
export function formatText(result: ReviewResult): string {
  const { findings } = result;
  if (findings.length === 0) {
    return pc.green("✓ 未发现问题");
  }

  const grouped = groupByFile(findings);
  const parts: string[] = [];

  for (const [file, items] of grouped) {
    parts.push(pc.bold(pc.underline(file)));
    for (const f of items) {
      const badge = SEVERITY_BADGE[f.severity] ?? f.severity;
      const category = pc.dim(`[${f.category}]`);
      // 已锚定展示 path:line 或 path:line-endLine（终端中可点击跳转），未锚定单独标记
      const location = f.line > 0 ? pc.cyan(`${f.path}:${lineRange(f)}`) : pc.yellow("（未锚定）");
      parts.push(`  ${badge} ${category} ${location} ${f.content}`);
      if (f.existingCode) {
        parts.push(pc.dim(`    > ${f.existingCode.split("\n")[0]}`));
      }
      if (f.suggestionCode) {
        parts.push(pc.green(`    + ${f.suggestionCode.split("\n")[0]}`));
      }
      parts.push("");
    }
  }

  const summary = [
    `${findings.length} 个发现`,
    `${findings.filter((f) => f.severity === "high").length} high`,
    `${findings.filter((f) => f.severity === "medium").length} medium`,
    `${findings.filter((f) => f.severity === "low").length} low`,
  ].join(" · ");

  parts.push(pc.dim(`─`.repeat(40)));
  parts.push(summary);
  parts.push(pc.dim(`${result.totalTokens} tokens · ${(result.durationMs / 1000).toFixed(1)}s`));

  return parts.join("\n");
}

/** 按文件路径分组审查发现 */
function groupByFile(findings: Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = map.get(f.path) ?? [];
    list.push(f);
    map.set(f.path, list);
  }
  return map;
}
