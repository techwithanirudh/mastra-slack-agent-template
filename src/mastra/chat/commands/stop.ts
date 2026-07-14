import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';

export const stop: CommandHandler = async ({ message, thread }) => {
  const { default: orchestrator } = await import('../../agents/orchestrator');
  const threadMemory = await memoryThread({
    agent: orchestrator,
    externalThreadId: thread.id,
  }).catch(() => undefined);
  const scope = threadMemory
    ? { threadId: threadMemory.id, resourceId: threadMemory.resourceId }
    : undefined;
  const activeRunId = scope
    ? orchestrator.getActiveThreadRunId(scope)
    : undefined;

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

  orchestrator.abortThreadStream(scope);
  await thread.post({ markdown: '_Stopped._' });
};
