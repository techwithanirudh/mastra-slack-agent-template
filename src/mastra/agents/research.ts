import { Agent } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { logTools } from '../lib/logger/tools';
import { stepCountIs } from '../lib/tools';
import { scout } from '../providers';
import { canvasTools } from '../tools/canvas';
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
    'You are Research. Gather facts using Slack, web, user, channel, thread and canvas tools. Canvases are persistent reference docs (e.g. an agent directory, project brief, runbook) attached to a channel or shared standalone; check for one with list_canvases and read it with read_canvas when a question is about something a channel likely documents. Prefer compact sourced findings over raw dumps. Include links, thread ids, channel names, dates, and uncertainty when available. Do not edit files, run commands, upload files, edit or create canvases, or post messages. Keep total tool calls under 300, then write up your findings.',
  model: scout,
  hooks: logTools,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: {
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    list_threads: slackTools.list_threads,
    get_user: slackTools.get_user,
    get_channel_info: slackTools.get_channel_info,
    list_canvases: canvasTools.list_canvases,
    read_canvas: canvasTools.read_canvas,
    lookup_canvas_sections: canvasTools.lookup_canvas_sections,
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
      'list_threads',
      'get_user',
      'get_channel_info',
      'list_canvases',
      'read_canvas',
      'lookup_canvas_sections',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(400),
  },
});
