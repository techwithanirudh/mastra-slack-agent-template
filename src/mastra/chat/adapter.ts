import { SlackAdapter } from '@chat-adapter/slack';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

interface Recipient {
  teamId: string;
  userId: string;
}

export class SlackAgentAdapter extends SlackAdapter {
  // A scheduled run wakes an idle thread with no live message, so Chat SDK
  // can't supply the recipient_user_id/team_id that Slack's native streaming
  // needs outside a DM, and tool cards get dropped. Remember it per thread from
  // live messages so those runs reuse it. Postgres is the source of truth
  // (survives restarts); the Map only throttles writes.
  private readonly recipients = new Map<string, Recipient>();

  private recipientKey(threadId: string): string {
    return `stream-recipient:${threadId}`;
  }

  protected override handleMessageEvent(
    ...args: Parameters<SlackAdapter['handleMessageEvent']>
  ): ReturnType<SlackAdapter['handleMessageEvent']> {
    const [event] = args;
    const { chat } = this;
    const userId = event.user;
    const teamId = event.team_id ?? event.team;
    if (
      chat &&
      event.channel_type !== 'im' &&
      event.channel &&
      event.ts &&
      userId &&
      teamId
    ) {
      const threadId = this.encodeThreadId({
        channel: event.channel,
        threadTs: event.thread_ts || event.ts,
      });
      const known = this.recipients.get(threadId);
      if (!(known?.userId === userId && known.teamId === teamId)) {
        const recipient: Recipient = { userId, teamId };
        this.recipients.set(threadId, recipient);
        chat
          .getState()
          .set(this.recipientKey(threadId), recipient)
          .catch(() => undefined);
      }
    }
    return super.handleMessageEvent(...args);
  }

  override async stream(
    ...args: Parameters<SlackAdapter['stream']>
  ): ReturnType<SlackAdapter['stream']> {
    const [threadId, textStream, options] = args;
    const { channel } = this.decodeThreadId(threadId);
    const { chat } = this;
    if (
      channel.startsWith('D') ||
      (options?.recipientUserId && options?.recipientTeamId) ||
      !chat
    ) {
      return super.stream(...args);
    }
    let recipient = this.recipients.get(threadId);
    if (!recipient) {
      const stored = await chat
        .getState()
        .get<Recipient>(this.recipientKey(threadId));
      if (stored?.userId && stored.teamId) {
        recipient = stored;
        this.recipients.set(threadId, stored);
      }
    }
    if (!recipient) {
      return super.stream(...args);
    }
    return super.stream(threadId, textStream, {
      ...options,
      recipientUserId: recipient.userId,
      recipientTeamId: recipient.teamId,
    });
  }

  protected override async resolveInlineMentions(
    text: string,
    skipSelfMention: boolean
  ) {
    const mentionNames = new Map<string, string>();
    const missingIds = new Set<string>();
    const { botUserId } = this;

    for (const mention of text.matchAll(mentionPattern)) {
      const [, userId, label] = mention;
      if (
        !userId ||
        mentionNames.has(userId) ||
        (skipSelfMention && userId === botUserId)
      ) {
        continue;
      }
      if (label) {
        mentionNames.set(userId, label);
        continue;
      }
      missingIds.add(userId);
    }

    await Promise.all(
      [...missingIds].map(async (userId) => {
        const user = await this.lookupUser(userId);
        mentionNames.set(userId, user?.displayName ?? userId);
      })
    );

    if (mentionNames.size === 0) {
      return text;
    }

    return text.replace(mentionPattern, (token, userId: string) => {
      const name = mentionNames.get(userId);
      return name ? `@${name} (${userId})` : token;
    });
  }
}
