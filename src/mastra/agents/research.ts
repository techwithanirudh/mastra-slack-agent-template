import { Agent } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { logTools } from '../lib/logger/tools';
import { stepCountIs } from '../lib/tools';
import { scout } from '../providers';
import { slackCodeMode } from '../tools/code-mode/slack';
import { fetchUrlTool } from '../tools/fetch-url';
import { searchWebTool } from '../tools/search-web';
import { workspace } from '../workspace';

export const researchAgent = new Agent({
  id: 'research',
  name: 'Research',
  description:
    'Runs focused Slack, web, user, channel, and thread research, then returns compact sourced findings.',
  instructions: [
    'You are Research. Gather facts using Slack code mode and web tools. Canvases are persistent reference docs attached to a channel or shared standalone. Prefer compact sourced findings over raw dumps. Include links, thread ids, channel names, dates, and uncertainty when available. Do not edit files, run commands, upload files, edit or create canvases, or post messages. Keep total tool calls under 300, then write up your findings.',
    slackCodeMode.instructions,
  ],
  model: scout,
  hooks: logTools,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: {
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    slack: slackCodeMode.tool,
  },
  inputProcessors: [
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
      'search_web',
      'fetch_url',
      'slack',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(400),
  },
});
