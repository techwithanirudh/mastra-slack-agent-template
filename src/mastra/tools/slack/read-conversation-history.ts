import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { formatMessage, joinChannel } from './utils';

export const readConversationHistoryTool = createTool({
  id: 'read_conversation_history',
  description:
    'Read recent raw messages from any Slack channel or thread the bot can access when exact wording matters. For a long thread, prefer summarize_thread so the full transcript stays out of model context.',
  inputSchema: z.discriminatedUnion('source', [
    z.object({
      source: z.literal('current_thread'),
      limit: z.coerce.number().int().min(1).max(200).default(40),
      cursor: z
        .string()
        .optional()
        .describe('Slack pagination cursor from a previous response.'),
    }),
    z.object({
      source: z.literal('thread'),
      threadId: z.string().min(1).describe('Thread id (slack:C...:ts).'),
      limit: z.coerce.number().int().min(1).max(200).default(40),
      cursor: z
        .string()
        .optional()
        .describe('Slack pagination cursor from a previous response.'),
    }),
    z.object({
      source: z.literal('channel'),
      channelId: z.string().min(1).describe('Channel id (slack:C...).'),
      limit: z.coerce.number().int().min(1).max(200).default(40),
      cursor: z
        .string()
        .optional()
        .describe('Slack pagination cursor from a previous response.'),
    }),
  ]),
  execute: async (input, context) => {
    const ctx = channelContext(context?.requestContext);
    let tid: string | undefined;
    if (input.source === 'thread') {
      tid = input.threadId;
    } else if (input.source === 'current_thread') {
      tid = ctx.threadId;
    }

    let resolvedChannelId: string | undefined;
    if (input.source === 'channel') {
      resolvedChannelId = input.channelId;
    } else if (tid) {
      resolvedChannelId = slack.decodeThreadId(tid).channel;
    }
    if (!resolvedChannelId) {
      throw new Error('No channel or thread available to read.');
    }

    const chId = chatChannelId(resolvedChannelId);
    await joinChannel(chId);

    const result = tid
      ? await slack.fetchMessages(tid, {
          limit: input.limit,
          cursor: input.cursor,
        })
      : await slack.fetchChannelMessages(chId, {
          limit: input.limit,
          cursor: input.cursor,
        });

    return {
      success: true,
      channelId: chId,
      messages: result.messages.map(formatMessage),
      nextCursor: result.nextCursor,
      message: `Read ${result.messages.length} message${result.messages.length === 1 ? '' : 's'} from ${tid ?? chId}.`,
    };
  },
});
