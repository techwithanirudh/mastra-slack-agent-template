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

export const mastra = new Mastra({
  // Registered here too (not just nested under orchestrator) so Studio can run them directly.
  agents: { orchestrator, summarizer, research, explore, execute },
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
