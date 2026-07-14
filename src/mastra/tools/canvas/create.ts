import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { assertCanManageChannel } from './utils';

export const createCanvasTool = createTool({
  id: 'create_canvas',
  description:
    'Create a standalone Slack canvas. Optionally share it with the current channel by passing that channel id.',
  inputSchema: z.object({
    title: z.string().min(1).optional(),
    channelId: z
      .string()
      .optional()
      .describe('Optional current channel id (slack:C...) to share into.'),
    markdown: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Initial markdown canvas content. Mentions use ![](@USER_ID) and ![](#CHANNEL_ID), not <@U123>.'
      ),
  }),
  execute: async ({ title, channelId, markdown }, context) => {
    const ctx = channelContext(context?.requestContext);
    if (channelId) {
      assertCanManageChannel({ channelId, ctx });
    }
    const response = await slack.webClient.canvases.create({
      ...(title ? { title } : {}),
      ...(channelId ? { channel_id: rawId(channelId) } : {}),
      ...(markdown
        ? { document_content: { type: 'markdown' as const, markdown } }
        : {}),
    });
    return {
      success: true,
      canvasId: response.canvas_id,
      message: `Created canvas ${response.canvas_id ?? ''}.`,
    };
  },
});

export const createChannelCanvasTool = createTool({
  id: 'create_channel_canvas',
  description:
    'Create the Canvas tab for a Slack channel. Defaults to the current channel. Fails if that channel already has a canvas; use edit_canvas to change it instead.',
  inputSchema: z.object({
    channelId: z
      .string()
      .optional()
      .describe('Current channel id (slack:C...); defaults to current.'),
    title: z.string().min(1).optional(),
    markdown: z.string().min(1).optional(),
  }),
  execute: async ({ channelId, title, markdown }, context) => {
    const ctx = channelContext(context?.requestContext);
    const targetChannelId = channelId ?? ctx.channelId;
    if (!targetChannelId) {
      throw new Error('No channel to create a channel canvas for.');
    }
    assertCanManageChannel({ channelId: targetChannelId, ctx });
    try {
      const response = await slack.webClient.conversations.canvases.create({
        channel_id: rawId(targetChannelId),
        ...(title ? { title } : {}),
        ...(markdown
          ? { document_content: { type: 'markdown' as const, markdown } }
          : {}),
      });
      return {
        success: true,
        channelId: rawId(targetChannelId),
        canvasId: response.canvas_id,
        message: `Created channel canvas ${response.canvas_id ?? ''}.`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('channel_canvas_already_exists')) {
        throw new Error(
          `${targetChannelId} already has a canvas. Use edit_canvas to change it instead.`,
          { cause: error }
        );
      }
      throw error;
    }
  },
});
