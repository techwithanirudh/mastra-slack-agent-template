import { mcpTools } from '../mcp';
import { canvasTools } from './canvas';
import { fetchUrlTool } from './fetch-url';
import { generateImageTool } from './generate-image';
import { grepTool } from './grep';
import { scheduledTaskTools } from './scheduled-tasks';
import { searchWebTool } from './search-web';
import { skipTool } from './skip';
import { slackTools } from './slack';
import { waitTool } from './wait';

export const baseTools = {
  ...scheduledTaskTools,
  react: slackTools.react,
  search_slack: slackTools.search_slack,
  read_conversation_history: slackTools.read_conversation_history,
  get_user: slackTools.get_user,
  leave_thread: slackTools.leave_thread,
  summarize_thread: slackTools.summarize_thread,
  skip: skipTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  upload_file: slackTools.upload_file,
  post_message: slackTools.post_message,
  grep: grepTool,
  wait: waitTool,
  generate_image: generateImageTool,
};

export const deferredTools = {
  list_threads: slackTools.list_threads,
  get_channel_info: slackTools.get_channel_info,
  get_slack_file: slackTools.get_slack_file,
  leave_channel: slackTools.leave_channel,
  ...canvasTools,
  ...mcpTools,
};
