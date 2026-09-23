import { createProviderRegistry } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/** 模型解析结果 */
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

  // 注册多 LLM 提供商，运行时按 DIFF_SENSE_PROVIDER 选择
  // DIFF_SENSE_API_KEY 未设置时 apiKey 为 undefined，各提供商回退到自身的环境变量（如 ANTHROPIC_API_KEY）
  const apiKey = process.env.DIFF_SENSE_API_KEY;
  const registry = createProviderRegistry({
    anthropic: createAnthropic({ apiKey }),
    deepseek: createDeepSeek({ apiKey }),
    openai: createOpenAI({ apiKey }),
  });

  // registry.languageModel() 接受 `provider:model` 格式，需要类型断言满足联合类型签名
  const id = `${provider}:${modelId}` as "anthropic:_" | "deepseek:_" | "openai:_";
  const model = registry.languageModel(id);
  return { model, provider, modelId };
}
