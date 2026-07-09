import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveTarget, targetSchema } from '../../chat/target';

export const postMessageTool = createTool({
  id: 'post_message',
  description:
    'Post a markdown message to any Slack thread, channel, or user the bot can access. Your streamed reply already covers the current thread, so use this for an explicit destination.',
  inputSchema: z.object({
    ...targetSchema.shape,
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  execute: async ({ type, id, message }) => {
    const target = { type, id };
    try {
      const destination = await resolveTarget(target);
      const sent = await destination.post({ markdown: message });
      return {
        success: true,
        messageId: sent.id,
        threadId: sent.threadId,
        message: `Posted to ${target.type} ${target.id}.`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('channel_not_found')) {
        throw new Error(
          'Slack rejected the post with channel_not_found. For private channels this usually means the bot is not a member. Ask a member to invite the bot in that channel, then retry. If the channel is public, double-check the channel id.',
          { cause: error }
        );
      }
      if (reason.includes('not_in_channel')) {
        throw new Error(
          'Slack rejected the post with not_in_channel. Invite the bot to that channel, then retry.',
          { cause: error }
        );
      }
      throw error;
    }
  },
});
