import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { input, summary, toolOutput } from '../../types/tools/index';

export const getPermalinkTool = createTool({
  id: 'get_permalink',
  description:
    'Get a permanent Slack URL for a message. Pass a full Slack message/thread id, or pass a message timestamp and optional channel id. The channel defaults to the current channel.',
  inputSchema: input({
    messageId: z.string().min(1),
    channelId: z.string().optional(),
  }),
  outputSchema: toolOutput({
    channelId: z.string(),
    messageTs: z.string(),
    permalink: z.url(),
  }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(output?.permalink ?? 'Permalink resolved'),
    },
  },
  execute: async ({ messageId, channelId }, context) => {
    const parts = messageId.startsWith('slack:') ? messageId.split(':') : [];
    const channel =
      parts[1] ??
      channelId ??
      channelContext(context?.requestContext).channelId;
    const messageTs = parts[2] ?? messageId;
    if (!channel) {
      throw new Error('Pass channelId or run inside the message channel.');
    }
    const response = await slack.webClient.chat.getPermalink({
      channel: rawId(channel),
      message_ts: messageTs,
    });
    if (!response.permalink) {
      throw new Error('Slack did not return a permalink for that message.');
    }
    return {
      channelId: `slack:${rawId(channel)}`,
      messageTs,
      permalink: response.permalink,
    };
  },
});
