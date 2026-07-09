import { logger } from '../../lib/logger';
import { resolveMemoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';

export const stop: CommandHandler = async (thread, message) => {
  const { agent } = await import('../../agents/agent');
  const memoryThread = await resolveMemoryThread(agent, thread.id).catch(
    () => undefined
  );
  const scope = memoryThread
    ? { threadId: memoryThread.id, resourceId: memoryThread.resourceId }
    : undefined;
  const activeRunId = scope ? agent.getActiveThreadRunId(scope) : undefined;

  if (!(scope && activeRunId)) {
    await thread
      .postEphemeral(message.author, 'Nothing to stop right now.', {
        fallbackToDM: false,
      })
      .catch((error: unknown) => {
        logger.warn('[commands] Failed to post stop feedback', {
          error,
          threadId: thread.id,
          userId: message.author.userId,
        });
      });
    return;
  }

  agent.abortThreadStream(scope);
  await thread.post({ markdown: '_Stopped._' });
};
