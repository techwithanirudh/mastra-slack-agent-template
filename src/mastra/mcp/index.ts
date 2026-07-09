import { MCPClient } from '@mastra/mcp';

export const mcpTools = await new MCPClient({
  id: 'mcp',
  servers: {
    context7: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  },
}).listTools();
