# Add A Tool

Tools are typed capabilities the model can call. Put each custom tool in
`src/mastra/tools/`, then register it in `src/mastra/tools/base.ts`.
Review Mastra's [tools guide](https://mastra.ai/docs/agents/using-tools) and
[`createTool` reference](https://mastra.ai/reference/tools/create-tool) for the
installed API's full schema, approval, context, and output options.

## 1. Create the tool

```ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getStatusTool = createTool({
  id: 'get_status',
  description: 'Return the current status of a named service.',
  inputSchema: z.object({
    service: z.string().min(1),
  }),
  execute: async ({ service }) => ({
    service,
    status: 'ok',
  }),
});
```

Use Zod for every external input. Add an `outputSchema` when consumers need a
stable output contract. Return small structured objects. Keep secrets on the
host and read them only through `src/env.ts`.

## 2. Register it

```ts
import { getStatusTool } from './get-status';

export const baseTools = {
  get_status: getStatusTool,
  // existing tools
};
```

The registry key should match the tool id. Mastra exposes registered tools to
the main agent automatically.

## 3. Add prompt guidance only when needed

Most well-named tools need no prompt text. If the model must follow a special
ordering or safety rule, add a short entry to `src/mastra/prompts/tools.ts`.
Do not duplicate the tool description there.

## 4. Validate

```bash
bun run typecheck
bun run check
bun run check:spelling
```

For code execution, use the existing E2B workspace. Never run user-provided
commands on the host.

See the [documentation index](index.md) for version-matched Mastra references
before changing agent, workspace, memory, or storage APIs.
