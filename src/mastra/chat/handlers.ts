import type { Message, Thread } from 'chat';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { attachments } from './attachments';
import { slack } from './client';
import { handleCommand } from './commands';
import { rawText, withoutLeadingMentions } from './message';
import { threadState } from './state';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

const actionToken = z.looseObject({
  action_token: z.string().min(1).optional(),
});

const WORKING_REACTION = 'hourglass_flowing_sand';
const DONE_REACTION = 'white_check_mark';
const FAILED_REACTION = 'x';

async function withWorkingReaction(
  message: Message,
  run: () => Promise<void>
): Promise<void> {
  const { channel } = slack.decodeThreadId(message.threadId);
  const target = { channel, timestamp: message.id };
  await slack.webClient.reactions
    .add({ ...target, name: WORKING_REACTION })
    .catch(() => undefined);
  try {
    await run();
    await slack.webClient.reactions
      .add({ ...target, name: DONE_REACTION })
      .catch(() => undefined);
  } catch (error) {
    await slack.webClient.reactions
      .add({ ...target, name: FAILED_REACTION })
      .catch(() => undefined);
    throw error;
  } finally {
    await slack.webClient.reactions
      .remove({ ...target, name: WORKING_REACTION })
      .catch(() => undefined);
  }
}

async function captureSearchToken(thread: Thread, raw: unknown): Promise<void> {
  const parsed = actionToken.safeParse(raw);
  const searchToken = parsed.success ? parsed.data.action_token : undefined;
  if (searchToken) {
    await thread.setState({ searchToken });
  }
}

function isFromBot(message: Message): boolean {
  return (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  );
}

function comment(message: Message): boolean {
  for (const line of rawText(message).split('\n')) {
    if (withoutLeadingMentions(line).trimStart().startsWith('##')) {
      return true;
    }
  }
  return false;
}

async function respond(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  logger.info('[chat] turn started', {
    threadId: thread.id,
    author: message.author.userName,
    attachments: message.attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url ?? attachment.fetchMetadata?.url,
    })),
    text: message.text,
  });

  await withWorkingReaction(message, () =>
    defaultHandler(thread, attachments(message))
  );
}

export async function onMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  await captureSearchToken(thread, message.raw);
  if (isFromBot(message)) {
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
  }
  if (await handleCommand(thread, message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  await captureSearchToken(thread, message.raw);
  if (isFromBot(message) || comment(message)) {
    return;
  }
  const state = await threadState(thread);
  const isFollowingThread = state?.respondOnThreadMessages === true;
  if (!(isFollowingThread || message.isMention)) {
    return;
  }
  if (await handleCommand(thread, message)) {
    return;
  }
  if (!isFollowingThread) {
    // Force history backfill for one-off mid-thread mentions that Mastra already marked subscribed.
    await thread.unsubscribe().catch(() => undefined);
  }
  await respond(thread, message, defaultHandler);
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  await captureSearchToken(thread, message.raw);
  if (isFromBot(message)) {
    return;
  }
  if (await handleCommand(thread, message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}
