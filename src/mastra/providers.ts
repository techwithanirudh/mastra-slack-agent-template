import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';

type ModelId = `${string}/${string}`;
type GatewayConfig = ModelWithRetries['model'] & { id: ModelId };

const openrouterOptions = {
  provider: { only: ['DigitalOcean'] },
};

function hackclub(id: ModelId): GatewayConfig[] {
  return env.HACKCLUB_API_KEY
    ? [
        {
          id,
          apiKey: env.HACKCLUB_API_KEY,
          url: 'https://ai.hackclub.com/proxy/v1',
        },
      ]
    : [];
}

function inference(id: ModelId): GatewayConfig[] {
  return env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ id, apiKey: env.INFERENCE_API_KEY, url: env.INFERENCE_BASE_URL }]
    : [];
}

export const orchestrator: ModelWithRetries[] = [
  ...hackclub('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: {
      openrouter: { ...openrouterOptions, reasoningEffort: 'medium' },
    },
  })),
  ...inference('openrouter/moonshotai/kimi-k2.6').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const summarizer: ModelWithRetries[] = [
  ...hackclub('openrouter/google/gemini-3.1-flash-lite').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  })),
  ...inference('openrouter/deepseek/deepseek-v4-flash').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const scout: ModelWithRetries[] = [
  ...hackclub('openrouter/deepseek/deepseek-v4-flash').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  })),
  ...inference('openrouter/deepseek/deepseek-v4-flash').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const explorer: ModelWithRetries[] = [
  ...hackclub('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  })),
  ...inference('openrouter/moonshotai/kimi-k2.6').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const executor: ModelWithRetries[] = [
  ...hackclub('openrouter/moonshotai/kimi-k2.7-code').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: { openrouter: openrouterOptions },
  })),
  ...inference('openrouter/z-ai/glm-5.2').map((model) => ({
    model,
    maxRetries: 3,
  })),
  ...inference('openrouter/moonshotai/kimi-k2.7-code').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const images = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
  compatibility: 'strict',
}).imageModel('google/gemini-3.1-flash-image');
