import { Agent } from '@mastra/core/agent';
import {
  TokenLimiterProcessor,
  ToolSearchProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { logTools } from '../lib/logger/tools';
import { stepCountIs } from '../lib/tools';
import { scout } from '../providers';
import { baseTools, deferredTools } from '../tools/base';
import { workspace } from '../workspace';

export const researchAgent = new Agent({
  id: 'research',
  name: 'Research',
  description:
    'Runs focused Slack, web, user, channel, and thread research, then returns compact sourced findings.',
  instructions:
    'You are Research. Gather facts using Slack, web, user, channel, and thread tools. Prefer compact sourced findings over raw dumps. Include links, thread ids, channel names, dates, and uncertainty when available. Do not edit files, run commands, upload files, or post messages. Keep total tool calls under 300, then write up your findings.',
  model: scout,
  hooks: logTools,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: baseTools,
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
  ],
  defaultOptions: {
    activeTools: [
      'skill',
      'skill_search',
      'skill_read',
      'search_tools',
      'search_web',
      'fetch_url',
      'search_slack',
      'read_conversation_history',
      'list_threads',
      'get_user',
      'get_channel_info',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(400),
  },
});
