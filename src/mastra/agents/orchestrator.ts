import { createPostgresState } from '@chat-adapter/state-pg';
import { Agent } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
  ToolSearchProcessor,
} from '@mastra/core/processors';
import { Memory } from '@mastra/memory';
import { env } from '@/env';
import { slack } from '../chat/client';
import {
  onDirectMessage,
  onMention,
  onSubscribedMessage,
} from '../chat/handlers';
import { toolDisplay } from '../chat/tool-display';
import { agent as config } from '../config';
import {
  logDelegationComplete,
  logDelegationStart,
  logTools,
} from '../lib/logger/tools';
import { stepCountIs, toolCall } from '../lib/tools';
import { outputProcessors } from '../processors';
import { footer } from '../processors/footer';
import { relocateToolResultImages } from '../processors/tool-media';
import { buildInstructions } from '../prompts';
import {
  orchestrator as orchestratorModel,
  summarizer as summarizerModel,
} from '../providers';
import { baseTools, deferredTools } from '../tools/base';
import { workspace } from '../workspace';
import { executeAgent } from './execute';
import { exploreAgent } from './explore';
import { researchAgent } from './research';

const orchestrator = new Agent({
  id: config.id,
  name: 'Orchestrator',
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  model: orchestratorModel,
  hooks: logTools,
  defaultOptions: {
    modelSettings: { maxOutputTokens: config.maxTokens.output },
    delegation: {
      onDelegationStart: logDelegationStart,
      onDelegationComplete: logDelegationComplete,
    },
    stopWhen: [
      toolCall('skip'),
      toolCall('leave_channel'),
      toolCall('wait'),
      stepCountIs(config.maxSteps),
    ],
  },
  workspace,
  inputProcessors: [
    new ToolSearchProcessor({
      tools: deferredTools,
      storage: 'context',
      search: {
        topK: 4,
        autoLoad: true,
      },
    }),
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat({
      additionalRules: [relocateToolResultImages],
    }),
    footer,
  ],
  outputProcessors,
  tools: baseTools,
  agents: {
    research: researchAgent,
    explore: exploreAgent,
    execute: executeAgent,
  },
  memory: new Memory({
    options: {
      lastMessages: 20,
      generateTitle: {
        model: summarizerModel[0].model,
        instructions:
          'Write a specific 3-6 word title for the conversation. Return only the title, no quotes or trailing punctuation.',
      },
      observationalMemory: {
        model: summarizerModel,
        observation: {
          modelSettings: { maxOutputTokens: config.maxTokens.output },
        },
        reflection: {
          modelSettings: { maxOutputTokens: config.maxTokens.output },
        },
        temporalMarkers: true,
        scope: 'thread',
      },
    },
  }),
  channels: {
    tools: false,
    state: createPostgresState({ url: env.DATABASE_URL }),
    chatOptions: {
      fallbackStreamingPlaceholderText: 'working...',
    },
    adapters: {
      slack: {
        adapter: slack,
        streaming: true,
        toolDisplay,
        formatError: (error) =>
          `*Oops, something went wrong.*\n\n> ${error.message}`,
      },
    },
    threadContext: { maxMessages: 10 },
    handlers: { onMention, onSubscribedMessage, onDirectMessage },
  },
});

export default orchestrator;
