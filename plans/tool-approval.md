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
mode** — including our custom function in `chat/tool-display/`, which only
customizes `running`/`result`/`error` rendering. Per Mastra's own docs:
"Approve/deny prompts always render as a separate card regardless of mode,
because inline task entries can't carry interactive buttons." So adding the
flag to a tool is sufficient; no changes to `chat/tool-display/` are needed.

Suspended approvals persist through `PostgresStore` (already configured in
`index.ts`), so they survive a restart and can be rediscovered via
`agent.listSuspendedRuns()` if needed.

## Tools gated in this repo

- `post_message` (`tools/slack/post-message.ts`) — sends a message as the bot
  to a channel, DM, or thread. Visible to everyone there, hard to fully walk
  back once sent.
- `delete_scheduled_task` (`tools/scheduled-tasks/delete.ts`) — permanently
  cancels a recurring task.
- `update_canvas` (`tools/canvas/update.ts`) — `replace` mode overwrites the
  entire canvas; can destroy existing content.

## Intentionally not gated

- `react` — trivially reversible (remove the reaction), low stakes.
- `wait` — no external side effect, just pauses the turn.
- `create_scheduled_task` / `create_canvas` — creates new content rather than
  overwriting or deleting; the user can already remove either afterward via
  `delete_scheduled_task` (approval-gated) or by editing the canvas.
- `agent-research` / `agent-explore` / `agent-execute` (background subagent
  delegation) — approval suspends the run until a human responds, which
  defeats the point of running these in the background (see
  `TODO.md`'s "Background subagents" entry). Approval does propagate through
  delegation chains per Mastra's docs, but that's untested against our
  `sendSignal`-based wake path and should be treated as a real risk if this
  is revisited, not assumed to compose cleanly.

Revisit this list as new tools land; the bar is "destructive/irreversible,
cost-heavy, or posts visibly as the bot," not "anything that mutates state."
