import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { summarizer } from '../agents/summarizer';
import { slack } from '../chat/client';
import { chat } from '../chat/instance';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

function firstUserText(args: ProcessOutputResultArgs): string {
  return (
    [...args.messages]
      .reverse()
      .find((message) => message.role === 'user')
      ?.content.parts.flatMap((part) =>
        part.type === 'text' ? [part.text] : []
      )
      .join('\n') ?? ''
  );
}

// Name a Slack DM in the assistant History tab once, from its first exchange.
// Mastra's built-in generateTitle already sets the platform-agnostic thread
// title shown in Studio; this adds the Slack-specific surface Mastra can't set.
// Runs after the reply so the title reflects both sides.
async function applyTitle(args: ProcessOutputResultArgs): Promise<void> {
  const ctx = channelContext(args.requestContext);
  const reply = args.result.text.trim();
  if (!(ctx.platform === 'slack' && ctx.isDM && ctx.threadId && reply)) {
    return;
  }
  const { channel, threadTs } = slack.decodeThreadId(ctx.threadId);
  if (!threadTs) {
    return;
  }
  const state = chat().getState();
  const titledKey = `dm-titled:${channel}`;
  if (await state.get<boolean>(titledKey)) {
    return;
  }
  const prompt = firstUserText(args);
  if (!prompt) {
    return;
  }
  const { text } = await summarizer.generate(
    `Write a specific 3-6 word title for this conversation. Return only the title, without quotes or trailing punctuation.\n\nUser: ${prompt}\nAssistant: ${reply}`
  );
  const name = text.trim().replace(/^["']|["']$/g, '');
  if (!name) {
    return;
  }
  await slack.setAssistantTitle(channel, threadTs, name);
  await state.set(titledKey, true);
}

// Fire-and-forget so title generation never delays the reply.
export const title = {
  id: 'title',
  name: 'Conversation Title',
  processOutputResult(args: ProcessOutputResultArgs) {
    applyTitle(args).catch((error: unknown) =>
      logger.warn('[title] failed to set conversation title', { error })
    );
    return args.messages;
  },
};
