import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { parseSlackMessageUrl } from '../../lib/slack-message';

const reactionFields = {
  action: z.enum(['add', 'remove']).default('add'),
  emoji: z.string().min(1).describe('Emoji name without colons.'),
};

export const reactTool = createTool({
  id: 'react',
  description:
    'Add or remove an emoji reaction on a Slack message. Use action "add" to acknowledge the current message without sending text.',
  inputSchema: z.discriminatedUnion('source', [
    z.object({
      source: z.literal('current_channel'),
      messageId: z.string().min(1).describe('Slack message timestamp.'),
      ...reactionFields,
    }),
    z.object({
      source: z.literal('id'),
      channelId: z.string().min(1).describe('Slack channel id.'),
      messageId: z.string().min(1).describe('Slack message timestamp.'),
      ...reactionFields,
    }),
    z.object({
      source: z.literal('url'),
      url: z.url().describe('Slack message URL.'),
      ...reactionFields,
    }),
  ]),
  execute: async (input, context) => {
    const target =
      input.source === 'url'
        ? parseSlackMessageUrl(input.url)
        : {
            channel:
              input.source === 'id'
                ? rawId(input.channelId)
                : rawId(
                    channelContext(context?.requestContext).channelId ?? ''
                  ),
            ts: input.messageId,
          };
    if (!target.channel) {
      throw new Error('No channel available for react.');
    }

    const emoji = input.emoji.replaceAll(':', '');
    const request = {
      channel: target.channel,
      name: emoji,
      timestamp: target.ts,
    };
    if (input.action === 'remove') {
      await slack.webClient.reactions.remove(request);
      return {
        success: true,
        message: `Removed :${emoji}: from ${target.channel} ${target.ts}.`,
      };
    }

    await slack.webClient.reactions.add(request);
    return {
      success: true,
      message: `Added :${emoji}: to ${target.channel} ${target.ts}.`,
    };
  },
});
