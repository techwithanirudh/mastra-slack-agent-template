# mastra-slack-agent-template TODO

Source of truth for outstanding template work.

## Process

New capabilities land in `techwithanirudh/gorkie` first, not here. Gorkie is
the live, daily-driven bot, so it's the actual proving ground: stage a feature
there, run it against real Slack usage on `dev`, and let it go through a few
rounds of fixes under real load before it's trusted.

Once a feature has stabilized in gorkie, port it into this template, and in
the porting strip out everything gorkie-specific: hardcoded bot Slack user
ids, the `techwithanirudh/gorkie` repo/maintainer attribution, the persona
and identity wording (`personality.ts`, `core.ts`'s `"You're gorkie"`,
`slack.ts`'s self-recognition block), and any behavior that assumes gorkie's
own deployment (single workspace, specific env vars, saved per-user
instructions). What's left after that strip-down should be the generic,
reusable form of the feature: same mechanism, no fixed identity or
deployment baked in.

This means gorkie's `dev` branch is usually ahead of this repo on anything
non-cosmetic, and this repo should periodically diff against it to catch
drift and pull across whatever has matured enough to templatize. See
"Generalize the gorkie codebase" in Roadmap for making this mechanical
instead of a manual diff every time.

## Setup

- [ ] Create a Slack app from `slack-manifest.json`.
- [ ] Configure required values from `.env.example`.
- [ ] Build the E2B image with `bun run build:template`.
- [ ] Use separate Postgres databases for development and production.

## Customize

- [ ] Investigate user-wide Observational Memory after the thread-scoped default
  has been tested in Slack.
- [ ] Decide whether `src/mastra/prompts/tools.ts` should remain.
- [ ] Update the default identity and behavior in `src/mastra/prompts/`.
- [ ] Choose models and fallbacks in `src/mastra/providers.ts`.
- [ ] Review enabled Slack tools and OAuth scopes for the target workspace.
- [ ] Replace or extend the example MCP servers in `src/mastra/mcp/index.ts`.
- [ ] Revisit whether thread-scoped Observational Memory should stay the Slack
  default after assistant_view DM behavior has been live-tested.

## Bugs

- [ ] CRITICAL, contradicts recently shipped work: Slack has deprecated
  `assistant_view` on mobile, it does not render there at all. This directly
  undercuts the "switch to assistant_view" work already shipped this session
  (see Recently completed), which removed the old DM-anchor workaround on the
  premise that assistant_view was the correct, future-proof target. Needs a
  real decision before touching code: either move to Slack's newer
  `agent_view` manifest feature (per earlier session notes, the pinned
  `@chat-adapter/slack` had zero `agent_view` support at last check, so that
  may mean an adapter upgrade or hand-rolling the event handling again), or
  another supported path. This has flip-flopped between agent_view and
  assistant_view multiple times already this session; read the git history and
  this file's older entries before starting, do not just re-flip it again.
- [ ] Tool cards stop rendering properly in Slack past roughly 50-60 steps in a
  turn (reports vary: ~50 for execute/other agents, ~60 reported separately for
  subagents). May be one root cause or two; investigate before assuming.
- [ ] Give clearer live indication of turn state in Slack: both that a response
  is still being processed, and, separately, a clear signal once the agent has
  fully stopped (a distinct UX gap raised independently).

## Roadmap

- [ ] Multi-platform support: add Discord and Telegram through Chat SDK
  adapters alongside Slack. First priority.
- [ ] MCP support: firm up the built-in MCP servers, then let end users add
  their own MCPs.
- [ ] MCP emoji proxy.
- [ ] Custom instructions: persistent per-user instructions for persona, tone,
  style, and how to address them.
- [ ] Restrict `edit_message` and `delete_message` to messages the bot itself
  posted. Already implemented on gorkie `dev`. Low priority for now. Land
  together with send-as-user tools below, same underlying ownership model.
- [ ] Langfuse cost tracking: surface per-user spend (who spends the most).
- [ ] Topic summaries.
- [ ] Agent browser via [Cloak Browser](https://github.com/Cl oakHQ/CloakBrowser/blob/main/examples/integrations/agent_browser.sh)
  for browser automation tools.
- [ ] Let users disable the usage/cost footer shown under responses.
- [ ] Scoped Slack [code mode](https://mastra.ai/docs/agents/code-mode) tool
  (`createCodeMode`) for multi-step Slack operations in one sandboxed call:
  post_message, edit/delete own messages, canvas CRUD, pin a message, set
  channel topic. The removed `schedule_reminder` capability (see Recently
  completed) should come back through this rather than as its own tool. Isolate
  code mode to specific tool groups (Slack tools only, canvases,
  send/edit/delete-as-user, pin, etc.) via multiple scoped `createCodeMode()`
  instances rather than one flat allow-list. Considered a code-mode tool for
  checking email too; decided against it for now. Open concern (Devarsh): code
  mode provisions a sandbox on every call, confirm that cost/latency is
  acceptable before committing to this design, or find a way to reuse/pool
  sandboxes across calls.
- [ ] Signal subscriptions: let the agent monitor and react to external events
  (GitHub events, AgentMail) instead of only polling on a cron schedule. `wait`
  (shipped, see Recently completed) covers "pause and resume later"; this is
  the "react to an external trigger" half.
- [ ] Background subagents. RESEARCHED, possible but needs a bridge, not yet
  implemented. Mastra's `backgroundTasks` system dispatches subagent
  delegations as background tool calls transparently (confirmed via source);
  requires enabling `backgroundTasks` on the `Mastra` instance (new config, not
  currently set) and opting the subagent in via `backgroundTasks.tools` on the
  orchestrator. The catch, confirmed by reading `chunk-JGDMZZAO.js`: background
  task completion only flows into whichever stream is actively consuming
  `agent.stream()` at the time, and re-invocation on completion only happens
  automatically "if you use `stream()` with the `untilIdle` option" per
  Mastra's own docs. `AgentChannels` (the Slack integration) never sets
  `untilIdle` anywhere, so a background subagent's result would write to
  memory and then silently vanish from the user's view, nothing would
  proactively post it back to Slack. Fix: register `backgroundTasks.onTaskComplete`
  / `onTaskFailed` on the `Mastra` instance and, from there, call
  `agent.sendSignal(..., { ifIdle: { behavior: 'wake' } })` on the task's
  `threadId`/`resourceId` (`BackgroundTask` carries both). This is the exact
  same wake pattern `wait.ts` already uses and that this session verified
  renders correctly in Slack, just triggered from task completion instead of a
  timer.
- [ ] Let the orchestrator choose which model a subagent runs with per
  delegation, instead of each subagent having one fixed model.
- [ ] Generalize the gorkie-derived codebase so porting changes from gorkie to
  this template is mechanical, not a manual line-by-line diff every time. For
  example: tool-facing strings currently written as "Gorkie can't do X" should
  be genuinely identity-neutral ("Can't do X") in gorkie's own source, not
  find-and-replaced during porting. HOLD OFF: a design doc already exists at
  `plans/generalize-gorkie.md` (identity config block in `config.ts`, consumed
  by personality/core/slack prompts and tool files; also flags Mastra's
  built-in `ChannelContext.botMention`/`botUserId` as an unused, higher-value
  fix for gorkie's hardcoded self-recognition Slack ids). It went stale within
  minutes of being written because too much is moving in parallel right now:
  gorkie gained new "Gorkie"-branded strings from an unrelated code-mode/canvas/
  pins build (shifts the plan's file/line citations), and this repo deleted
  `tools/slack/edit-message.ts`/`delete-message.ts` entirely (the plan's step 6
  names both as edit targets). Do not execute the plan as-is. Once things
  settle, re-grep both repos fresh against current state, fix the plan's
  citations, then execute.
- [ ] Send-as-user tools: a real "send this in that channel/DM as me"
  capability, separate from the agent authoring and posting its own message.
  See the deferred Slack tool-authorization item below: agent-authored posts
  should stay broadly open, send-as-user needs the ownership/scoping controls.
- [ ] Cross-platform tools: make Slack-only tools work on other platforms where
  the Chat SDK supports it (e.g. `upload_file`, post/edit, reactions). Route
  through the adapter/Chat SDK generic surface instead of `slack.webClient`
  where possible.
- [ ] Make Mastra Studio a good experience: thread titles (done) plus review
  what else surfaces well (traces, tool cards, thread lists).

### Deferred: gorkie regression sweep

Full line-by-line diff of template vs gorkie `dev` completed by a subagent.
Headline finding: templatization stripped most of the safety layer. Deferred
for now per decision, not lost.

- [ ] Restore prompt-level safety, de-identified. `prompts/guardrails.ts` was
  deleted and dropped from the `prompts/index.ts` assembly (hard rules: never
  rotate/reveal secrets, never delete user data, confirm-first on
  destructive/prod/git actions, refuse malware/tunnel/keylogger installs,
  narrate risky steps). `core.ts` also lost the "ALWAYS SFW, non-negotiable"
  block and the notification-triage line. `personality.ts` lost the em-dash ban
  that `AGENTS.md` still mandates.
- [ ] Pending the code-mode refactor: the Slack tool authorization guards that
  `tools/slack/utils.ts` lost: `assertCanPostTo` (post/upload only to the
  current channel + requester), `assertReadableChannel` (read only current
  thread + public channels), `assertCanManagePostedMessage` +
  `recordPostedMessage` (edit/delete only bot-recorded messages, for the
  original requester). Restoring these now would be thrown away by the
  code-mode work above, so re-add the ownership + scoping model as part of
  that refactor instead. NUANCE: keep `post_message` flexible, don't just lock
  it down. The agent authoring a message and posting it (e.g. "score update: X
  won") is genuinely useful and should stay broadly allowed; the security
  concern is specifically the send-as-user case.
- [ ] VERIFY: `mcp/index.ts` ships a live default MCP server
  (`@upstash/context7-mcp` auto-spawned via top-level await). Confirm shipping
  a template with an auto-spawned external MCP by default is intended.
- Confirmed non-issues from the sweep: `minInterval` 5 min is intentional; the
  `observability.duckdb` (1.5 GB) is gitignored runtime bloat held open by the
  live bot; the `get_slack_file` rename is fully consistent;
  identity/allowlist/onboarding/attribution/email drops are all intentional.

## Verify

- [ ] Run `bun run typecheck`.
- [ ] Run `bun run check` and `bun run check:spelling`.
- [ ] Run `bun run build`.
- [ ] Test mentions, DMs, tools, files, and scheduled tasks in Slack.

## Recently completed

- Split tools into an always-loaded set and a search-loaded set via
  `ToolSearchProcessor`, deferring less-common tools (`list_threads`,
  `get_channel_info`, `post_message`, canvas tools, MCP tools, etc.) until the
  agent searches for them. Added a `react` tool and set `channels.tools: false`
  to disable Mastra channels' own generic tools in favor of the existing Slack
  tool set.
- Streamed tool cards into channel threads for scheduled tasks, not just DMs,
  via a per-thread stream-recipient stash in the Slack adapter
  (`chat/adapter.ts`).
- Enabled the App Home tab with a generic, identity-neutral welcome view.
- Added a non-blocking `wait` tool: ends the turn immediately and wakes the
  same thread later via the same signal path scheduled tasks use, instead of
  blocking inside the tool call.
- Removed the `schedule_reminder` tool; use `create_scheduled_task` for now
  (see the code-mode roadmap item above for where this capability goes next).
- Mirrored Mastra's built-in `generateTitle` onto Slack's assistant History tab
  for DMs (`processors/title.ts`), instead of a second title-generation call.
- Added `skill`, `skill_search`, and `skill_read` tools to every tool-using
  agent (`research`, `explore`; the orchestrator already had them implicitly).
- Ported the `execute` subagent from gorkie for build/change work, registered
  as `agent-execute`.
- De-duplicated the agent guide: `.claude/CLAUDE.md` now symlinks to
  `AGENTS.md` instead of duplicating it.
- Removed a stray tool-inventory dump file that had been committed by accident.
- Fixed scheduled tasks not rendering live tool cards in channel threads (root
  cause: Slack's native streaming needs a `recipient_user_id`/`team_id` for any
  non-DM channel that a schedule-woken thread has no live message to derive;
  fixed by stashing it from the last live message in that thread).
- Switched the Slack manifest and adapter from `agent_view` to `assistant_view`
  for native DM streaming and live tool display. Superseded by the CRITICAL bug
  above (Slack has since deprecated assistant_view on mobile); kept here for
  history, do not treat as settled.
- Moved Slack suggested prompts out of the static manifest and set them
  dynamically on `assistant_thread_started`/`assistant_thread_context_changed`.
- Changed the Slack initial streaming placeholder to `Working...`.
- Tuned Slack progress UX so routine tool progress uses tool cards instead of
  streamed narration.
- Added fetch URL prompt guidance for public indexed pages only.
- Compared source and template steering behavior, preserved the thread steering
  path, and added Agent-view context event handling.
- Expanded the Messaging guide with thread steering, leaving a thread, and
  pulling the agent back in with a later mention.
- Documented the `!stop` Slack command in the Messaging guide.
- Restored useful MCP and skill documentation details without heavy setup
  caveats, added a Messaging guide, and linked it from the docs index.
- Simplified the README and all documentation into short setup, customization,
  and integration recipes with one clear documentation index.
- Added a concise required-services overview and rewrote configuration as a
  six-step setup guide without duplicated environment and framework details.
- Reworked the README capability overview, added a complete documentation
  index, removed the standalone Mastra guide, and renamed lifecycle logs to
  `agent`.
- Replaced generic Slack starter prompts with sourced research, sandbox file,
  Slack decision, and recurring schedule workflows.
- Removed an unused Agent-view context subscription unsupported by Chat SDK,
  documented local DuckDB observability, and clarified tool-display scope.
- Added public-channel auto-join to `upload_file`.
- Added public-channel auto-join to `post_message` and documented E2B setup,
  template builds, image customization, and alternative Mastra sandboxes.
- Switched Observational Memory back to thread scope, simplified AgentMail
  setup, renamed the image export to `images`, and documented portable AI SDK
  image providers.
- Confirmed tool-result image relocation is still required by the current
  Mastra OpenRouter text adapter, not only OpenCode.
- Removed unsupported saved-user instructions, tightened source attribution,
  reduced comment clutter, centralized sandbox Git identity, and documented
  AgentMail setup.
- Refined the template branding and README, documented GitHub setup, limited
  skill guidance to runtime skills, and moved image generation to the native
  OpenRouter AI SDK provider.
- Grounded the documentation in version-matched Mastra guidance, official
  references, and framework best practices.
- Prepared the reusable Agent baseline, documentation, optional integrations,
  and MIT license.
