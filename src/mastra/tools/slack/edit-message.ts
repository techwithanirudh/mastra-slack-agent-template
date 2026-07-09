import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { rawId } from '../../lib/ids';
import { parseSlackMessageUrl } from '../../lib/slack-message';

export const editMessageTool = createTool({
  id: 'edit_message',
  description:
    'Edit a Slack message by URL or channel and message id. Slack only permits the bot to edit messages it owns.',
  inputSchema: z.discriminatedUnion('source', [
    z.object({
      source: z.literal('url'),
      url: z.url(),
      message: z.string().min(1),
    }),
    z.object({
      source: z.literal('id'),
      channelId: z.string().min(1),
      messageId: z.string().min(1),
      message: z.string().min(1),
    }),
  ]),
  execute: async (input) => {
    const target =
      input.source === 'url'
        ? parseSlackMessageUrl(input.url)
        : { channel: rawId(input.channelId), ts: input.messageId };
    await slack.webClient.chat.update({
      channel: target.channel,
      ts: target.ts,
      text: input.message,
    });
    return {
      success: true,
      message: `Edited ${target.channel} ${target.ts}.`,
    };
  },
});
