/**
 * 将 glob 转为锚定整条路径的正则
 *
 * 支持：`*` 不跨目录，`**` 跨任意层目录（其后紧跟 `/` 时也可匹配零层），`{a,b}` 多选一；
 * 其余字符按字面匹配
 */
export function globToRegExp(glob: string, options: { ignoreCase?: boolean } = {}): RegExp {
  // 花括号不配对时整体按字面匹配，避免生成非法正则
  const braces = hasBalancedBraces(glob);
  // 当前所处的花括号嵌套深度，仅在括号内时 `,` 才表示分隔
  let depth = 0;
  const source = glob
    .split(/(\*\*\/|\*\*|\*|\{|\}|,)/)
    .map((part) => {
      if (part === "**/") return "(?:.*/)?";
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      if (part === "{" && braces) {
        depth++;
        return "(?:";
      }
      if (part === "}" && depth > 0) {
        depth--;
        return ")";
      }
      if (part === "," && depth > 0) return "|";
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`, options.ignoreCase ? "i" : "");
}

/** 检查花括号是否成对出现且未提前闭合 */
function hasBalancedBraces(glob: string): boolean {
  let depth = 0;
  for (const ch of glob) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return false;
  }
  return depth === 0;
}
