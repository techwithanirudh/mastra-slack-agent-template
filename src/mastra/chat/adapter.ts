import { SlackAdapter } from '@chat-adapter/slack';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

interface SlackAppHomeOpenedEvent {
  channel: string;
  context?: SlackAgentContext;
  event_ts: string;
  tab: string;
  type: 'app_home_opened';
  user: string;
}

interface SlackAgentContext {
  entities?: Array<{
    team_id?: string;
    type: string;
    value: string;
  }>;
}

interface SlackAppContextChangedEvent {
  channel: string;
  context?: SlackAgentContext;
  event_ts: string;
  type: 'app_context_changed';
  user: string;
}

interface SlackWebhookPayload {
  event?:
    | SlackAppContextChangedEvent
    | SlackAppHomeOpenedEvent
    | { type: string };
  type: string;
}

export class SlackAgentAdapter extends SlackAdapter {
  // Agent-view DMs deliver top-level `message.im` events with no thread_ts, so
  // the base adapter encodes threadTs="" and its native streamer skips them
  // (chat.startStream needs a thread_ts). Slack's agent docs stream the reply
  // under the user's message ts instead. That ts can't ride the threadId,
  // because the threadId is the channel-scoped conversation key that
  // thread-scoped memory is stored under; reusing it per message would splinter
  // memory into one thread per turn. So the reply ts is carried out-of-band:
  // captured per DM channel on the way in, applied only to the stream.
  private readonly dmReplyThreadTs = new Map<string, string>();

  // For a top-level DM (no thread_ts), returns the same threadId re-encoded with
  // the captured reply anchor, so streaming, posts, and status all target a real
  // thread_ts. Returns null when no anchoring is needed (channels, in-thread DMs,
  // or an anchor we never captured), meaning the caller should use its threadId
  // as-is.
  private anchoredDmThreadId(threadId: string): string | null {
    const { channel, threadTs } = this.decodeThreadId(threadId);
    if (!(channel.startsWith('D') && !threadTs)) {
      return null;
    }
    const replyThreadTs = this.dmReplyThreadTs.get(channel);
    return replyThreadTs
      ? this.encodeThreadId({ channel, threadTs: replyThreadTs })
      : null;
  }

  protected override handleMessageEvent(
    ...args: Parameters<SlackAdapter['handleMessageEvent']>
  ): ReturnType<SlackAdapter['handleMessageEvent']> {
    const [event] = args;
    if (event.channel_type === 'im' && event.channel && event.ts) {
      this.dmReplyThreadTs.set(event.channel, event.thread_ts ?? event.ts);
    }
    return super.handleMessageEvent(...args);
  }

  override async stream(
    ...args: Parameters<SlackAdapter['stream']>
  ): ReturnType<SlackAdapter['stream']> {
    const [threadId, textStream, options] = args;
    const anchored = this.anchoredDmThreadId(threadId);
    if (!anchored) {
      return super.stream(...args);
    }
    const sent = await super.stream(anchored, textStream, options);
    return sent ? { ...sent, threadId } : sent;
  }

  override startTyping(
    ...args: Parameters<SlackAdapter['startTyping']>
  ): ReturnType<SlackAdapter['startTyping']> {
    const [threadId, status] = args;
    const anchored = this.anchoredDmThreadId(threadId);
    return anchored
      ? super.startTyping(anchored, status)
      : super.startTyping(...args);
  }

  override async postMessage(
    ...args: Parameters<SlackAdapter['postMessage']>
  ): ReturnType<SlackAdapter['postMessage']> {
    const [threadId, message] = args;
    const anchored = this.anchoredDmThreadId(threadId);
    if (!anchored) {
      return super.postMessage(...args);
    }
    const sent = await super.postMessage(anchored, message);
    return { ...sent, threadId };
  }

  protected handleAppContextChanged(
    event: SlackAppContextChangedEvent,
    ..._args: Parameters<SlackAdapter['processEventPayload']> extends [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ): void {
    const channelContext = event.context?.entities?.find(
      (entity) => entity.type === 'slack#/types/channel_id'
    );
    this.chat?.processAssistantContextChanged({
      adapter: this,
      channelId: event.channel,
      context: {
        channelId: channelContext?.value,
        teamId: channelContext?.team_id,
      },
      threadId: this.encodeThreadId({ channel: event.channel, threadTs: '' }),
      threadTs: '',
      userId: event.user,
    });
  }

  protected override handleAppHomeOpened(
    event: SlackAppHomeOpenedEvent,
    ...args: Parameters<SlackAdapter['handleAppHomeOpened']> extends [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ): ReturnType<SlackAdapter['handleAppHomeOpened']> {
    if (event.tab !== 'messages') {
      return;
    }
    return super.handleAppHomeOpened(event, ...args);
  }

  protected override processEventPayload(
    payload: SlackWebhookPayload,
    ...args: Parameters<SlackAdapter['processEventPayload']> extends [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ): ReturnType<SlackAdapter['processEventPayload']> {
    if (
      payload.event?.type === 'app_home_opened' &&
      'tab' in payload.event &&
      payload.event.tab === 'messages'
    ) {
      this.handleAppHomeOpened(payload.event, ...args);
      return;
    }
    if (
      payload.event?.type === 'app_context_changed' &&
      'channel' in payload.event &&
      'user' in payload.event
    ) {
      this.handleAppContextChanged(payload.event, ...args);
      return;
    }
    return super.processEventPayload(payload, ...args);
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
