# Connect An MCP Server

Use MCP when a service already exposes useful tools. Agent includes a working
Context7 example in `src/mastra/mcp/index.ts`.

Read Mastra's [MCP overview](https://mastra.ai/docs/mcp/overview) and
[`MCPClient` reference](https://mastra.ai/reference/tools/mcp-client) before
adding authentication, approvals, resources, prompts, or remote transports.

## 1. Configure the server

```ts
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
```

Server configuration can also target a supported remote transport. Check the
[Mastra MCP documentation](https://mastra.ai/docs/mcp/overview), then verify the
configuration against `node_modules/@mastra/mcp/dist/docs/` because transport
options change over time.

Add another entry to `servers` or replace `context7` with the service your
agent needs.

## 2. Register the tools

```ts
import { mcpTools } from '../mcp';

export const baseTools = {
  // local tools
  ...mcpTools,
};
```

The template already includes this registration in `src/mastra/tools/base.ts`.

## 3. Handle credentials

Declare and validate host credentials in `src/env.ts`. Do not hardcode them in
the MCP config, prompts, skills, or committed files. If an MCP server must run
inside E2B, install it in the workspace image and broker credentials through
`src/mastra/workspace/network.ts`.

## 4. Validate

Run typecheck first. It catches configuration differences between the template
and examples written for other `@mastra/mcp` versions.

```bash
bun run typecheck
bun run check
bun run check:spelling
```

Keep the MCP client long-lived instead of constructing one per request, and
close dynamically created clients when their lifecycle ends. Require approval
for servers that expose destructive or high-impact actions.
