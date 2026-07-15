import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { input, output } from '../../types/tools/index';
import { canvasIdSchema } from './utils';

export const readCanvasTool = createTool({
  id: 'read_canvas',
  description:
    "Read a Slack canvas's content as HTML by its canvas id (e.g. F0123ABCD). Get the id from get_channel_info or create_canvas.",
  inputSchema: input({
    canvasId: canvasIdSchema,
  }),
  outputSchema: output({
    canvasId: z.string(),
    title: z.string().optional(),
    html: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.title ?? output?.canvasId ?? 'Canvas read',
      }),
    },
  },
  execute: async ({ canvasId }) => {
    const info = await slack.webClient.files.info({ file: canvasId });
    const url = info.file?.url_private_download ?? info.file?.url_private;
    if (!url) {
      throw new Error(
        `Could not resolve a content URL for canvas ${canvasId}. It may have been deleted, or the bot may not have access to it.`
      );
    }
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to read canvas ${canvasId}: ${response.status}`);
    }
    const html = await response.text();
    return {
      canvasId,
      title: info.file?.title,
      html,
    };
  },
});
