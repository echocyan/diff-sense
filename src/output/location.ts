import type { Location } from "../types";

/** 已锚定位置的行号范围：单行为 `line`，多行为 `line-endLine` */
export function lineRange(loc: Location): string {
  return loc.endLine > loc.line ? `${loc.line}-${loc.endLine}` : `${loc.line}`;
}
