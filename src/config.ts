import { createProviderRegistry } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const registry = createProviderRegistry({ anthropic, openai });

export interface ResolvedConfig {
  model: LanguageModel;
  provider: string;
  modelId: string;
}

/** 从环境变量解析 LLM 模型 */
export function resolveModel(): ResolvedConfig {
  const provider = process.env.DIFF_SENSE_PROVIDER;
  const modelId = process.env.DIFF_SENSE_MODEL;

  if (!provider || !modelId) {
    throw new Error(
      "缺少环境变量：请设置 DIFF_SENSE_PROVIDER 和 DIFF_SENSE_MODEL\n" +
        "例如：DIFF_SENSE_PROVIDER=anthropic DIFF_SENSE_MODEL=claude-sonnet-4-5",
    );
  }

  const id = `${provider}:${modelId}` as "anthropic:_" | "openai:_";
  const model = registry.languageModel(id);
  return { model, provider, modelId };
}
