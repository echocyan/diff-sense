import { globToRegExp } from "../glob";
import type { Rule } from "../types";
import { loadProjectConfig } from "../project-config";
import { BUILTIN_RULES, DEFAULT_RULE } from "./builtin";

/** 加载生效的规则列表：项目规则（.diff-sense/rules.json）在前，内置规则在后 */
export async function loadRules(cwd: string): Promise<Rule[]> {
  const { rules } = await loadProjectConfig(cwd);
  return [...rules, ...BUILTIN_RULES];
}

/** 按声明顺序匹配文件路径，返回先命中规则的文本；均未命中时回退到默认规则 */
export function resolveRule(path: string, rules: Rule[]): string {
  const hit = rules.find((r) => globToRegExp(r.pattern, { ignoreCase: true }).test(path));
  return hit?.rule ?? DEFAULT_RULE;
}

/**
 * 解析一组文件的规则文本，用于注入审查提示词的 Review Checklist
 *
 * 全组命中同一规则时返回裸规则文本；命中多条时按规则分块（保持首次出现顺序），
 * 每块用 `<rules for="路径, ...">` 标注适用文件
 */
export function resolveGroupRules(paths: string[], rules: Rule[]): string {
  const byRule = new Map<string, string[]>();
  for (const path of paths) {
    const rule = resolveRule(path, rules);
    byRule.set(rule, [...(byRule.get(rule) ?? []), path]);
  }
  if (byRule.size === 1) return [...byRule.keys()][0];
  return [...byRule]
    .map(([rule, group]) => `<rules for="${escapeAttr(group.join(", "))}">\n${rule}\n</rules>`)
    .join("\n\n");
}

/** 转义 XML 属性值中的 & 与双引号 */
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
