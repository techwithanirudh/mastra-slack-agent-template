import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';

const openrouterOptions = {
  provider: { only: ['DigitalOcean'] },
};

export const orchestrator: ModelWithRetries[] = [
  {
    model: 'openrouter/minimax/minimax-m3',
    maxRetries: 3,
    providerOptions: {
      openrouter: { ...openrouterOptions, reasoningEffort: 'medium' },
    },
  },
];

export const summarizer: ModelWithRetries[] = [
  {
    model: 'openrouter/google/gemini-3.1-flash-lite',
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  },
];

export const scout: ModelWithRetries[] = [
  {
    model: 'openrouter/deepseek/deepseek-v4-flash',
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  },
];

export const explorer: ModelWithRetries[] = [
  {
    model: 'openrouter/minimax/minimax-m3',
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  },
];

export const executor: ModelWithRetries[] = [
  {
    model: 'openrouter/moonshotai/kimi-k2.7-code',
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  },
];

export const images = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
  compatibility: 'strict',
}).imageModel('google/gemini-3.1-flash-image');
