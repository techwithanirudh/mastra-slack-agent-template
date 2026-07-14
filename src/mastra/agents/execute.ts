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
import { relocateToolResultImages } from '../processors/tool-media';
import { executor } from '../providers';
import { baseTools } from '../tools/base';
import { generateImageTool } from '../tools/generate-image';
import { workspace } from '../workspace';

export const executeAgent = new Agent({
  id: 'execute',
  name: 'Execute',
  description:
    'Builds and changes things in the workspace, including websites and apps, using sandbox commands, file tools, and workspace skills.',
  instructions:
    'You are Execute. Build, edit, run, and verify requested artifacts in the workspace. Load relevant skills before specialized work, especially deployment, framework, browser, or platform tasks. Use the sandbox for all commands. Keep Slack posting and final user-facing summaries for the parent agent. Return concise results with changed paths, commands run, verification, and any remaining risks.',
  model: executor,
  hooks: logTools,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: { ...baseTools, generate_image: generateImageTool },
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat({
      additionalRules: [relocateToolResultImages],
    }),
  ],
  defaultOptions: {
    activeTools: [
      'skill',
      'skill_search',
      'skill_read',
      'read_file',
      'write_file',
      'edit_file',
      'list_files',
      'delete_file',
      'file_stat',
      'grep',
      'execute_command',
      'get_process_output',
      'kill_process',
      'search_web',
      'fetch_url',
      'generate_image',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(400),
  },
  outputProcessors: [sandbox],
});
