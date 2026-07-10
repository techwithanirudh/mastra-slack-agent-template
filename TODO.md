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
non-cosmetic (see the DM-anchor fix, edit/delete-message ownership scoping,
and guardrails as examples already tracked below), and this repo should
periodically diff against it to catch drift and pull across whatever has
matured enough to templatize.

## Active work stream

Ordered. Work top to bottom, no rush.

- [x] Scheduled tasks: stream tool cards into channel threads (recipient stash
  in `chat/adapter.ts`). Shipped.
- [x] DM titles: generate with the summarizer from the first exchange, not a
  naive truncation. Shipped as `processors/title.ts`.
- [x] Studio thread titles: enable Mastra's built-in `generateTitle` (Memory
  config in `agents/orchestrator.ts`), pointed at the cheap summarizer model.
  Covers every platform's Mastra thread title shown in Studio.
- [x] Remove committed cruft: `tools-dump.md` (a stray Claude Code tool-inventory
  dump).
- [ ] DECIDE: keep the Slack-specific `title.ts` processor (sets Slack's
  assistant History-tab title, which built-in `generateTitle` cannot) or drop it
  and let Slack show its default first-message title. Built-in already covers
  Studio; this only adds the Slack-native surface.
- [ ] Add a `wait` tool (let the agent pause/sleep between steps, e.g. polling a
  long job or waiting on an external event).
- [ ] Remove the `schedule_reminder` tool.
- [x] App Home tab: enabled `home_tab_enabled`, re-subscribed `app_home_opened`,
  and publish a generic welcome view (capabilities + how to start) from
  `chat/events.ts` on home-tab open. No gorkie identity. Requires reinstalling
  the Slack app for the manifest change. Later: replace with real settings
  controls (e.g. tool-visibility toggle) once the template has any.
- [ ] CONFIRM THEN REMOVE: the user asked to remove "the claude md file". Confirm
  which file (`.claude/CLAUDE.md` is the project's agent-instructions file, not
  obviously safe to delete) and why before removing.
- [ ] Cross-platform tools: make Slack-only tools work on other platforms where
  the Chat SDK supports it (e.g. `upload_file`, post/edit, reactions). Route
  through the adapter/Chat SDK generic surface instead of `slack.webClient`
  where possible.
- [ ] Make Mastra Studio a good experience: thread titles (done) plus review
  what else surfaces well (traces, tool cards, thread lists).
- [ ] Gorkie regression sweep: full line-by-line diff of template vs gorkie
  `dev` to find regressions and leftover cruft. Delegated to a background
  subagent; fold in its findings when they land. Known open item from earlier:
  `prompts/guardrails.ts` (safety prompt) was dropped from the template's
  system-prompt assembly.

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

- [x] FIXED: scheduled tasks now render live tool cards in channel threads, not
  just DMs. Root cause: Slack's native streaming (`chat.startStream`, which
  carries the structured tool-card chunks) requires `recipient_user_id`/
  `recipient_team_id` for any non-DM channel. `chat`'s `Thread.handleStream()`
  only derives those `if (this._currentMessage)`, i.e. from a live inbound
  message. A scheduled fire wakes an idle thread with no triggering message, so
  `@chat-adapter/slack`'s `stream()` saw no recipient and fell back to plain
  post+edit, which drops the `{ chunk, kind: 'stream' }` task-update chunks our
  `tool-display/format.ts` emits (they only exist inside `chat.appendStream`).
  DMs were unaffected because `stream()` accepts them on `channel.startsWith('D')`
  alone. Fix (`src/mastra/chat/adapter.ts`): `SlackAgentAdapter` now stashes the
  `{ userId, teamId }` recipient per thread from every live non-DM message
  (persisted in the channels Postgres state via `chat.getState()`, with an
  in-memory cache to avoid a write per message), and its `stream()` override
  injects that stashed recipient into the stream options whenever the options
  lack one and the channel isn't a DM. The schedule-creating message is always
  a live message in the same thread, so the recipient is present by the time
  the schedule fires, and it survives restarts. Generic: also covers reminders
  and any future signal-driven run into a channel thread. Verify live before
  closing.
- [ ] Subagent tool cards stop rendering in Slack past 60 steps.
- [ ] Give clearer live indication that a response is still being processed.

## Roadmap

- [ ] Multi-platform support: add Discord and Telegram through Chat SDK
  adapters alongside Slack. First priority.
- [ ] MCP support: firm up the built-in MCP servers, then let end users add
  their own MCPs.
- [ ] MCP emoji proxy.
- [ ] Custom instructions: persistent per-user instructions for persona, tone,
  style, and how to address them.
- [ ] Restrict `edit_message` and `delete_message` to messages the bot itself
  posted. Already implemented on gorkie `dev`. Low priority for now.
- [ ] Langfuse cost tracking: surface per-user spend (who spends the most).
- [ ] Topic summaries.
- [ ] Agent browser via [Cloak Browser](https://github.com/CloakHQ/CloakBrowser/blob/main/examples/integrations/agent_browser.sh)
  for browser automation tools.
- [ ] Let users disable the usage/cost footer shown under responses.
- [ ] Scoped Slack [code mode](https://mastra.ai/docs/agents/code-mode) tool
  (`createCodeMode`) for multi-step Slack operations in one sandboxed call:
  post_message, edit/delete own messages, canvas CRUD, pin a message, set
  channel topic, and a wait tool. Considered a code-mode tool for email too;
  decided against it for now.
- [ ] Signal subscriptions: let the agent wait on or react to external events
  (GitHub events, AgentMail) instead of only polling on a cron schedule.

## Verify

- [ ] Run `bun run typecheck`.
- [ ] Run `bun run check` and `bun run check:spelling`.
- [ ] Run `bun run build`.
- [ ] Test mentions, DMs, tools, files, and scheduled tasks in Slack.

## Recently completed

- Moved Slack suggested prompts out of the static `slack-manifest.json` and set
  them dynamically on `assistant_thread_started`/`assistant_thread_context_changed`
  via `setSuggestedPrompts`, and title each DM thread after its first user
  message via `setAssistantTitle` (tracked once per thread with a `titled` state
  flag). Requires reinstalling the Slack app for the manifest change.
- Switched the Slack manifest and adapter from `agent_view` back to
  `assistant_view`. The Chat SDK's Slack adapter natively handles
  `assistant_thread_started`/`assistant_thread_context_changed` with a real
  `thread_ts` from the moment a DM opens, so this fixes native streaming and
  live tool display in DMs without the custom reply-anchoring workaround
  `agent_view` needed. Requires reinstalling the Slack app for the manifest
  change to take effect.
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
