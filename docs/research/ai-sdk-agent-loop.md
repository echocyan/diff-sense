# AI SDK Agent Loop 实现模式研究

> 研究目的：为 diff-sense 审查 Agent 的工具调用循环设计提供技术方案
> 研究日期：2026-09-21
> 主要来源：Vercel AI SDK 官方文档（ai-sdk.dev）

---

## 1. generateText + stopWhen 多步工具调用

### 1.1 核心机制

AI SDK 提供两种方式实现多步工具调用：

1. **`ToolLoopAgent`** — 封装了 LLM 配置、工具、行为的可复用 Agent 类（推荐方式）
2. **`generateText` / `streamText`** — 底层函数，配合 `stopWhen` 参数实现循环

> 注意：旧版 API 中的 `maxSteps` 参数已被 `stopWhen` 取代。新版使用 `isStepCount(count)` 等条件函数控制循环终止。
>
> 来源：[loop-control](https://ai-sdk.dev/docs/agents/loop-control)、[building-agents](https://ai-sdk.dev/docs/agents/building-agents)

### 1.2 ToolLoopAgent 基本用法

```typescript
import { ToolLoopAgent, tool, isStepCount } from 'ai';
import { z } from 'zod';

const agent = new ToolLoopAgent({
  model: yourModel,
  instructions: 'You are a code review assistant.',
  tools: {
    fileRead: tool({
      description: 'Read file content',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => readFile(path),
    }),
  },
  stopWhen: isStepCount(20), // 默认值即为 20
});

const result = await agent.generate({
  prompt: 'Review this code change...',
});
console.log(result.text);
```

> 来源：[building-agents](https://ai-sdk.dev/docs/agents/building-agents)、[tool-loop-agent reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)

### 1.3 循环终止条件

循环在以下任一情况下停止：
- LLM 返回的 `finishReason` 不是 `tool-calls`（即模型自然结束）
- 被调用的工具没有 `execute` 函数（特殊终止模式）
- 工具调用需要用户审批（`toolApproval`）
- `stopWhen` 条件被满足

**内置终止条件：**

| 条件 | 说明 |
|------|------|
| `isStepCount(count)` | 达到指定步数后停止（默认 20） |
| `hasToolCall(...toolNames)` | 当指定工具被调用时停止 |
| `isLoopFinished()` | 永不触发，允许自然终止（慎用） |

**组合条件（任一满足即停止）：**

```typescript
stopWhen: [
  isStepCount(20),
  hasToolCall('task_done'),
]
```

> 来源：[loop-control](https://ai-sdk.dev/docs/agents/loop-control)

### 1.4 自定义终止条件

终止条件是一个接收 `{ steps }` 的函数，返回布尔值：

```typescript
// 示例：基于 token 预算的终止
const withinBudget = ({ steps }) => {
  const totalTokens = steps.reduce(
    (sum, step) => sum + (step.usage?.totalTokens ?? 0), 0
  );
  return totalTokens > 50000; // 超过 50k tokens 时停止
};

// 示例：基于文本内容的终止
const hasAnswer = ({ steps }) => {
  return steps.some(step => step.text?.includes('ANSWER:')) ?? false;
};
```

> 来源：[loop-control](https://ai-sdk.dev/docs/agents/loop-control)

### 1.5 工具结果回流机制

每一步的执行流程：

1. LLM 接收 prompt + 工具定义
2. LLM 生成工具调用（包含参数）
3. SDK 用 Zod schema 验证参数
4. 执行工具的 `execute` 函数
5. 结果自动回传给 LLM（作为下一步的 messages 上下文）
6. LLM 根据工具结果继续推理或生成最终响应

工具结果以 `tool-result` 类型的 content part 加入对话历史，通过 `responseMessages` 可获取完整消息链。

> 来源：[tools-and-tool-calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

### 1.6 无 execute 函数的终止工具模式

一种常用模式：定义没有 `execute` 函数的工具，配合 `toolChoice: 'required'`，强制模型在每步都调用工具，直到调用终止工具时循环自然停止：

```typescript
tools: {
  search: searchTool,
  done: tool({
    description: 'Signal that the task is complete',
    inputSchema: z.object({ answer: z.string() }),
    // 没有 execute 函数 → 调用时循环停止
  }),
},
toolChoice: 'required'
```

最终结果通过 `result.staticToolCalls[0]` 获取。

> 来源：[loop-control](https://ai-sdk.dev/docs/agents/loop-control)

---

## 2. 自定义循环 vs ToolLoopAgent

### 2.1 方案对比

| 维度 | ToolLoopAgent + stopWhen | 手动 generateText 循环 |
|------|--------------------------|----------------------|
| **代码量** | 少，声明式配置 | 多，需手写循环逻辑 |
| **终止控制** | 内置 + 自定义条件函数 | 完全自由 |
| **进度回调** | 完整的生命周期回调 | 需自行实现 |
| **消息管理** | 自动管理 responseMessages | 需手动拼接 |
| **工具上下文** | 内置 runtimeContext / toolsContext | 需手动传递 |
| **中间步骤修改** | prepareStep 钩子 | 完全自由 |
| **流式支持** | agent.stream() 内置 | 需自行处理 |
| **并发控制** | 不直接支持多 Agent 并发 | 可用 Promise.all |

### 2.2 diff-sense 需求分析

diff-sense 的审查 Agent 需要：

1. **自定义终止条件**：
   - `task_done` 工具被调用 → `hasToolCall('task_done')` 直接支持
   - 最大迭代次数 → `isStepCount(N)` 直接支持
   - 连续空结果检测 → 自定义 `stopWhen` 条件函数
   - 组合条件 → `stopWhen` 数组

2. **并发控制**：
   - 多个 review group 并行 → 每组一个 `ToolLoopAgent` 实例，外层 `Promise.all` 控制并发
   - 这与 OCR 的 subtask dispatch 模式一致

3. **进度报告**：
   - `onStepStart`、`onStepEnd`、`onToolExecutionStart`、`onToolExecutionEnd` 等生命周期回调完全满足
   - 回调支持在构造函数和方法调用两层设置，构造函数级先执行

4. **消息压缩**：
   - `prepareStep` 中可使用 `pruneMessages` 辅助函数压缩历史消息
   - 可按需裁剪 reasoning、tool calls、空消息

### 2.3 推荐结论

**使用 `ToolLoopAgent`，不需要手动循环。**

理由：
- `stopWhen` 组合条件完全覆盖 diff-sense 的终止需求
- 生命周期回调满足进度报告需求
- `prepareStep` 钩子提供了足够的中间步骤控制
- 并发通过外层 `Promise.all` 实现，不影响单个 Agent 的循环机制
- 自动管理 responseMessages 减少出错可能

只有在需要跨步骤共享非消息状态、或需要在步骤间执行非 LLM 操作（如数据库写入）时，才考虑手动循环。

> 来源：[loop-control](https://ai-sdk.dev/docs/agents/loop-control)、[workflows](https://ai-sdk.dev/docs/agents/workflows)

---

## 3. tool() 工具定义模式

### 3.1 基本结构

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: '工具描述，用于引导 LLM 选择',
  inputSchema: z.object({
    param1: z.string().describe('参数描述'),
    param2: z.number().optional(),
  }),
  execute: async (args, options) => {
    // args: 经 Zod 验证的参数，类型安全
    // options: { toolCallId, messages, abortSignal, context }
    return { result: 'some value' };
  },
});
```

**关键字段：**

| 字段 | 必须 | 说明 |
|------|------|------|
| `description` | 可选 | 字符串或函数，引导模型选择工具 |
| `inputSchema` | 是 | Zod 或 JSON schema，LLM 可见并用于验证 |
| `execute` | 可选 | 异步执行函数（无 execute 时工具调用会终止循环） |
| `contextSchema` | 可选 | Zod schema，定义工具需要的上下文类型 |
| `strict` | 可选 | 布尔值，启用严格工具调用 |

> 来源：[tools-and-tool-calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

### 3.2 execute 函数的第二个参数

```typescript
execute: async (args, {
  toolCallId,    // 唯一标识符
  messages,      // 完整对话历史
  abortSignal,   // 从 generateText/streamText 转发的中止信号
  context,       // 来自 toolsContext 的工具特定上下文
}) => {
  // ...
}
```

> 来源：[tools-and-tool-calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

### 3.3 diff-sense 工具定义示例

```typescript
import { tool } from 'ai';
import { z } from 'zod';

// code_comment 工具
const codeComment = tool({
  description: 'Post a review comment on a specific code location',
  inputSchema: z.object({
    severity: z.enum(['high', 'medium', 'low'])
      .describe('Comment severity level'),
    content: z.string()
      .describe('The review comment content'),
    existing_code: z.string()
      .describe('The existing code being reviewed'),
    suggestion_code: z.string().optional()
      .describe('Suggested replacement code, if applicable'),
  }),
  execute: async ({ severity, content, existing_code, suggestion_code }) => {
    // 收集评论到结果列表
    return { status: 'comment_recorded', severity };
  },
});

// file_read 工具
const fileRead = tool({
  description: 'Read the full content of a file in the repository',
  inputSchema: z.object({
    path: z.string().describe('File path relative to repo root'),
  }),
  execute: async ({ path }, { context }) => {
    // context 可包含 repo 根路径等信息
    return { content: await readFile(path) };
  },
});

// code_search 工具
const codeSearch = tool({
  description: 'Search for code patterns across the repository',
  inputSchema: z.object({
    query: z.string().describe('Search query or pattern'),
    file_pattern: z.string().optional()
      .describe('Glob pattern to filter files'),
  }),
  execute: async ({ query, file_pattern }) => {
    return { matches: await searchCode(query, file_pattern) };
  },
});

// task_done 终止工具（无 execute → 停止循环）
const taskDone = tool({
  description: 'Signal that the review task is complete',
  inputSchema: z.object({
    summary: z.string().describe('Brief summary of the review'),
    total_comments: z.number().describe('Total number of comments made'),
  }),
  // 无 execute 函数 — 调用时循环终止
});
```

### 3.4 工具上下文传递

通过 `contextSchema` + `toolsContext` 安全传递运行时数据（如 API key、repo 路径）：

```typescript
const fileRead = tool({
  description: 'Read file content',
  inputSchema: z.object({ path: z.string() }),
  contextSchema: z.object({
    repoRoot: z.string(),
    maxFileSize: z.number(),
  }),
  execute: async ({ path }, { context }) => {
    const fullPath = join(context.repoRoot, path);
    return { content: await readFile(fullPath) };
  },
});

// 调用时传递上下文
const result = await agent.generate({
  prompt: reviewPrompt,
  toolsContext: {
    fileRead: {
      repoRoot: '/path/to/repo',
      maxFileSize: 100_000,
    },
  },
});
```

> 来源：[runtime-and-tool-context](https://ai-sdk.dev/docs/ai-sdk-core/runtime-and-tool-context)

### 3.5 工具错误处理

工具执行错误以 `tool-error` content part 出现在结果步骤中，LLM 可在下一步骤中尝试恢复。相关错误类型：

| 错误类型 | 说明 |
|---------|------|
| `NoSuchToolError` | 调用了未定义的工具 |
| `InvalidToolInputError` | 参数不符合 schema |
| `ToolCallRepairError` | 修复尝试失败 |
| `ToolChoiceViolationError` | 响应违反 toolChoice 设置 |

> 来源：[tools-and-tool-calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

---

## 4. 多提供商支持

### 4.1 Provider Registry

`createProviderRegistry` 创建统一的提供商注册中心，支持通过 `provider:model` 字符串 ID 动态选择模型：

```typescript
import { createProviderRegistry } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

const registry = createProviderRegistry({
  anthropic,
  openai,
});

// 通过字符串 ID 获取模型
const model = registry.languageModel('anthropic:claude-sonnet-4-5');
```

> 来源：[provider-management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)

### 4.2 Custom Provider 别名

使用 `customProvider` 创建语义化的模型别名：

```typescript
import { customProvider } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

const myProvider = customProvider({
  languageModels: {
    'review-fast': anthropic('claude-haiku-4-5'),
    'review-standard': anthropic('claude-sonnet-4-5'),
    'review-deep': openai('gpt-5.1'),
  },
});

// 使用别名
const model = myProvider.languageModel('review-standard');
```

> 来源：[provider-management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)

### 4.3 diff-sense 多提供商方案

结合 registry + customProvider 实现用户配置驱动的模型选择：

```typescript
import { createProviderRegistry, customProvider } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

// 方案 A：registry 直接映射
const registry = createProviderRegistry({
  anthropic,
  openai,
});

function getModel(config: { provider: string; model: string }) {
  return registry.languageModel(`${config.provider}:${config.model}`);
}

// 方案 B：customProvider 抽象层（推荐）
function createReviewProvider(userConfig: UserConfig) {
  const providers: Record<string, () => LanguageModel> = {
    'anthropic:claude-sonnet-4-5': () => anthropic('claude-sonnet-4-5'),
    'anthropic:claude-haiku-4-5': () => anthropic('claude-haiku-4-5'),
    'openai:gpt-5.1': () => openai('gpt-5.1'),
  };

  const modelId = `${userConfig.provider}:${userConfig.model}`;
  const factory = providers[modelId];
  if (!factory) throw new Error(`Unsupported model: ${modelId}`);
  return factory();
}
```

### 4.4 自定义分隔符

注册中心支持自定义分隔符（默认为 `:`）：

```typescript
const registry = createProviderRegistry(
  { anthropic, openai },
  { separator: '/' },
);

// 使用 / 分隔
const model = registry.languageModel('anthropic/claude-sonnet-4-5');
```

> 来源：[provider-management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)

---

## 5. 流式 vs 非流式

### 5.1 generateText（非流式）

- 等待完整响应后返回
- 适合 Agent 循环场景（不需要中间文本流）
- 返回 `text`、`toolCalls`、`toolResults`、`steps` 等完整结果
- 对应 `ToolLoopAgent.generate()`

```typescript
const result = await generateText({
  model,
  prompt,
  tools,
  stopWhen: isStepCount(20),
});
// result.text — 最终文本
// result.steps — 每步详情
// result.totalUsage — 总 token 使用量
```

> 来源：[generating-text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)

### 5.2 streamText（流式）

- 增量返回文本和事件
- 返回 `textStream`（纯文本）和 `fullStream`（含所有事件类型）
- 对应 `ToolLoopAgent.stream()`

**fullStream 事件类型：**

| 事件 | 说明 |
|------|------|
| `text-delta` | 增量文本 |
| `reasoning-delta` | 推理内容 |
| `tool-call` | 工具调用 |
| `tool-result` | 工具结果 |
| `start-step` / `finish-step` | 步骤生命周期 |
| `start` / `finish` | 整体生命周期 |
| `error` / `abort` | 错误和中止 |

```typescript
const result = agent.stream({
  prompt: 'Review this code...',
});

for await (const chunk of result.fullStream) {
  switch (chunk.type) {
    case 'text-delta':
      process.stdout.write(chunk.text);
      break;
    case 'tool-call':
      console.log(`Calling ${chunk.toolName}...`);
      break;
    case 'tool-result':
      console.log(`Tool result received`);
      break;
  }
}
```

> 来源：[generating-text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)、[stream-text reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)

### 5.3 diff-sense 场景选择

| 场景 | 推荐 | 理由 |
|------|------|------|
| Human 模式（CLI 交互） | `agent.stream()` + fullStream | 需要实时显示审查进度（正在读取文件、正在分析...） |
| Agent 模式（CI/CD 集成） | `agent.generate()` | 不需要中间输出，只关心最终审查结果 |
| 混合方案 | 统一用 `agent.generate()` + 生命周期回调 | 回调提供进度信息，无需切换流式/非流式代码路径 |

**推荐混合方案**：统一使用 `agent.generate()` + 生命周期回调。回调在 human 模式下输出进度信息，在 agent 模式下静默。避免维护两套代码路径。

```typescript
const result = await agent.generate({
  prompt: reviewPrompt,

  onStepStart({ stepNumber }) {
    if (humanMode) console.log(`Step ${stepNumber} starting...`);
  },

  onToolExecutionStart({ toolCall }) {
    if (humanMode) console.log(`  -> ${toolCall.toolName}...`);
  },

  onToolExecutionEnd({ toolCall, toolExecutionMs }) {
    if (humanMode) {
      console.log(`  <- ${toolCall.toolName} (${toolExecutionMs}ms)`);
    }
  },

  onStepEnd({ stepNumber, usage }) {
    if (humanMode) {
      console.log(`Step ${stepNumber} done (${usage.totalTokens} tokens)`);
    }
  },

  onEnd({ usage, steps }) {
    if (humanMode) {
      console.log(`Review complete: ${steps.length} steps, ${usage.totalTokens} tokens`);
    }
  },
});
```

> 来源：[building-agents](https://ai-sdk.dev/docs/agents/building-agents)、[generating-text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)

### 5.4 性能指标

两种方式都提供详细的性能数据（通过 `performance` 对象）：

- `effectiveOutputTokensPerSecond`：总输出速率
- `stepTimeMs`：单步总耗时
- `responseTimeMs`：模型响应等待时间
- `toolExecutionMs`：各工具执行耗时

> 来源：[generating-text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)

---

## 6. 错误处理与重试

### 6.1 内置重试机制

**`maxRetries`**：模型调用失败时的重试次数，默认 `2`。处理的是发起调用阶段的错误（网络超时、速率限制等）。

```typescript
const agent = new ToolLoopAgent({
  model,
  tools,
  maxRetries: 3, // 构造时设置默认值
});

// 也可在调用时覆盖
const result = await agent.generate({
  prompt: reviewPrompt,
  maxRetries: 5,
});
```

**`streamRetries`**：流式响应开始后的重试。处理的是流中途的 provider 错误。重试时只重跑失败的步骤，保留已完成的步骤和上下文。

```typescript
const result = streamText({
  model,
  prompt,
  streamRetries: 2,
});
```

> 来源：[error-handling](https://ai-sdk.dev/docs/ai-sdk-core/error-handling)、[settings](https://ai-sdk.dev/docs/ai-sdk-core/settings)

### 6.2 回调驱动的重试

`onError` 回调可动态决定是否重试，提供比 `streamRetries` 更灵活的控制：

```typescript
const result = streamText({
  model,
  streamRetries: 0, // 禁用自动重试
  onError: ({ error }) => {
    if (isTransientProviderError(error)) {
      return { retry: true }; // 动态决定重试
    }
    // 不返回 → 不重试
  },
});
```

注意：回调驱动的重试最多额外允许 1 次（在 `streamRetries` 预算耗尽后）。

> 来源：[error-handling](https://ai-sdk.dev/docs/ai-sdk-core/error-handling)

### 6.3 超时控制

支持多层超时配置：

```typescript
const result = await generateText({
  model,
  prompt,
  timeout: {
    totalMs: 300_000,   // 总调用超时 5 分钟
    stepMs: 60_000,     // 单步超时 1 分钟
    toolMs: 30_000,     // 默认工具超时 30 秒
    tools: {
      fileReadMs: 10_000,   // file_read 工具专属超时
      codeSearchMs: 20_000, // code_search 工具专属超时
    },
  },
});
```

也支持 `AbortSignal` 实现外部取消：

```typescript
const controller = new AbortController();

const result = await agent.generate({
  prompt: reviewPrompt,
  abortSignal: controller.signal,
});

// 外部取消
setTimeout(() => controller.abort(), 300_000);
```

> 来源：[settings](https://ai-sdk.dev/docs/ai-sdk-core/settings)

### 6.4 工具执行错误恢复

工具执行中抛出的错误会以 `tool-error` content part 出现在步骤结果中，LLM 在下一轮可以看到错误信息并尝试恢复（如重试不同参数、换用其他工具）。

### 6.5 工具调用修复

`repairToolCall` 钩子可在 schema 验证失败时尝试修复工具调用，避免循环因参数格式问题直接终止。

> 来源：[tools-and-tool-calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)、[tool-loop-agent reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)

---

## 7. diff-sense 推荐方案

### 7.1 整体架构

```
diff-sense review
  → 确定性层：diff 解析 + 文件过滤 + 规则匹配 + 语义分组
  → Agent 层：每组一个 ToolLoopAgent 实例
      → tools: file_read, code_search, code_comment, task_done
      → stopWhen: [isStepCount(N), hasToolCall('task_done')]
      → 生命周期回调 → 进度报告
  → 输出层：收集 code_comment 结果 → 格式化输出
```

### 7.2 核心实现建议

**1. 使用 `ToolLoopAgent` 而非手动循环**

```typescript
import { ToolLoopAgent, tool, isStepCount, hasToolCall } from 'ai';

const reviewAgent = new ToolLoopAgent({
  model: getModelFromConfig(userConfig), // 从用户配置获取模型
  instructions: REVIEW_SYSTEM_PROMPT,
  tools: {
    file_read: fileReadTool,
    code_search: codeSearchTool,
    code_comment: codeCommentTool,
    task_done: taskDoneTool, // 无 execute，调用即终止
  },
  stopWhen: [
    isStepCount(30),              // 安全上限
    hasToolCall('task_done'),     // 正常完成
  ],
  // 构造函数级回调作为默认行为
  onStepEnd({ stepNumber, usage }) {
    logger.debug(`Step ${stepNumber}, tokens: ${usage.totalTokens}`);
  },
});
```

**2. 并发审查**：每个语义分组独立 Agent，`Promise.all` 控制并发

```typescript
// 参考 OCR 的 subtask dispatch 模式
const results = await Promise.all(
  reviewGroups.map(group =>
    reviewAgent.generate({
      prompt: buildGroupPrompt(group),
      toolsContext: {
        file_read: { repoRoot, diffFiles: group.files },
        code_comment: { groupId: group.id },
      },
    })
  )
);
```

**3. 多提供商**：`createProviderRegistry` + 用户配置

```typescript
const registry = createProviderRegistry({ anthropic, openai });

function getModelFromConfig(config: DiffSenseConfig) {
  return registry.languageModel(
    `${config.provider}:${config.model}`
  );
}
```

**4. 进度报告**：统一用 `generate()` + 生命周期回调，不需要 stream

```typescript
const result = await reviewAgent.generate({
  prompt: buildGroupPrompt(group),
  onToolExecutionStart({ toolCall }) {
    if (isHumanMode) {
      spinner.text = `${toolCall.toolName}...`;
    }
  },
});
```

**5. 错误处理**：利用内置 `maxRetries` + 超时

```typescript
const result = await reviewAgent.generate({
  prompt: reviewPrompt,
  maxRetries: 3,
  timeout: {
    totalMs: 300_000,
    stepMs: 60_000,
    toolMs: 30_000,
  },
});
```

### 7.3 task_done 工具设计

采用无 `execute` 函数模式，配合 `hasToolCall('task_done')` 终止条件。task_done 的输入 schema 承载审查摘要：

```typescript
const taskDone = tool({
  description: 'Signal that the review of this group is complete. Call this when you have reviewed all relevant code changes.',
  inputSchema: z.object({
    summary: z.string().describe('Brief summary of findings'),
    total_comments: z.number().describe('Number of comments made'),
    confidence: z.enum(['high', 'medium', 'low'])
      .describe('Confidence level in the review completeness'),
  }),
  // 无 execute → 循环终止
  // 通过 result.staticToolCalls 获取输入
});
```

### 7.4 关键技术决策总结

| 决策点 | 选择 | 依据 |
|--------|------|------|
| 循环机制 | `ToolLoopAgent` + `stopWhen` | 内置功能覆盖所有需求，减少手写代码 |
| 终止方式 | `hasToolCall('task_done')` + `isStepCount(30)` | 正常终止 + 安全上限 |
| task_done 实现 | 无 execute 函数的工具 | SDK 原生支持的终止模式 |
| 进度反馈 | `generate()` + 生命周期回调 | 单一代码路径，human/agent 模式复用 |
| 模型选择 | `createProviderRegistry` | 统一接口，字符串 ID 驱动 |
| 工具上下文 | `contextSchema` + `toolsContext` | 类型安全，不污染 prompt |
| 错误处理 | `maxRetries: 3` + 超时配置 | 内置机制足够，无需自建 |
| 并发 | 外层 `Promise.all` | 每组独立 Agent 实例，互不影响 |
