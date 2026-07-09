import { Mastra } from '@mastra/core/mastra';
import {
  MastraPlatformExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import { env } from '../env';
import { agent } from './agents/agent';
import { summarizerAgent } from './agents/summarizer';
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
  agents: { agent, summarizerAgent },
  storage: new PostgresStore({
    id: 'agent-storage',
    connectionString: env.DATABASE_URL,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'agent',
        exporters: [
          new MastraPlatformExporter({
            accessToken: env.MASTRA_PLATFORM_ACCESS_TOKEN,
            projectId: env.MASTRA_PROJECT_ID,
          }),
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  logger,
});

await mastra.startWorkers();

agent
  .getChannels()
  ?.initialize(mastra)
  .then(() => {
    const sdk = agent.getChannels()?.sdk;
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
