import { Agent } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { logTools } from '../lib/logger/tools';
import { stepCountIs } from '../lib/tools';
import { scout } from '../providers';
import { fetchUrlTool } from '../tools/fetch-url';
import { searchWebTool } from '../tools/search-web';
import { slackTools } from '../tools/slack';
import { workspace } from '../workspace';

export const researchAgent = new Agent({
  id: 'research',
  name: 'Research',
  description:
    'Runs focused Slack, web, user, channel, and thread research, then returns compact sourced findings.',
  instructions:
    'You are Research. Gather facts using Slack and web tools. Canvases are persistent reference docs attached to a channel or shared standalone. Prefer compact sourced findings over raw dumps. Include links, thread ids, channel names, dates, and uncertainty when available. Do not edit files, run commands, upload files, edit or create canvases, or post messages. Keep total tool calls under 300, then write up your findings.',
  model: scout,
  hooks: logTools,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: {
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    get_user: slackTools.get_user,
    get_channel_info: slackTools.get_channel_info,
    get_permalink: slackTools.get_permalink,
    list_threads: slackTools.list_threads,
    list_channels: slackTools.list_channels,
    summarize_thread: slackTools.summarize_thread,
    get_slack_file: slackTools.get_slack_file,
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
      'search_slack',
      'read_conversation_history',
      'get_user',
      'get_channel_info',
      'get_permalink',
      'list_threads',
      'list_channels',
      'summarize_thread',
      'get_slack_file',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(400),
  },
});
