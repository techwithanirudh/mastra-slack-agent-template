import type { ModelWithRetries } from '@mastra/core/agent';
import { env } from '@/env';

type ModelConfig = ModelWithRetries['model'] & { id: `${string}/${string}` };

function openRouter(id: `${string}/${string}`): ModelConfig {
  return {
    id,
    apiKey: env.OPENROUTER_API_KEY,
    url: env.OPENROUTER_BASE_URL,
  };
}

export const orchestrator: ModelWithRetries[] = [
  {
    model: openRouter('openrouter/minimax/minimax-m3'),
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  },
];

export const summarizer: ModelWithRetries[] = [
  {
    model: openRouter('openrouter/google/gemini-3.1-flash-lite'),
    maxRetries: 3,
  },
];

export const scout: ModelWithRetries[] = [
  {
    model: openRouter('openrouter/deepseek/deepseek-v4-flash'),
    maxRetries: 3,
  },
];

export const explorer: ModelWithRetries[] = [
  {
    model: openRouter('openrouter/minimax/minimax-m3'),
    maxRetries: 3,
  },
];

export const images = {
  id: 'google/gemini-3.1-flash-image',
  apiKey: env.OPENROUTER_API_KEY,
  url: env.OPENROUTER_BASE_URL,
};
