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
  ...slackTools,
  ...scheduledTaskTools,
  ...canvasTools,
  skip: skipTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  grep: grepTool,
  wait: waitTool,
  generate_image: generateImageTool,
  ...mcpTools,
};
