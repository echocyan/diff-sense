import { ToolLoopAgent, hasToolCall, isStepCount } from "ai";
import type { LanguageModel } from "ai";
import type { DiffEntry, Finding, ReviewResult } from "../types";
import { createTools } from "./tools";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

interface RunReviewAgentOptions {
  model: LanguageModel;
  entries: DiffEntry[];
  cwd: string;
  background?: string;
  onStepEnd?: (info: { stepNumber: number }) => void;
}

export async function runReviewAgent(options: RunReviewAgentOptions): Promise<ReviewResult> {
  const { model, entries, cwd, background, onStepEnd } = options;
  const findings: Finding[] = [];
  const tools = createTools(cwd, findings);

  const agent = new ToolLoopAgent({
    model,
    instructions: buildSystemPrompt(),
    tools,
    stopWhen: [hasToolCall("task_done"), isStepCount(30)],
  });

  const start = Date.now();

  const result = await agent.generate({
    prompt: buildUserPrompt(entries, background),
    onStepEnd: onStepEnd ? ({ stepNumber }) => onStepEnd({ stepNumber }) : undefined,
  });

  return {
    findings,
    totalTokens: result.usage.totalTokens ?? 0,
    durationMs: Date.now() - start,
  };
}
