import { logger } from '../lib/logger';
import { chat } from './instance';

export function registerEvents(): void {
  const bot = chat();

  bot.onAppHomeOpened((event) => {
    logger.info('[events] Agent DM opened', {
      channelId: event.channelId,
      userId: event.userId,
    });
  });
}
