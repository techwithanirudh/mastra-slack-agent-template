import type { BackgroundTask } from '@mastra/core/background-tasks';
import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { DuckDBStore } from '@mastra/duckdb';
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import { env } from '@/env';
import { executeAgent as execute } from './agents/execute';
import { exploreAgent as explore } from './agents/explore';
import orchestrator from './agents/orchestrator';
import { researchAgent as research } from './agents/research';
import { summarizer } from './agents/summarizer';
import { registerEvents } from './chat/events';
import { setChat } from './chat/instance';
import { logger } from './lib/logger';

process.on('unhandledRejection', (error: unknown) => {
  logger.error('[process] unhandled rejection', { error });
});
process.on('uncaughtException', (error: Error) => {
  logger.error('[process] uncaught exception', { error });
});

// A background task finishes after its dispatching turn already ended, so
// nothing is left to surface the result. Wake the thread via sendSignal, the
// same path wait.ts and scheduled tasks use.
async function wakeThreadForBackgroundTask(
  task: BackgroundTask,
  contents: string
): Promise<void> {
  const { threadId, resourceId } = task;
  if (!(threadId && resourceId)) {
    logger.warn('[background-tasks] task has no thread/resource to wake', {
      taskId: task.id,
      toolName: task.toolName,
    });
    return;
  }
  const { accepted } = orchestrator.sendSignal(
    { type: 'notification', tagName: 'background-task', contents },
    {
      resourceId,
      threadId,
      ifActive: { behavior: 'persist' },
      ifIdle: { behavior: 'wake' },
    }
  );
  try {
    await accepted;
  } catch (error) {
    logger.error('[background-tasks] failed to wake thread after task', {
      taskId: task.id,
      threadId,
      error,
    });
  }
}

export const mastra = new Mastra({
  // Registered here too (not just nested under orchestrator) so Studio can run them directly.
  agents: { orchestrator, summarizer, research, explore, execute },
  backgroundTasks: {
    enabled: true,
    onTaskComplete: (task) =>
      wakeThreadForBackgroundTask(
        task,
        `Background task "${task.toolName}" finished. Its result is already in this conversation; continue and respond to it.`
      ),
    onTaskFailed: (task) =>
      wakeThreadForBackgroundTask(
        task,
        `Background task "${task.toolName}" failed${task.error?.message ? `: ${task.error.message}` : '.'} Continue the conversation accordingly.`
      ),
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new PostgresStore({
      id: 'main-storage',
      connectionString: env.DATABASE_URL,
    }),
    domains: {
      observability: await new DuckDBStore({
        path: './observability.duckdb',
      }).getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'orchestrator',
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  logger,
});

await mastra.startWorkers();

orchestrator
  .getChannels()
  ?.initialize(mastra)
  .then(() => {
    const sdk = orchestrator.getChannels()?.sdk;
    if (!sdk) {
      return;
    }
    setChat(sdk);
    registerEvents();
    logger.info('[agent] online');
  })
  .catch((error: unknown) =>
    logger.error('[agent] initialization failed', { error })
  );
