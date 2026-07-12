import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';

const canvasFile = z
  .looseObject({
    id: z.string().optional(),
    title: z.string().optional(),
    name: z.string().optional(),
    created: z.number().optional(),
    updated: z.number().optional(),
    permalink: z.string().optional(),
  })
  .transform((f) => ({
    canvasId: f.id,
    title: f.title || f.name,
    created: f.created,
    updated: f.updated,
    permalink: f.permalink,
  }));

export const listCanvasesTool = createTool({
  id: 'list_canvases',
  description:
    'List Slack canvases (standalone or channel canvases). Defaults to the current channel; omit channelId for a workspace-wide list.',
  inputSchema: z.object({
    channelId: z
      .string()
      .optional()
      .describe(
        'Current channel id (slack:C...) to filter by; defaults to current.'
      ),
  }),
  execute: async ({ channelId }, context) => {
    const ctx = channelContext(context?.requestContext);
    const id = channelId ?? ctx.channelId;
    const response = await slack.webClient.files.list({
      types: 'canvas',
      ...(id ? { channel: rawId(id) } : {}),
    });
    const canvases = (response.files ?? []).map((f) => canvasFile.parse(f));
    return {
      success: true,
      canvases,
      count: canvases.length,
      message: `Found ${canvases.length} canvas${canvases.length === 1 ? '' : 'es'}${id ? ` in ${id}` : ''}.`,
    };
  },
});
