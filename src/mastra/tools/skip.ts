import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const skipTool = createTool({
  id: 'skip',
  description:
    'End this turn silently when no response is needed. Call this tool by itself with no streamed text and no other tool calls.',
  inputSchema: z.object({
    reason: z
      .string()
      .optional()
      .describe('Optional short reason for skipping.'),
  }),
  execute: async () => ({
    success: true,
    message: 'Skipped',
  }),
});
