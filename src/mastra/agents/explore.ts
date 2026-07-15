import { Agent } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { logTools } from '../lib/logger/tools';
import { stepCountIs } from '../lib/tools';
import { sandbox } from '../processors/sandbox';
import { moveToolImages } from '../processors/tool-media';
import { explorer } from '../providers';
import { fetchUrlTool } from '../tools/fetch-url';
import { grepTool } from '../tools/grep';
import { searchWebTool } from '../tools/search-web';
import { slackTools } from '../tools/slack';
import { workspace } from '../workspace';

export const exploreAgent = new Agent({
  id: 'explore',
  name: 'Explore',
  description:
    'Reads workspace files and gathers implementation context without making changes.',
  instructions:
    'You are Explore. Inspect the workspace and gather context. Do not modify files, delete files, upload files, post messages, or run risky commands. Keep total tool calls under 300, then write up your findings. Return concise findings with file paths, facts, and uncertainties.',
  model: explorer,
  hooks: logTools,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: {
    grep: grepTool,
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    list_threads: slackTools.list_threads,
    get_user: slackTools.get_user,
    get_channel_info: slackTools.get_channel_info,
    get_slack_file: slackTools.get_slack_file,
  },
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat({
      additionalRules: [moveToolImages],
    }),
  ],
  defaultOptions: {
    activeTools: [
      'skill',
      'skill_search',
      'skill_read',
      'read_file',
      'list_files',
      'grep',
      'file_stat',
      'search_web',
      'fetch_url',
      'search_slack',
      'read_conversation_history',
      'list_threads',
      'get_user',
      'get_channel_info',
      'get_slack_file',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(400),
  },
  outputProcessors: [sandbox],
});
