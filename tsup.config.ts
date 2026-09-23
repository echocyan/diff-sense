import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

// 构建目标取自 package.json 的 engines（如 ">=22.12.0" → "node22.12.0"），最低 Node 版本只在一处维护
const { engines } = JSON.parse(readFileSync("package.json", "utf-8"));
const minNode = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(engines.node)?.[1];
if (!minNode) throw new Error(`无法从 engines.node（${engines.node}）解析最低 Node 版本`);

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: `node${minNode}`,
  outDir: "dist",
  clean: true,
  // 当前单入口且无动态 import，本就只产出 dist/index.js；关闭代码分割以防日后引入动态 import 后拆出 chunk
  splitting: false,
  // dependencies 保持 external（tsup 默认），由 npm 安装；带 shebang 的入口会被 tsup 设为可执行
  banner: { js: "#!/usr/bin/env node" },
});
