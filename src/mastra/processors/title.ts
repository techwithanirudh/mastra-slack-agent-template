import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { slack } from '../chat/client';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { resolveMemoryThread } from '../lib/memory';

// Mastra's built-in generateTitle (see agents/orchestrator.ts's Memory config)
// already names the Mastra thread from the first exchange, which is what
// Studio shows on any platform. It never calls a platform API though, so
// Slack's assistant History-tab title (setAssistantTitle, Slack-only) is left
// unset. Mirror the title generateTitle already produced instead of paying for
// a second LLM call. Runs every DM turn; once thread.title exists this is a
// single cheap read, and it self-heals if generateTitle had not landed yet.
async function mirrorTitle(args: ProcessOutputResultArgs): Promise<void> {
  const ctx = channelContext(args.requestContext);
  const { agent } = args;
  if (!(agent && ctx.platform === 'slack' && ctx.isDM && ctx.threadId)) {
    return;
  }
  const { channel, threadTs } = slack.decodeThreadId(ctx.threadId);
  const { title } = await resolveMemoryThread(agent, ctx.threadId);
  if (!(threadTs && title)) {
    return;
  }
  await slack.setAssistantTitle(channel, threadTs, title);
}

export const title = {
  id: 'title',
  name: 'Slack Conversation Title',
  processOutputResult(args: ProcessOutputResultArgs) {
    mirrorTitle(args).catch((error: unknown) =>
      logger.warn('[title] failed to mirror thread title to Slack', { error })
    );
    return args.messages;
  },
};
