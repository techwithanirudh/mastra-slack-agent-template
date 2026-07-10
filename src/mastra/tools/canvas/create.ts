import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';

export const createCanvasTool = createTool({
  id: 'create_canvas',
  description:
    'Create the Canvas tab for a Slack channel, with an optional title and initial markdown content. Defaults to the current channel. Fails if that channel already has a canvas; use update_canvas to change it instead.',
  inputSchema: z.object({
    channelId: z
      .string()
      .optional()
      .describe('Channel id (slack:C...); defaults to the current channel.'),
    title: z.string().optional().describe('Optional canvas title.'),
    markdown: z
      .string()
      .optional()
      .describe('Optional initial markdown content.'),
  }),
  execute: async ({ channelId, title, markdown }, context) => {
    const ctx = channelContext(context?.requestContext);
    const id = channelId ?? ctx.channelId;
    if (!id) {
      throw new Error('No channel to create a canvas for.');
    }
    try {
      const result = await slack.webClient.conversations.canvases.create({
        channel_id: rawId(id),
        title,
        document_content: markdown ? { type: 'markdown', markdown } : undefined,
      });
      return {
        success: true,
        canvasId: result.canvas_id,
        message: `Created canvas ${result.canvas_id} for ${id}.`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('channel_canvas_already_exists')) {
        throw new Error(
          `${id} already has a canvas. Use update_canvas to change it instead.`,
          { cause: error }
        );
      }
      throw error;
    }
  },
});
