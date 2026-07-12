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
- [ ] Test the `wait` feature in a real Slack thread, including delayed resume
  behavior and whether the resumed message renders in the expected place.

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
- [ ] Test whether killing the process mid-`wait` (restart `mastra dev` while
  a `wait` call is pending) still resumes the thread when it should fire.
  Suspect it won't: `wait.ts` schedules the resume with a plain in-process
  `setTimeout`, not anything durable, so a restart before it fires loses the
  timer entirely and the thread hangs forever with no error. If confirmed,
  needs a durable scheduling mechanism (e.g. route through the same
  `create_scheduled_task` cron infrastructure, one-shot) instead of
  `setTimeout`.

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
- [ ] Background subagents: REVERTED, wrong shape for this. Shipped once
  (blanket `backgroundTasks.tools` on the orchestrator for `agent-research`/
  `agent-explore`/`agent-execute`, `onTaskComplete`/`onTaskFailed` waking the
  thread via `sendSignal`), then tested live: real delegation calls took
  ~3 seconds (`durationMs: 3197`, `2981` in actual logs), far too fast to
  need backgrounding, and the model had no way to check on a backgrounded
  delegation (tried a sandbox-process `pid` that doesn't exist for this
  system) — confusion with no upside. Pulled the `backgroundTasks` config
  from `index.ts` and `agents/orchestrator.ts`.
  Checked how Mastra's own coding agent (`mastracode`, in `mastra-ai/mastra`)
  does this before reverting blind: it does **not** use `Agent.agents` +
  `backgroundTasks` for concurrent subagents at all — `sdk/src/agents/modes/`
  (`build.ts`/`explore.ts`/`plan.ts`) is mode-switching on one agent, not
  parallel background delegation. So this isn't "we did it wrong", it's "this
  mechanism isn't what backgrounding is for here."
  What Mastra actually ships for "let the model choose to background a slow
  call," matching Claude Code's `run_in_background` on its Bash tool exactly:
  `execute_command`'s optional `background: boolean` input (only appears in
  the tool schema when `sandbox.processes` exists — see
  `@mastra/core/workspace/tools/execute-command.d.ts`), paired with
  `get_process_output` and `kill_process` tools and a `SandboxProcessManager`
  abstract class (`spawn`/`list`/`get`/`kill`) with a working
  `LocalProcessManager` reference implementation. This is the real fit: the
  actually-slow things in that live test were sandbox shell commands
  (`agent-browser`, `convert`), not subagent delegations.
  Not wired up here: `@mastra/e2b` has no `SandboxProcessManager`
  implementation (confirmed, `grep -rn processes node_modules/@mastra/e2b`
  returns nothing), so `execute_command`'s schema never gets the `background`
  param and `get_process_output`/`kill_process` aren't available. Implementing
  an `E2BProcessManager extends SandboxProcessManager` (E2B's own SDK already
  supports background commands with a pid/wait/kill handle) is the actual next
  step if per-call background choice is still wanted, not resurrecting
  subagent-level `backgroundTasks`.
