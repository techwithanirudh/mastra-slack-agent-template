import { SlackFormatConverter } from '@chat-adapter/slack';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { joinChannel } from './utils';

const markdownConverter = new SlackFormatConverter();

async function resolveChannelAndThread(resolved: {
  type: 'thread' | 'channel' | 'user';
  id: string;
}): Promise<{ channel: string; threadTs?: string }> {
  if (resolved.type === 'thread') {
    const { channel, threadTs } = slack.decodeThreadId(resolved.id);
    return { channel, threadTs };
  }
  if (resolved.type === 'channel') {
    return { channel: rawId(resolved.id) };
  }
  const dm = await resolveTarget(resolved);
  return { channel: rawId(dm.id) };
}

export const postMessageTool = createTool({
  id: 'post_message',
  description: `Post a markdown message to the current Slack thread, or to a specific thread, channel, or user.

Defaults to the current thread; pass target only when posting somewhere else. Your streamed reply already covers the current thread, so avoid posting the same message twice.

Every post automatically shows who requested it as the Slack display name, do not add that yourself in the message text; there is no way to override or customize this.

Errors: channel_not_found usually means the bot isn't a member of that private channel; not_in_channel means it hasn't joined yet. Either way, tell the user to invite the bot there.`,
  inputSchema: z.object({
    target: targetSchema
      .optional()
      .describe('Optional destination. Defaults to the current thread.'),
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  requireApproval: true,
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
      const { channel, threadTs } = await resolveChannelAndThread(resolved);
      const requesterUser = ctx.userId
        ? await chat()
            .getUser(ctx.userId)
            .catch(() => null)
        : null;
      const requester = requesterUser?.userName ?? ctx.userName;
      const name = ctx.botUserName ?? 'bot';
      const username = requester ? `${requester} [${name}]` : name;
      const sent = await slack.webClient.chat.postMessage({
        channel,
        ...(threadTs ? { thread_ts: threadTs } : {}),
        ...markdownConverter.toSlackPayload({ markdown: message }),
        username,
      });
      return {
        success: true,
        messageId: sent.ts,
        threadId: threadTs,
        message: `Posted to ${resolved.type} ${resolved.id} as "${username}".`,
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
