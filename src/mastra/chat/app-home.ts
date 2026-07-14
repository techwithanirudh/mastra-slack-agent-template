import { logger } from '../lib/logger';
import { slack } from './client';
import { content } from './content';

export function publishHome(userId: string): Promise<void> {
  return slack
    .publishHomeView(userId, content.home)
    .catch((error: unknown) =>
      logger.error('[app-home] publish failed', { error })
    );
}
