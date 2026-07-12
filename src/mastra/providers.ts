import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { env } from '@/env';

type ModelConfig = ModelWithRetries['model'] & { id: `${string}/${string}` };

function openrouter(id: `${string}/${string}`): ModelConfig {
  return {
    id: `openrouter/${id}`,
    apiKey: env.OPENROUTER_API_KEY,
    url: env.OPENROUTER_BASE_URL,
  };
}

function opencode(model: string): LanguageModelV3 {
  const provider = createOpenAICompatible({
    name: 'opencode-go',
    baseURL: 'https://opencode.ai/zen/go/v1',
    apiKey: env.OPENCODE_API_KEY,
  });
  return wrapLanguageModel({
    model: provider.chatModel(model),
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
}

function inference(id: `${string}/${string}`): ModelConfig {
  return {
    id: `openrouter/${id}`,
    apiKey: env.INFERENCE_API_KEY,
    url: env.INFERENCE_BASE_URL,
  };
}

export const orchestrator: ModelWithRetries[] = [
  ...(env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ model: inference('z-ai/glm-5.2'), maxRetries: 3 }]
    : []),

  ...(env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ model: inference('moonshotai/kimi-k2.7-code'), maxRetries: 3 }]
    : []),
  {
    model: openrouter('minimax/minimax-m3'),
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  },
  ...(env.OPENCODE_API_KEY
    ? [{ model: opencode('minimax-m3'), maxRetries: 3 }]
    : []),
];

export const summarizer: ModelWithRetries[] = [
  ...(env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ model: inference('deepseek/deepseek-v4-flash'), maxRetries: 3 }]
    : []),
  {
    model: openrouter('google/gemini-3.1-flash-lite'),
    maxRetries: 3,
  },
  ...(env.OPENCODE_API_KEY
    ? [{ model: opencode('mimo-v2.5'), maxRetries: 3 }]
    : []),
];

export const scout: ModelWithRetries[] = [
  ...(env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ model: inference('deepseek/deepseek-v4-flash'), maxRetries: 3 }]
    : []),
  {
    model: openrouter('deepseek/deepseek-v4-flash'),
    maxRetries: 3,
  },
  ...(env.OPENCODE_API_KEY
    ? [{ model: opencode('deepseek-v4-flash'), maxRetries: 3 }]
    : []),
];

export const explorer: ModelWithRetries[] = [
  ...(env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ model: inference('moonshotai/kimi-k2.6'), maxRetries: 3 }]
    : []),
  {
    model: openrouter('minimax/minimax-m3'),
    maxRetries: 3,
  },
  ...(env.OPENCODE_API_KEY
    ? [{ model: opencode('minimax-m3'), maxRetries: 3 }]
    : []),
];

export const executor: ModelWithRetries[] = [
  ...(env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ model: inference('z-ai/glm-5.2'), maxRetries: 3 }]
    : []),
  ...(env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ model: inference('moonshotai/kimi-k2.7-code'), maxRetries: 3 }]
    : []),
  ...(env.OPENCODE_API_KEY
    ? [{ model: opencode('kimi-k2.7-code'), maxRetries: 3 }]
    : []),
  {
    model: openrouter('moonshotai/kimi-k2.7-code'),
    maxRetries: 3,
  },
];

export const images = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
  compatibility: 'strict',
}).imageModel('google/gemini-3.1-flash-image');
