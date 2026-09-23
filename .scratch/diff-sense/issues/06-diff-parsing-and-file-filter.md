# 06: Diff 完整解析 + 文件过滤器

**What to build:** 补齐 Commit 和 Range 两种 diff 模式，实现完整四道门文件过滤器。`diff-sense review --commit <sha>` 审查单个提交，`diff-sense review --from main --to feature` 审查分支范围。文件过滤器按顺序执行：二进制排除 → 敏感路径排除（.env 等）→ 用户排除（`--exclude` CLI 标志 + `.diff-sense/rules.json` 中的 exclude）→ 扩展名白名单。单元测试覆盖全部 diff 模式和过滤门。

**Blocked by:** 05 (最小审查流水线)

**Status:** done

- [x] Commit 模式 diff 解析：`git diff <sha>~1 <sha>` 或 `git show <sha>`
- [x] Range 模式 diff 解析：`git diff <from> <to>`
- [x] `--commit` 和 `--from`/`--to` CLI 标志接入 review 命令
- [x] 敏感路径排除门：.env、密钥文件、证书等模式
- [x] 用户排除门：`--exclude` CLI 标志 + 配置文件中的 exclude 模式
- [x] 扩展名白名单门：仅放行代码文件扩展名
- [x] 单元测试：三种 diff 模式的解析、四道门各自的过滤逻辑

## Comments

- 审查修复（2026-09-23）：diff 头部解析支持 git 加引号的路径（非 ASCII、特殊字符），此前这类文件会被静默丢弃。

- 审查修复（2026-09-23）：用户排除模式语义明确为——含 `*` 时按 glob 匹配整条路径（`*` 不跨目录，`**` 跨目录，`**/` 可匹配零层，其余字符按字面匹配）；不含 `*` 时按路径段匹配（`docs` 匹配 `docs/a.ts`、`x/docs/a.ts`，不匹配 `docsite/`）。敏感路径改为按文件名锚定（`.env`、`id_rsa` 等），不再误伤 `config.env.ts`、`valid_rsa.go`。移除白名单中不可达的 `.R`。

- 审查修复（2026-09-23）：`--commit` / `--from` / `--to` 参数校验错误改为输出单行提示并以退出码 1 结束，不再抛出带堆栈的未处理异常。

- 审查修复（2026-09-23）：**决定**——扩展名白名单移除 `.md` / `.mdx` / `.txt`；保留 json / yaml / toml，因为 CI workflow、tsconfig 等配置变更值得审查；同时排除 lockfile（`pnpm-lock.yaml`、`package-lock.json` 等）和 `*.min.js` / `*.min.css`。

- 审查修复（2026-09-23）：**决定**——保留"排除已删除文件"，定义为四道门之前的**前置过滤**（见 CONTEXT.md），不计入四道门；代码注释中的"门 0"同步改名。

- 审查修复（2026-09-23）（ticket 07 期间）：glob 抽取为 `src/glob.ts` 与规则系统共用，新增 `{a,b}` 多选一；用户排除模式含 `*` 或 `{` 即按 glob 匹配。花括号不配对时按字面匹配。
