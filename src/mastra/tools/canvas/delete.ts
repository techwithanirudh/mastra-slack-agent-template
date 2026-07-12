import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { canvasIdSchema } from './utils';

export const deleteCanvasTool = createTool({
  id: 'delete_canvas',
  description: 'Delete a Slack canvas by id.',
  inputSchema: z.object({
    canvasId: canvasIdSchema,
  }),
  requireApproval: true,
  execute: async ({ canvasId }) => {
    await slack.webClient.canvases.delete({
      canvas_id: canvasId,
    });
    return {
      success: true,
      canvasId,
      message: `Deleted canvas ${canvasId}.`,
    };
  },
});
