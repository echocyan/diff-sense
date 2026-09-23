import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  // 与 package.json 的 engines 一致：commander、ai 等运行时依赖要求 Node 22.12+
  target: "node22.12",
  outDir: "dist",
  clean: true,
  // 单入口且无动态 import，产出单个 dist/index.js；dependencies 保持 external，由 npm 安装
  splitting: false,
  // 带 shebang 的入口会被 tsup 设为可执行，npx / 全局安装后可直接运行
  banner: { js: "#!/usr/bin/env node" },
});
