import { createRequire } from "node:module";

// ESM 不支持直接 import JSON，通过 createRequire 桥接加载 package.json
const require = createRequire(import.meta.url);

/** 读取 package.json 中的版本号 */
export function getVersion(): string {
  const pkg = require("../../package.json") as { version: string };
  return pkg.version;
}
