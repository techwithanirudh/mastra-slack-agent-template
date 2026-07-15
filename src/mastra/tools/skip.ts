import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input } from '../types/tools/index';

export const skipTool = createTool({
  id: 'skip',
  description:
    'End this turn silently when no response is needed. Call this tool by itself with no streamed text and no other tool calls.',
  inputSchema: input({
    reason: z
      .string()
      .optional()
      .describe('Optional short reason for skipping.'),
  }),
  transform: { display: { output: () => ({ summary: 'Skipped' }) } },
  execute: async () => ({}),
});
