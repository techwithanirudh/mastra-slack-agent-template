import { createCodeMode } from '@mastra/core/tools';
import { E2BCodeModeTransport } from '@mastra/e2b';
import { sandbox as sandboxConfig } from '../../config';
import { getSandbox } from '../../workspace';
import { canvasTools } from '../canvas';
import { slackTools } from '../slack';

const config = {
  id: 'slack',
  timeout: sandboxConfig.timeout,
  tools: {
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    list_threads: slackTools.list_threads,
    get_user: slackTools.get_user,
    get_channel_info: slackTools.get_channel_info,
    list_channels: slackTools.list_channels,
    get_permalink: slackTools.get_permalink,
    get_slack_file: slackTools.get_slack_file,
    summarize_thread: slackTools.summarize_thread,
    list_canvases: canvasTools.list_canvases,
    read_canvas: canvasTools.read_canvas,
    lookup_canvas_sections: canvasTools.lookup_canvas_sections,
  },
};

const transport = new E2BCodeModeTransport();
const codeMode = createCodeMode(config, transport);

codeMode.tool.execute = async (input, context) => {
  if (!context.requestContext) {
    throw new Error('No request context available for Slack code mode.');
  }
  const sandbox = await getSandbox(context.requestContext);
  if (!sandbox) {
    throw new Error('No E2B sandbox available for Slack code mode.');
  }
  const {
    tool: { execute },
  } = createCodeMode({ ...config, sandbox }, transport);
  if (!execute) {
    throw new Error('Slack code mode is not executable.');
  }
  return execute(input, context);
};

export const slackCodeMode = codeMode;
