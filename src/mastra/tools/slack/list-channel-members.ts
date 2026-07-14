import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import {
  input,
  optionalCursor,
  summary,
  toolOutput,
} from '../../types/tools/index';

export const listChannelMembersTool = createTool({
  id: 'list_channel_members',
  description:
    'List member user ids for a Slack channel visible to the bot. Defaults to the current channel. Use get_user for profiles needed in the answer.',
  inputSchema: input({
    channelId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: optionalCursor,
  }),
  outputSchema: toolOutput({
    channelId: z.string(),
    members: z.array(z.string()),
    nextCursor: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(`Found ${output?.members.length ?? 0} members`),
    },
  },
  execute: async ({ channelId, limit, cursor }, context) => {
    const id = channelId ?? channelContext(context?.requestContext).channelId;
    if (!id) {
      throw new Error('No channel to list members from.');
    }
    const response = await slack.webClient.conversations.members({
      channel: rawId(id),
      cursor,
      limit,
    });
    return {
      channelId: `slack:${rawId(id)}`,
      members: response.members ?? [],
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  },
});
