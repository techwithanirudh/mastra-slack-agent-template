import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../../chat/instance';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { input, summary, toolOutput } from '../../types/tools/index';

const outputSchema = toolOutput({
  channelId: z.string(),
  name: z.string().optional(),
  isDM: z.boolean(),
  memberCount: z.number().optional(),
  visibility: z.string().optional(),
});

export const getChannelInfoTool = createTool({
  id: 'get_channel_info',
  description:
    'Fetch metadata for a channel: name, member count, DM status, visibility. Defaults to the current channel.',
  inputSchema: input({
    channelId: z
      .string()
      .optional()
      .describe('Channel id (slack:C...); defaults to the current channel.'),
  }),
  outputSchema,
  transform: {
    display: {
      output: ({ output }) =>
        summary(output?.name ?? output?.channelId ?? 'Channel found'),
    },
  },
  execute: async ({ channelId }, context) => {
    const ctx = channelContext(context?.requestContext);
    const id = channelId ?? ctx.channelId;
    if (!id) {
      throw new Error('No channel to inspect.');
    }
    const info = await chat().channel(chatChannelId(id)).fetchMetadata();
    return {
      channelId: info.id,
      name: info.name,
      isDM: info.isDM ?? false,
      memberCount: info.memberCount,
      visibility: info.channelVisibility,
    };
  },
});
