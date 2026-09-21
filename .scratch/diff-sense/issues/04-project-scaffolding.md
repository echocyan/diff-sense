# 04: 项目脚手架 + CLI 骨架

**What to build:** TypeScript + ESM 项目基础设施。tsup 构建产出单文件 bundle，Vitest 测试框架就绪，Commander.js CLI 入口注册 `review`（stub）、`config`（stub）、`version` 三个命令。`diff-sense version` 输出 package.json 中的版本号，`diff-sense --help` 展示命令列表。`pnpm build` 产出可执行文件，`pnpm test` 能跑通。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `tsconfig.json` 配置 ESM + 严格模式
- [x] tsup 构建配置（单入口 `src/index.ts` → `dist/index.js`）
- [x] `package.json` 补齐 `bin`、`scripts`（build / test / dev）
- [x] Commander.js CLI 入口，注册 `review`、`config`、`version` 命令（review 和 config 为 stub）
- [x] `diff-sense version` 正确输出版本号
- [x] Vitest 配置就绪，一个 placeholder 测试通过
- [x] `pnpm build && node dist/index.js version` 工作正常
