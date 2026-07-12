import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { canvasIdSchema } from './utils';

export const readCanvasTool = createTool({
  id: 'read_canvas',
  description:
    "Read a Slack canvas's markdown content by its canvas id (e.g. F0123ABCD). Get the id from get_channel_info or create_canvas.",
  inputSchema: z.object({
    canvasId: canvasIdSchema,
  }),
  execute: async ({ canvasId }) => {
    const info = await slack.webClient.files.info({ file: canvasId });
    if (info.content === undefined) {
      throw new Error(`${canvasId} has no readable content.`);
    }
    return {
      success: true,
      canvasId,
      title: info.file?.title,
      markdown: info.content,
      truncated: info.is_truncated ?? false,
      message: info.is_truncated
        ? `Read canvas ${canvasId} (truncated, use permalink for the full content: ${info.file?.permalink}).`
        : `Read canvas ${canvasId}.`,
    };
  },
});
