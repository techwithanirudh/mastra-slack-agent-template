import { SlackAdapter } from '@chat-adapter/slack';

const mentionPattern = /<@([A-Z0-9_]+)(?:\|([^<>]+))?>/g;

interface SlackAppHomeOpenedEvent {
  channel: string;
  event_ts: string;
  tab: string;
  type: 'app_home_opened';
  user: string;
}

interface SlackWebhookPayload {
  event?: SlackAppHomeOpenedEvent | { type: string };
  type: string;
}

export class SlackAgentAdapter extends SlackAdapter {
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
