# diff-sense

轻量级 AI 驱动的代码审查 CLI 工具。通过确定性流水线处理文件筛选和行号锚定，通过 LLM Agent 循环完成实际审查。

## Language

### 审查流水线 (Review Pipeline)

**审查 (Review)**:
对一组代码变更的一次完整审查调用，产出零个或多个发现 (Finding)。
_Avoid_: Audit, scan, check

**差异 (Diff)**:
待审查的代码变更集，从 git 获取。有三种模式：工作区 (workspace)、单次提交 (commit)、范围 (range)。
_Avoid_: Changeset, patch

**差异模式 (Diff Mode)**:
决定如何从 git 获取差异。三选一：workspace（未提交的变更：staged + unstaged + 未跟踪文件）、commit（单个 SHA）、range（两个 ref 之间）。

**发现 (Finding)**:
一条锚定到代码位置的审查观察，具有严重程度、分类、描述内容，以及可选的修复建议。
_Avoid_: Comment, issue, warning, violation

**严重程度 (Severity)**:
发现的影响级别。三选一：high、medium、low。

**分类 (Category)**:
发现的缺陷类别。六选一：bug、security、performance、maintainability、style、other。

### 文件处理 (File Processing)

**文件过滤器 (File Filter)**:
四道门 (Gate) 组成的流水线，决定差异中哪些文件进入审查。依次为：二进制排除 → 敏感路径排除 → 用户排除 → 扩展名白名单。扩展名白名单放行源代码与配置文件（json / yaml / toml 等），排除文档（md / txt）及 lockfile、`*.min.js` 等生成产物。
_Avoid_: File selector, file picker

**门 (Gate)**:
文件过滤器的一个阶段。每道门要么放行、要么排除一个文件。

**前置过滤 (Pre-filter)**:
进入四道门之前排除已删除文件。已删除文件没有变更后的代码，发现无法锚定到行号，因此不送审；不计入四道门。

**规则 (Rule)**:
按语言/文件类型定制的审查清单，注入到审查提示词中，引导 Agent 关注该语言的典型缺陷模式。通过 glob 模式匹配文件，先匹配者优先。
_Avoid_: Policy, guideline, check

### 分组 (Grouping)

**语义分组 (Semantic Group)**:
一组相关文件的聚类（如 handler + service + test），分配给同一个 Agent 一起审查。由分组提示词生成，仅基于文件元数据（路径、状态、增删行数），不传入差异内容。
_Avoid_: Batch, chunk, partition

**分组提示词 (Grouping Prompt)**:
将文件聚类为语义分组的 LLM 调用。输入是文件元数据列表，输出是 JSON 数组 `[{label, files}]`。

### Agent

**审查 Agent (Review Agent)**:
一个 ToolLoopAgent 实例，负责审查一个语义分组。它通过工具调用循环读取文件、搜索代码、发布发现，最后发出完成信号。
_Avoid_: Reviewer, bot

**工具 (Tool)**:
审查 Agent 在循环中可调用的结构化函数。四个工具：code_comment（发布发现）、file_read（读取文件内容）、code_search（搜索代码库）、task_done（完成信号）。

**审查提示词 (Review Prompt)**:
驱动审查 Agent 工具调用循环的 system + user 消息对。包含 XML 标签包裹的差异内容、组外变更文件列表、匹配的规则，以及可选的业务上下文。

### 锚定 (Anchoring)

**锚定 (Anchor)**:
将发现的 `existing_code` 代码片段映射到被审查文件的精确行号。三步流程：hunk 新侧匹配 → 全文件扫描 → 回退到 line=0。

**未锚定发现 (Unanchored Finding)**:
锚定失败（line=0）的发现。在 GitHub Action 输出中，未锚定发现汇入摘要评论，而非行内评论。

### 集成 (Integration)

**受众 (Audience)**:
审查输出的消费者身份。二选一：human（CLI 带进度显示）或 agent（静默，结构化输出供机器消费）。
_Avoid_: Mode, target

**Skill**:
源文件位于仓库 `skills/` 下的 markdown 文件（经 skills.sh 分发，使用者安装到 `.agents/`、`.claude/` 等目录），指导其他 AI Agent 如何调用 diff-sense 并解读输出。返回按严重程度分组的 Markdown 审查摘要。
_Avoid_: Plugin, extension, integration

**Action**:
GitHub Actions Composite Action（`action.yml`），在 CI 中运行 diff-sense 并将发现发布为 PR 行内评论。
_Avoid_: Workflow, pipeline
