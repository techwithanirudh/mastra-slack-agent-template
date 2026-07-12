# Tool approval

## Summary

Some tools this bot can call are hard to undo or affect people outside the
requesting user (posting as the bot, deleting a schedule, overwriting a
canvas). Mastra's built-in tool approval lets us pause those specific calls
before `execute` runs and require an explicit Approve/Deny in Slack, instead
of trusting the model's judgment alone.

Reference: [Agent approval](https://mastra.ai/docs/agents/agent-approval),
[Channels: tool approval](https://mastra.ai/reference/agents/channels).

## How it works

Set `requireApproval: true` on a `createTool()` definition. The stream
suspends that call with a `tool-call-approval` chunk; the run resumes via
`agent.approveToolCall()` / `agent.declineToolCall()`.

In a channels-integrated agent (what `orchestrator.ts` is), this is not
something we wire up ourselves: **Mastra always renders a dedicated
Approve/Deny card for these events, regardless of the adapter's `toolDisplay`
mode.** Confirmed by reading the compiled channels source
(`@mastra/core/dist/chunk-*.js`, `runStreamingDriver`): its `tool-call` /
`tool-result` / `tool-error` branches each check `if (toolDisplayFn) { ... }`
before falling back to the built-in renderer, but the `tool-call-approval`
branch has no such check at all — it unconditionally calls the built-in
`formatToolApproval()` card. This only holds for `streaming: true` (our Slack
config); the static driver's `renderToolEvent` does consult `toolDisplayFn`
for the `approval` kind, so a non-streaming adapter could style it.
Because of this, `chat/tool-display/index.ts`'s `toolDisplay` function has no
`event.kind === 'approval'` case — it would never run, so earlier attempts to
add one were dead code and were removed. Adding `requireApproval: true` to a
tool is sufficient on its own; there is nothing to change in
`chat/tool-display/` to affect how the approval card itself renders.

Suspended approvals persist through `PostgresStore` (already configured in
`index.ts`), so they survive a restart and can be rediscovered via
`agent.listSuspendedRuns()` if needed.

## Tools gated in this repo

- `post_message` (`tools/slack/post-message.ts`) — sends a message as the bot
  to a channel, DM, or thread. Visible to everyone there, hard to fully walk
  back once sent.
- `delete_scheduled_task` (`tools/scheduled-tasks/delete.ts`) — permanently
  cancels a recurring task.
- `edit_canvas` (`tools/canvas/edit.ts`) — `replace`/`delete` operations can
  destroy existing canvas content; the whole tool is gated since a single
  call can batch multiple operation types.
- `delete_canvas` (`tools/canvas/delete.ts`) — permanently deletes a canvas.

## Intentionally not gated

- `react` — trivially reversible (remove the reaction), low stakes.
- `wait` — no external side effect, just pauses the turn.
- `create_scheduled_task` / `create_canvas` / `create_channel_canvas` —
  creates new content rather than overwriting or deleting; the user can
  already remove it afterward via `delete_scheduled_task`/`delete_canvas`
  (both approval-gated).
- `lookup_canvas_sections` — read-only, no content destroyed.
- `agent-research` / `agent-explore` / `agent-execute` (subagent delegation)
  — not background tasks (see `TODO.md`'s "Background subagents" entry,
  reverted), just regular synchronous delegation. Approval would still
  propagate up through the delegation chain per Mastra's docs, but there's no
  concrete need for it today; revisit if a subagent gets a genuinely
  destructive tool of its own.

Revisit this list as new tools land; the bar is "destructive/irreversible,
cost-heavy, or posts visibly as the bot," not "anything that mutates state."
