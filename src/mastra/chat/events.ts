import { logger } from '../lib/logger';
import { publishHome } from './app-home';
import { slack } from './client';
import { content } from './content';
import { chat } from './instance';

async function setStarters({
  channelId,
  threadTs,
}: {
  channelId: string;
  threadTs: string;
}): Promise<void> {
  await slack
    .setSuggestedPrompts(channelId, threadTs, content.starters)
    .catch((error: unknown) =>
      logger.error('[events] setSuggestedPrompts failed', { error })
    );
}

export function registerEvents(): void {
  const bot = chat();

  bot.onAssistantThreadStarted((event) =>
    setStarters({ channelId: event.channelId, threadTs: event.threadTs })
  );

  bot.onAssistantContextChanged((event) =>
    setStarters({ channelId: event.channelId, threadTs: event.threadTs })
  );

  bot.onAppHomeOpened((event) => publishHome(event.userId));
}
