# AI SDK Agent Loop 实现模式

Type: research
Status: resolved

## Question

研究 Vercel AI SDK 中实现 Agent 工具调用循环的最佳模式，为 diff-sense 的审查 Agent 设计提供技术方案。

需要搞清楚：
1. `generateText` + `maxSteps` 模式 vs 手动循环调用的优劣：哪种更适合 diff-sense 的场景（需要自定义终止条件、并发控制）
2. 工具定义方式：`tool()` helper + Zod schema 的具体用法，工具执行结果怎么返回
3. 多提供商切换：provider registry 的用法，运行时动态选择 provider/model
4. 流式 vs 非流式：审查场景下哪种更合适（CLI 需要进度反馈 vs Agent 模式不需要）
5. 错误处理和重试：AI SDK 的内置重试机制

研究来源：
- AI SDK 文档：https://ai-sdk.dev/docs/introduction
- AI SDK Agent 文档：https://ai-sdk.dev/docs/agents/building-agents
- AI SDK Tool 文档：https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI SDK Provider 文档：https://ai-sdk.dev/docs/ai-sdk-core/provider-management

## Answer

详细研究结果见 `docs/research/ai-sdk-agent-loop.md`。

核心发现：
- **ToolLoopAgent + stopWhen** 是 AI SDK 主要的 Agent 抽象（取代旧的 generateText + maxSteps），用组合式终止条件：`hasToolCall('task_done')` + `isStepCount(30)` + 自定义函数
- **无需手动循环**：ToolLoopAgent 覆盖 diff-sense 所有需求——自定义终止、并发（多个 agent 实例 Promise.all）、生命周期回调进度报告
- **工具定义**：`tool({ description, inputSchema: z.object({...}), execute })`，无 execute 的工具调用时自动终止循环（适合 task_done）
- **多提供商**：`createProviderRegistry({ anthropic, openai })` + `registry.languageModel('anthropic:claude-sonnet-4-5')` 字符串 ID 访问
- **推荐非流式**：`agent.generate()` + 生命周期回调（onStepStart/End 等）报告进度，避免流式/非流式双代码路径
- **错误处理**：内置 maxRetries（默认 2）、repairToolCall 修复畸形工具调用、工具错误作为 tool-error part 反馈给 LLM 自行恢复
