import 'dotenv/config';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_APP_TOKEN: z.string().min(1),

    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
    HACKCLUB_API_KEY: z.string().min(1).optional(),
    INFERENCE_API_KEY: z.string().min(1).optional(),
    INFERENCE_BASE_URL: z.url().optional(),

    DATABASE_URL: z.url(),

    E2B_API_KEY: z.string().min(1),

    EXA_API_KEY: z.string().min(1),

    AGENTMAIL_API_KEY: z.string().min(1).optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
