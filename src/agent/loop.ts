import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import type { DiffEntry, Finding, ReviewResult, Rule } from "../types";
import { resolveGroupRules } from "../rules/matcher";
import { anchor, type ReadNewFile } from "../anchor";
import { createTools } from "./tools";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

/** runReviewAgent 的入参 */
interface RunReviewAgentOptions {
  /** LLM 模型实例 */
  model: LanguageModel;
  /** 本组待审查的 diff 条目 */
  entries: DiffEntry[];
  /** 组外变更文件，作为上下文列入 <other_changed_files> */
  others?: DiffEntry[];
  /** 项目根目录 */
  cwd: string;
  /** 生效的规则列表，按组内文件解析后注入 Review Checklist */
  rules: Rule[];
  /** 读取变更后的完整文件，用于行号锚定的全文件扫描 */
  readNewFile: ReadNewFile;
  /** 业务上下文 */
  background?: string;
  /** 每个 Agent 步骤结束时的回调 */
  onStepEnd?: (info: { stepNumber: number }) => void;
}

/** 创建 ToolLoopAgent 审查一个语义分组，收集 findings 后返回结果 */
export async function runReviewAgent(options: RunReviewAgentOptions): Promise<ReviewResult> {
  const { model, entries, others, cwd, rules, readNewFile, background, onStepEnd } = options;
  // findings 数组由 code_comment 工具的 execute 回调写入，写入前先锚定行号
  const findings: Finding[] = [];
  const tools = createTools(cwd, findings, (code, path) =>
    anchor(code, path, entries, readNewFile),
  );

  const agent = new ToolLoopAgent({
    model,
    instructions: buildSystemPrompt(),
    tools,
    // 两个停止条件：Agent 调用 task_done 信号完成，或达到 30 步硬上限防止无限循环
    stopWhen: [hasToolCall("task_done"), isStepCount(30)],
  });

  const start = Date.now();

  const result = await agent.generate({
    prompt: buildUserPrompt(
      entries,
      {
        checklist: resolveGroupRules(
          entries.map((e) => e.path),
          rules,
        ),
        background,
      },
      others,
    ),
    onStepEnd: onStepEnd ? ({ stepNumber }) => onStepEnd({ stepNumber }) : undefined,
  });

  return {
    findings,
    // AI SDK 的 totalTokens 可能为 undefined（部分 provider 不返回），兜底为 0
    totalTokens: result.usage.totalTokens ?? 0,
    durationMs: Date.now() - start,
  };
}
