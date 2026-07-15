import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { parseSlackMessageUrl } from '../../lib/slack-message';
import { input, output } from '../../types/tools/index';

export const reactTool = createTool({
  id: 'react',
  description:
    'Add or remove an emoji reaction on a Slack message by current channel timestamp, channel/message id, or message URL.',
  inputSchema: input({
    channelId: z
      .string()
      .optional()
      .describe(
        'Slack channel id. Defaults to the current channel if omitted.'
      ),
    messageId: z
      .string()
      .optional()
      .describe('Slack message timestamp. Required unless url is given.'),
    url: z
      .url()
      .optional()
      .describe('Slack message URL, instead of channelId/messageId.'),
    action: z.enum(['add', 'remove']).default('add'),
    emoji: z.string().min(1).describe('Emoji name without colons.'),
  }),
  outputSchema: output({
    action: z.enum(['add', 'remove']),
    channelId: z.string(),
    messageId: z.string(),
    emoji: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `${output?.action === 'remove' ? 'Removed' : 'Added'} :${output?.emoji ?? ''}:`,
      }),
    },
  },
  execute: async (
    { channelId, messageId, url, action, emoji: emojiInput },
    context
  ) => {
    const target = url
      ? parseSlackMessageUrl(url)
      : {
          channel: rawId(
            channelId ?? channelContext(context?.requestContext).channelId ?? ''
          ),
          ts: messageId,
        };
    if (!target.channel) {
      throw new Error('No channel available for react.');
    }
    if (!target.ts) {
      throw new Error('Pass messageId or url.');
    }

    const emoji = emojiInput.replaceAll(':', '');
    const request = {
      channel: target.channel,
      name: emoji,
      timestamp: target.ts,
    };
    if (action === 'remove') {
      await slack.webClient.reactions.remove(request);
      return {
        action,
        channelId: `slack:${target.channel}`,
        messageId: target.ts,
        emoji,
      };
    }

    await slack.webClient.reactions.add(request);
    return {
      action,
      channelId: `slack:${target.channel}`,
      messageId: target.ts,
      emoji,
    };
  },
});
