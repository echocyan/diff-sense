# 14: 构建 + 发布准备

**What to build:** 最终的构建优化和 npm 发布就绪。tsup 单文件 bundle 优化（tree-shaking、external 依赖处理），`package.json` 完善 `bin`（`diff-sense` → `dist/index.js`）、`files`（仅发布 dist/）、`exports` 字段、`description`、`keywords`、`repository`、`homepage` 等元数据。确保 `npx diff-sense review` 能直接运行（shebang + 可执行权限）。`npm pack` 产出的 tarball 包含且仅包含必要文件。

**Blocked by:** 06 (Diff + 过滤器), 07 (规则系统), 08 (行号锚定), 09 (配置 + 多提供商), 10 (输出格式化), 11 (语义分组)

**Status:** ready-for-agent

- [ ] tsup 构建优化：单文件产出、合理的 external 配置
- [ ] `package.json` 的 `bin` 字段指向构建产物
- [ ] `package.json` 的 `files` 字段仅包含 dist/
- [ ] Shebang (`#!/usr/bin/env node`) + 可执行权限
- [ ] `npm pack` 产出 tarball，解压后内容正确
- [ ] `npx diff-sense version` 在干净环境下可运行
- [ ] `description`、`keywords`、`repository`、`homepage` 等发布元数据完善
