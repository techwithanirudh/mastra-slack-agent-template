# Connect an MCP Server

MCP connects the agent to tools provided by another service. The template
includes Context7 as an example.

## Add a server

Edit `src/mastra/mcp/index.ts`:

```ts
export const mcpTools = await new MCPClient({
  id: 'mcp',
  servers: {
    context7: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  },
}).listTools();
```

Add another entry under `servers`, or replace the example. The tools are
already included by `src/mastra/tools/base.ts`.

Put credentials in `src/env.ts` and `.env.example`, never directly in the MCP
configuration.

Run:

```bash
bun run typecheck
bun run check
```

See Mastra's [MCP guide](https://mastra.ai/docs/mcp/overview) for remote servers
and authentication.
