import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';

type ModelConfig = ModelWithRetries['model'] & { id: `${string}/${string}` };

function openrouter(id: `${string}/${string}`): ModelConfig {
  return {
    id: `openrouter/${id}`,
    apiKey: env.OPENROUTER_API_KEY,
    url: env.OPENROUTER_BASE_URL,
  };
}

export const orchestrator: ModelWithRetries[] = [
  {
    model: openrouter('moonshotai/kimi-k2.6'),
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  },
];

export const summarizer: ModelWithRetries[] = [
  {
    model: openrouter('google/gemini-3.1-flash-lite'),
    maxRetries: 3,
  },
];

export const scout: ModelWithRetries[] = [
  {
    model: openrouter('deepseek/deepseek-v4-flash'),
    maxRetries: 3,
  },
];

export const explorer: ModelWithRetries[] = [
  {
    model: openrouter('minimax/minimax-m3'),
    maxRetries: 3,
  },
];

export const images = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
  compatibility: 'strict',
}).imageModel('google/gemini-3.1-flash-image');
