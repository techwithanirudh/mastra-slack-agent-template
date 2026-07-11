import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { joinChannel } from './utils';

export const postMessageTool = createTool({
  id: 'post_message',
  description:
    'Post a markdown message to the current Slack thread or to a specific thread, channel, or user the bot can access.',
  inputSchema: z.object({
    target: targetSchema
      .optional()
      .describe('Optional destination. Defaults to the current thread.'),
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  execute: async ({ target, message }, context) => {
    const ctx = channelContext(context?.requestContext);
    const resolved =
      target ??
      (ctx.threadId
        ? { type: 'thread' as const, id: ctx.threadId }
        : undefined);
    if (!resolved?.id) {
      throw new Error('No Slack destination for post_message.');
    }
    try {
      if (resolved.type !== 'user') {
        await joinChannel(resolved.id);
      }
      const destination = await resolveTarget(resolved);
      const sent = await destination.post({ markdown: message });
      return {
        success: true,
        messageId: sent.id,
        threadId: sent.threadId,
        message: `Posted to ${resolved.type} ${resolved.id}.`,
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