- [ ] Let the orchestrator choose which model a subagent runs with per
  delegation, instead of each subagent having one fixed model. RESEARCHED
  (deep dive on `@mastra/core/agent-controller`, confirmed by reading source,
  not docs alone): two real paths, neither is a small config flag.
  1. **Our current pattern (`Agent.agents: {...}`, what research/explore/execute
     use) cannot do this.** The delegation tool Mastra auto-generates per
     subagent (`agent-research` etc.) has a hard-coded input schema:
     `createSubAgentInputSchema()` in `@mastra/core`'s agent source is
     `{ prompt, threadId, resourceId, instructions, maxSteps }`, no `model`
     field, not configurable. The orchestrator LLM can already steer
     `instructions` and `maxSteps` per call, just not the model. The
     underlying capability does exist one layer down though: `Agent.stream()`'s
     own options (`AgentExecutionOptions`) accept a per-call
     `model?: MastraLanguageModel` override, confirmed in
     `agent.types.d.ts:624`. Getting model choice would mean replacing the
     auto-generated `agent-${name}` tools with hand-rolled ones (a normal
     `createTool` per subagent, with `model` in its own input schema, calling
     `subagent.stream(prompt, { model: chosenModel, ... })` directly) — losing
     the free auto-wiring (and whatever the current delegation-logging hooks
     tie into specifically, re-verify once that machinery settles) in exchange
     for the extra field.
  2. **`AgentController`'s subagent model management is a different feature,
     not a drop-in fix.** `agentController.session.subagents.model.set({
     modelId, agentType })` exists, but it is session/type-scoped (set the
     model for all future "explore" delegations in this session, e.g. from a
     settings UI or a human toggling speed vs. capability), not the LLM
     picking a model per individual delegation call mid-conversation. Also:
     `AgentController` is beta, is a different, opinionated subagent
     abstraction (`subagents: [...]` config, forked subagents, its own thread
     model) layered *on top of* `Agent`, not a mode switch on the `Agent.agents`
     pattern already in use, and it is unclear how/whether it composes with
     Mastra `channels` (the Slack Socket Mode integration this whole app is
     built on) since nothing in either doc set mentions the two together.
     Adopting it would be a genuine architecture change, not scoped to this
     one TODO item.
  Recommendation if this gets picked up: path 1 (hand-rolled delegation tools)
  is the smaller, self-contained change and doesn't touch how Slack rendering
  works. Do not reach for `AgentController` just for this; it would pull in a
  beta subsystem with an unverified relationship to `channels` to solve a
  narrower problem than it's built for.
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
- [ ] Make Mastra Studio a good experience. Concrete quality-of-life pass:
  request-context presets, readable processor/tool pages, approval-card smoke
  tests, trace visibility, and optional scorer/eval wiring.
  - [x] DONE: `research`, `explore`, and `execute` are now also registered on
    the top-level `Mastra` instance in `src/mastra/index.ts` (they were only
    nested under `orchestrator`'s own `agents` config for delegation before).
    `Mastra.listAgents()` is a plain typed getter over that top-level object,
    not a recursive walk into each agent's own nested `agents`, so without
    this Studio's Agent tab could only show/chat with `orchestrator` and
    `summarizer`, even though `summarizer` is a one-shot non-interactive
    helper and the other three are the actually-interactive ones worth tuning
    in Studio. Registering the same Agent instance in two places doesn't
    conflict, they're independent registries. First attempt hit a live
    collision (the file was being rewritten by something else concurrently,
    edit silently failed to land, nothing lost); reapplied cleanly on retry.
  - [x] Replace `studio/request-context.json`'s single hardcoded Slack-shaped
    preset with named presets: `studio-safe` (no real Slack side effects),
    `studio-workspace` (deterministic E2B thread id so workspace/file tools
    work), `slack-thread` (real Slack thread smoke), and `slack-dm` (real DM
    title/memory smoke). Clearly label which presets can post to Slack.
  - [x] Add useful `description` fields to custom processors so Studio's
    Processors page explains `delegated-tools`, `footer`, `sandbox`, `title`,
    instead of showing opaque names. `tool-media` is a `CompatRule`, not a
    Studio-listed processor, so it only has its rule name.
  - [ ] Smoke-test Studio's processor pages after the recent cleanup. The
    installed Studio UI has a Processors route that lists phases and can run
    non-stream phases directly; verify our custom processors appear under the
    expected agents and that output/result phases do not post accidental Slack
    footers when using the safe preset.
  - [ ] Smoke-test tool rendering in Studio and Slack after switching from
    `onIterationComplete` logs to `hooks: logTools`: direct tool calls,
    delegated subagent tool payloads from `processors/delegated-tools.ts`, and
    the `post_message` approval card.
  - [ ] Add a short README or TODO smoke matrix for Studio: chat with each
    top-level agent, inspect tools, inspect processors, inspect traces in
    observability, inspect memory threads, and run one approval-card test.
  - [ ] Decide whether to add Mastra evaluations and one or two lightweight
    scorers so Studio's Scorers/Evaluation pages are useful. Candidate checks:
    tool-call accuracy for Slack research and prompt-alignment for guardrails.
  - Small smoke tests to run manually in Studio, using the user's already
    running `bun run dev` instance:
    - [ ] Select `studio-safe`, chat with `orchestrator`, and verify no Slack
      footer/title/post side effects occur.
    - [ ] Select `studio-workspace`, chat with `execute`, ask it to list files,
      and verify the workspace tools use one deterministic sandbox thread.
    - [ ] Open `/processors`, confirm all custom processors have readable
      names/descriptions and expected phases.
    - [ ] Open `/tools`, confirm `post_message` shows approval-required
      behavior before execution.
    - [ ] Use `slack-thread-smoke-posts-to-slack` only in a disposable test
      thread and verify `post_message` renders an approval card.
    - [ ] Use `slack-dm-smoke-posts-to-slack` only in a disposable DM and
      verify Slack assistant title mirroring still works.
    - [ ] Open `/observability` after a run and confirm tool calls,
      delegated-agent spans, and processor spans are inspectable.
    - [ ] Open memory threads and confirm the Studio-safe thread title is
      generated without requiring Slack-specific context.

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
- [ ] Test the `wait` tool in a real Slack thread: delayed resume fires, and
  the resumed message renders in the expected place (thread vs channel).
- [ ] Test background subagent delegation (`agent-research`/`agent-explore`/
  `agent-execute`): confirm the result actually posts back to the Slack
  thread once the background task completes, not just written to memory.

## Recently completed

- Live turn-state indication in Slack via reactions on the triggering message:
  `hourglass_flowing_sand` while processing, swapped for `white_check_mark` on
  success or `x` on an uncaught error (`chat/handlers.ts`'s
  `withWorkingReaction`).
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
