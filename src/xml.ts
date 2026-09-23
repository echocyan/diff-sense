/** 转义 XML 属性值中的 & 与双引号，用于提示词中 `path="..."`、`for="..."` 等属性 */
export function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
