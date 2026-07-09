import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { rawId } from '../../lib/ids';
import { parseSlackMessageUrl } from '../../lib/slack-message';

export const deleteMessageTool = createTool({
  id: 'delete_message',
  description:
    'Delete a Slack message by URL or channel and message id. Slack only permits the bot to delete messages it owns.',
  inputSchema: z.discriminatedUnion('source', [
    z.object({ source: z.literal('url'), url: z.url() }),
    z.object({
      source: z.literal('id'),
      channelId: z.string().min(1),
      messageId: z.string().min(1),
    }),
  ]),
  execute: async (input) => {
    const target =
      input.source === 'url'
        ? parseSlackMessageUrl(input.url)
        : { channel: rawId(input.channelId), ts: input.messageId };
    await slack.webClient.chat.delete({
      channel: target.channel,
      ts: target.ts,
    });
    return {
      success: true,
      message: `Deleted ${target.channel} ${target.ts}.`,
    };
  },
});
