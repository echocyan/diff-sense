import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import type { DiffEntry, Finding, ReviewResult } from "../types";
import { createTools } from "./tools";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

/** runReviewAgent 的入参 */
interface RunReviewAgentOptions {
  /** LLM 模型实例 */
  model: LanguageModel;
  /** 过滤后的 diff 条目 */
  entries: DiffEntry[];
  /** 项目根目录 */
  cwd: string;
  /** 业务上下文 */
  background?: string;
  /** 每个 Agent 步骤结束时的回调 */
  onStepEnd?: (info: { stepNumber: number }) => void;
}

/** 创建 ToolLoopAgent 执行代码审查，收集 findings 后返回结果 */
export async function runReviewAgent(options: RunReviewAgentOptions): Promise<ReviewResult> {
  const { model, entries, cwd, background, onStepEnd } = options;
  // findings 数组由 code_comment 工具的 execute 回调写入
  const findings: Finding[] = [];
  const tools = createTools(cwd, findings);

  const agent = new ToolLoopAgent({
    model,
    instructions: buildSystemPrompt(),
    tools,
    // 两个停止条件：Agent 调用 task_done 信号完成，或达到 30 步硬上限防止无限循环
    stopWhen: [hasToolCall("task_done"), isStepCount(30)],
  });

  const start = Date.now();

  const result = await agent.generate({
    prompt: buildUserPrompt(entries, background),
    onStepEnd: onStepEnd ? ({ stepNumber }) => onStepEnd({ stepNumber }) : undefined,
  });

  return {
    findings,
    // AI SDK 的 totalTokens 可能为 undefined（部分 provider 不返回），兜底为 0
    totalTokens: result.usage.totalTokens ?? 0,
    durationMs: Date.now() - start,
  };
}
