// 由 tsup（esbuild）在构建时内联，不依赖运行时的 package.json 相对路径
import { version } from "../../package.json";

/** 读取 package.json 中的版本号 */
export function getVersion(): string {
  return version;
}
