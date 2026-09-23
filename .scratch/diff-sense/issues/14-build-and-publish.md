# 14: 构建 + 发布准备

**What to build:** 最终的构建优化和 npm 发布就绪。tsup 单文件 bundle 优化（tree-shaking、external 依赖处理），`package.json` 完善 `bin`（`diff-sense` → `dist/index.js`）、`files`（仅发布 dist/）、`exports` 字段、`description`、`keywords`、`repository`、`homepage` 等元数据。确保 `npx diff-sense review` 能直接运行（shebang + 可执行权限）。`npm pack` 产出的 tarball 包含且仅包含必要文件。

**Blocked by:** 06 (Diff + 过滤器), 07 (规则系统), 08 (行号锚定), 09 (配置 + 多提供商), 10 (输出格式化), 11 (语义分组)

**Status:** done

- [x] tsup 构建优化：单文件产出、合理的 external 配置
- [x] `package.json` 的 `bin` 字段指向构建产物
- [x] `package.json` 的 `files` 字段仅包含 dist/
- [x] Shebang (`#!/usr/bin/env node`) + 可执行权限
- [x] `npm pack` 产出 tarball，解压后内容正确
- [x] `npx diff-sense version` 在干净环境下可运行
- [x] `description`、`keywords`、`repository`、`homepage` 等发布元数据完善

## Comments

- 实现记录（2026-09-23）：运行时依赖的最低 Node 版本为 22.12（`commander@15` 要求 `>=22.12.0`，`ai` 与 `@ai-sdk/*` 要求 `>=22`），因此 `engines` 设为 `>=22.12.0`，tsup target 由 node20 改为 node22.12，AGENTS.md 同步。dependencies 保持 external（tsup 默认），由 npm 安装；产出单个带 shebang 且可执行的 `dist/index.js`。`exports` 只暴露 `package.json`：diff-sense 是纯 CLI，没有可 import 的 API，入口被 import 时会直接执行命令。新增 `prepack`（构建）与 `prepublishOnly`（typecheck + lint + test）。
- 验证（2026-09-23）：仓库的 `devEngines` 限定 pnpm，`npm pack` 会被拒绝，用 `pnpm pack`；tarball 仅含 `package/dist/index.js`（0755）与 `package/package.json`。在干净目录中以独立 npm 缓存安装 tarball 后，`npx diff-sense version` 输出 `0.1.0`，`--help`、`config check`、无改动仓库上的 `review --format json` 均正常，`import("diff-sense")` 报 `ERR_PACKAGE_PATH_NOT_EXPORTED`。
- 遗留（2026-09-23）：
  - 仓库没有 README 与 LICENSE 文件：npm 页面没有说明，`license` 字段仍为 `ISC` 但未附许可证全文。许可证由维护者决定。
  - 尚未实际发布到 npm（需要维护者的 npm 账号），发布后工单 12 的 `npm install -g diff-sense` 与工单 13 的 `npx diff-sense@<version>` 才可用。
