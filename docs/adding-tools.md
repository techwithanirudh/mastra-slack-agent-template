# Add a Tool

Tools are typed actions the agent can call.

## 1. Create the tool

Add a file under `src/mastra/tools/`:

```ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getStatusTool = createTool({
  id: 'get_status',
  description: 'Return the status of a service.',
  inputSchema: z.object({
    service: z.string().min(1),
  }),
  execute: async ({ service }) => ({
    service,
    status: 'ok',
  }),
});
```

## 2. Register it

Add it to `src/mastra/tools/base.ts`:

```ts
import { getStatusTool } from './get-status';

export const baseTools = {
  get_status: getStatusTool,
};
```

Use Zod for inputs and return small structured results. Keep secrets in
`src/env.ts`.

## 3. Check it

```bash
bun run typecheck
bun run check
```

See Mastra's [tools guide](https://mastra.ai/docs/agents/using-tools) for
approvals and advanced options.
