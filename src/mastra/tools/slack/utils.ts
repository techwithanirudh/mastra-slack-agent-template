import type { Message } from 'chat';
import { slack } from '../../chat/client';
import { rawId } from '../../lib/ids';

export async function joinChannel(channelId: string): Promise<void> {
  try {
    await slack.webClient.conversations.join({
      channel: rawId(channelId),
    });
  } catch {
    /* Reads report inaccessible channels clearly. */
  }
}

export function slackThreadId({
  channelId,
  threadId,
}: {
  channelId?: string;
  threadId: string;
}): string {
  let channel = channelId ? rawId(channelId) : undefined;
  let timestamp = threadId;

  if (threadId.startsWith('slack:')) {
    ({ channel, threadTs: timestamp } = slack.decodeThreadId(threadId));
  } else {
    const permalink = threadId.match(/\/archives\/([CDG][A-Z0-9]+)\/p(\d+)/);
    channel = permalink?.[1] ?? channel;
    timestamp = permalink?.[2] ?? timestamp;
  }

  const compact = timestamp.replace('.', '');
  if (!(channel && /^\d{16}$/.test(compact))) {
    return threadId;
  }

  return slack.encodeThreadId({
    channel,
    threadTs: `${compact.slice(0, 10)}.${compact.slice(10)}`,
  });
}

export function formatMessage(message: Message) {
  return {
    id: message.id,
    threadId: message.threadId,
    text: message.text,
    author: {
      userId: message.author.userId,
      userName: message.author.userName,
      fullName: message.author.fullName,
      isBot: message.author.isBot,
      isMe: message.author.isMe,
    },
    dateSent: message.metadata.dateSent.toISOString(),
    edited: message.metadata.edited,
    isMention: message.isMention,
    attachments: message.attachments.map((a) => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      url: a.url,
    })),
  };
}
