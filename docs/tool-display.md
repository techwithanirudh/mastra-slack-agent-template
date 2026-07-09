# Tool Display

Mastra channels calls `toolDisplay` for tool lifecycle events. This template
converts those events into Slack task updates.

See the [channels guide](https://mastra.ai/docs/agents/channels) and
[channels reference](https://mastra.ai/reference/agents/channels) for built-in
display modes, custom renderer return values, approval behavior, and platform
support.

## Files

- `src/mastra/chat/tool-display/index.ts`: event routing
- `src/mastra/chat/tool-display/format.ts`: input and output formatting
- `src/mastra/chat/tool-display/agents.ts`: nested helper-agent activity
- `src/mastra/config.ts`: truncation limits
- `src/mastra/agents/orchestrator.ts`: channel adapter registration

## Disable all tool display

Set the Slack adapter to the built-in hidden mode:

```ts
adapters: {
  slack: {
    adapter: slack,
    streaming: true,
    toolDisplay: 'hidden',
    formatError: (error) =>
      `*Oops, something went wrong.*\n\n> ${error.message}`,
  },
},
```

Tool execution still works. Only the live Slack task cards disappear.
Approval prompts have separate behavior, so verify approval-required tools
before using hidden display in production.

`toolDisplay: 'hidden'` applies to the entire Slack adapter. The current
`ToolDisplayContext` contains the render mode and platform, but not the thread
or message, so a renderer cannot cleanly select DMs only. DM-specific hiding
requires filtering Slack stream task chunks or adding thread context upstream.

## Hide selected tools

Return nothing before rendering:

```ts
if (['skip', 'internal_lookup'].includes(event.toolName)) {
  return;
}
```

## Change labels or output

Use `event.displayName` for a custom title, or add a tool-specific branch before
the generic formatter. Keep output bounded with the limits in
`src/mastra/config.ts`; raw tool output can be very large or contain details
that should not be posted into Slack.

After changes, run:

```bash
bun run typecheck
bun run check
bun run check:spelling
```
