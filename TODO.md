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
  subagents). Likely root cause now found via a live log dump (`mastra dev`
  logs, not `mastra api trace`, that investigation step is superseded): Slack's
  native streaming (`chat.startStream`/`appendStream`/`stopStream`, used by
  `@chat-adapter/slack`) throws `message_not_in_streaming_state` once the
  stream goes idle too long, most likely a Slack-side idle timeout (undocumented
  exact duration). Reproduced live after a 323-second Execute delegation that
  produced zero output the whole time (see the OpenRouter entry below for why).
  `@chat-adapter/slack`'s `stream()` method
  (`node_modules/@chat-adapter/slack/dist/index.js` around line 3560,
  `flushMarkdownDelta`) has no try/catch around the plain-text
  `streamer.append()` call, unlike the structured-chunk path a few lines below
  it which already degrades gracefully on failure. The uncaught throw
  propagates up to Mastra's channel layer, which logs "streaming post failed,
  falling back to buffered text" and still delivers the message, just without
  live updates for that turn, likely explaining the "tool cards stop
  rendering" reports: not lost, just silently downgraded to buffered.
  Fix candidates, not yet built: (1) patch `@chat-adapter/slack` (this repo
  already has `patchedDependencies` infra, see `patches/`) to wrap that append
  call in the same try/catch pattern as the structured-chunk path, so a stale
  stream degrades gracefully instead of throwing, small and surgical; (2) add a
  keepalive/heartbeat append during long silent gaps so the stream never goes
  idle long enough to expire, harder, needs restructuring the `for await`
  consumption loop with a race against a timer, worth it only if losing live
  updates on long delegations actually matters given (1) already avoids message
  loss. Recommendation: do (1) first, it's small and fixes the hard-fail
  symptom; only reach for (2) if the UX gap still bothers people afterward.
- [ ] `get_slack_file` throws a false "Downloaded X but expected Y" error for
  canvases specifically, reproduced live (`Downloaded 11 KB but expected 9 KB`
  on a real canvas file id). Root cause confirmed: canvases are live, editable
  documents; `files.info`'s `size` field is a stale snapshot, not the current
  export size, so the strict byte-count check added for resumable-download
  integrity fails for them specifically (static uploads are unaffected). A fix
  (skip `files.info`'s size for canvases, use a fresh HEAD-request probe
  instead, and don't throw the final strict-match error for them) was built
  and verified working this session, then deliberately left unapplied/reverted
  by request. `read_canvas` no longer needs this path (see Recently completed,
  it downloads independently now), but this bug is still live for anyone using
  `get_slack_file` directly on a canvas id.
- [ ] OpenRouter (`INFERENCE_API_KEY`'s account) is out of credits, reproduced
  live: `z-ai/glm-5.2` and `moonshotai/kimi-k2.7-code` both failed mid-turn
  with a 402 "This request requires more credits, or fewer max_tokens."
  Needs a top-up at openrouter.ai/settings/credits, not a code fix. Separately,
  the same live run also hit `z-ai/glm-5.2` erroring with 404 "No endpoints
  found that support image input" when the executor tried to hand it a
  screenshot, i.e. the executor's model fallback chain has a non-vision model
  ahead of a vision-capable one for an image-input call. Worth checking
  `providers.ts`'s executor fallback order and making sure a vision-capable
  model is tried first (or the non-vision one is skipped) whenever the input
  includes an image, this retry churn is also implicated in the streaming
  timeout bug above, since it burned real silent time with zero output.
- [ ] Add a sticky fallback winner cache for model routing. Mastra already has
  sequential model fallback with per-model retries, but each new request still
  starts from the front of the chain. Remember "this provider route/model works"
  for about 30 minutes per model role and capability shape (for example text
  only vs image input), then prefer that working entry first on later requests
  instead of re-burning time on earlier entries that are likely still bad. A
  successful call refreshes the 30-minute TTL; a failure from the cached winner
  drops it and falls back to the normal chain. Confirm this can be implemented
  without fighting Mastra's fallback preparation path or increasing file
  descriptor/resource pressure.
- [ ] Rebuild `read_canvas` to return real Canvas-flavored markdown plus a
  `section_id_mapping`, matching what other Slack canvas tools (confirmed via
  Anthropic's own Slack MCP connector, `slack_read_canvas`) return, instead of
  today's raw HTML dump. Mechanism fully reverse-engineered and confirmed live
  this session, no guessing left: the HTML export (same `url_private_download`
  fetch `read_canvas` already does) has each content block's real Slack
  section id baked in as an `id="temp:C:..."` HTML attribute; those ids were
  proven byte-for-byte identical, same order, to what the public
  `canvases.sections.lookup` endpoint returns for the same canvas (tested
  against a real workspace canvas, 22/22 header ids matched). So the whole
  thing can be built from the one existing HTML fetch: parse the HTML,
  convert each tagged block to markdown while keeping its `id`, and the
  mapping falls out directly, no extra `sections.lookup` calls needed for a
  full read (that endpoint stays useful only for `lookup_canvas_sections`'s
  existing search-before-edit case). Open decision: needs a real HTML parser
  to convert per-element while preserving each element's `id` (Turndown with a
  custom per-node rule was the recommendation, naive regex-stripping would
  lose the id-to-chunk association), which per this repo's rules means asking
  before adding the dependency, asked, not yet confirmed.
- [ ] Decide whether to add the missing `search:read.private`, `search:read.im`,
  `search:read.mpim` OAuth scopes to `slack-manifest.json`, found while
  researching Slack's Real-time Search API's new granular scopes replacing the
  old single `search:read`. Asked once, not answered, does not block current
  `search_slack` functionality (public search already works via
  `search:read.public`/`.users`/`.files`, already in the manifest).
- [ ] The canvas at `F0B76MADV39` ("Gorkie TODO", shared to `#gorkie-testing`)
  only grants the bot read access (confirmed via `files.info`'s `access` field
  and `dm_mpdm_users_with_file_access`), so `edit_canvas` fails with
  `restricted_action` there specifically, not a bug, just a sharing-settings
  gap. Its owner needs to grant the bot write access from the canvas's "Manage
  access" menu in Slack (or via `canvases.access.set`) if edits there are
  wanted. `edit_canvas` now surfaces a clear message for this case instead of
  a raw API error (see Recently completed).
- [ ] Test whether killing the process mid-`wait` (restart `mastra dev` while
  a `wait` call is pending) still resumes the thread when it should fire.
  Suspect it won't: `wait.ts` schedules the resume with a plain in-process
  `setTimeout`, not anything durable, so a restart before it fires loses the
  timer entirely and the thread hangs forever with no error. If confirmed,
  needs a durable scheduling mechanism (e.g. route through the same
  `create_scheduled_task` cron infrastructure, one-shot) instead of
  `setTimeout`.
- [ ] Tool approval clicks silently no-op with `No pending approval found for
  toolCallId=...` in the logs, reproduced live against `post_message` (the
  only tool left with `requireApproval: true` after the approval-scope
  cleanup below). Root cause traced in `@mastra/core/dist/chunk-OE4IEL7C.js`:
  approve/deny lookups check an in-memory `pendingApprovalCards` Map first
  (line 11211), then fall back to querying storage for `pendingToolApprovals`
  metadata written onto the last assistant message (`addToolMetadata`, line
  28297). That metadata write only lands in the in-memory `messageList`
  immediately; actual DB persistence goes through an async
  `saveQueueManager` flush, not synchronously. If the run is interrupted
  between "card posted" and "flush completes", both lookups come up empty on
  click. Two concrete triggers reproduced back to back in one session: (1) an
  OpenRouter 429 (see the provider-pinning bug below) erroring the run out
  before the flush landed, and (2) `mastra dev`'s file-watch hot-reload
  (triggered by normal source edits) wiping the in-memory Map mid-approval.
  Fix needs either making the metadata write durable before the approval
  card is even shown, or a documented "approvals don't survive a reload/error
  window" caveat; not yet decided which.
- [ ] E2B sandbox spec was implicit (no `cpuCount`/`memoryMB` passed to
  `Template.build`), and a live sandbox was caught OOM-thrashing under that
  default: `next dev` (Turbopack) + `agent-browser`'s Chromium + bun all
  running together made even `echo hello` time out via `execute_command`,
  consistent with memory starvation rather than a hung process.
  `build-template.ts` now explicitly requests `cpuCount: 2, memoryMB: 1024`
  (see Recently completed) instead of relying on whatever default applied.
  Needs `bun run build:template` to actually take effect, not run this
  session per the "ask before" policy on external side effects. Also note:
  `createSandbox` derives a stable per-thread sandbox id from the thread id,
  so rebuilding the template alone won't reach an already-running/stuck
  sandbox for a thread that's currently wedged; that specific sandbox needs
  to be killed separately for a thread to get the new spec.
- [ ] `providers.ts`'s `openrouterOptions = { provider: { only: ['DigitalOcean']
  } }` pins every model role (orchestrator, summarizer, scout, explorer,
  executor) to a single upstream OpenRouter provider slice, removing
  OpenRouter's normal cross-provider failover. Plausibly increases 429
  frequency: reproduced live, the orchestrator's primary model
  (`openrouter/minimax/minimax-m3`) hit a 429 from openrouter.ai mid-turn.
  Unknown whether the DigitalOcean pin is a deliberate constraint (data
  residency?) or leftover from testing; needs a decision before loosening it.
  Related to the sticky-fallback-cache item above, since narrower provider
  choice means the fallback chain gets exercised more often.

## Roadmap

- [ ] Multi-platform support: add Discord and Telegram through Chat SDK
  adapters alongside Slack. First priority.
- [ ] MCP support: firm up the built-in MCP servers, then let end users add
  their own MCPs.
- [ ] MCP emoji proxy.
- [ ] Slack Block Kit support. `post_message` (`tools/slack/post-message.ts`)
  and canvas creation currently only accept a markdown string, converted via
  `SlackFormatConverter().toSlackPayload`. Add a real Block Kit option
  (sections, buttons/actions, images, context blocks, dividers) instead of
  markdown being the only output shape. Not yet researched: whether to accept
  raw `Block[]` (`@slack/types`) directly, which risks the model producing
  malformed block JSON, or a constrained builder-style schema that's
  friendlier for an LLM to fill in correctly. Also needs to be reconciled
  with the existing tool-call "card" rendering (`toolDisplay: 'cards'`, see
  the streaming bug above) so the two don't fight over how rich content shows
  up in a thread.
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
- [ ] Test `read_canvas` against a real canvas after its rewrite (now fetches
  the HTML export directly instead of the never-populated `files.info.content`
  field). Confirm it actually returns readable HTML for a real canvas id, not
  just that it no longer throws "no readable content".
- [ ] Test `upload_file`'s new `fileId` return value against a real upload;
  confirm the extracted id is correct and usable with `get_slack_file` or
  embeddable in a canvas reference.
- [ ] Test the `chat:write.customize`-gated post_message attribution
  (`{username} [{bot name}]`) after reinstalling the Slack app with the new
  scope; confirm it actually renders instead of silently falling back to the
  bot's default identity.
- [ ] Test agent-browser + CloakBrowser against a real target site in a fresh
  Slack thread (fresh sandbox, post-rebuild) to confirm the wrapper hardening
  and per-session fingerprint caching work outside the local reproduction.
- [ ] Test `list_canvases` against a real workspace/channel, both with and
  without a `channelId` filter, to confirm `files.list({types: 'canvas'})`
  actually returns canvases (not just typechecks) and that `canvasId`/`title`
  come back populated.
- [ ] Test a canvas edit/create that includes a user or channel mention using
  the new `![](@USER_ID)`/`![](#CHANNEL_ID)` syntax, confirm it renders as a
  real clickable mention in the canvas, not literal text.
- [ ] Rebuild the E2B template (`bun run build:template`) after the
  `cpuCount: 2, memoryMB: 1024` change and confirm new sandboxes actually get
  the new spec, not just that the build succeeds. Existing per-thread
  sandboxes won't pick it up until recreated (see Bugs).
- [ ] Reproduce the "No pending approval found" tool-approval bug on purpose
  (trigger `post_message`'s approval card, then either force a model 429 or
  save-edit a watched source file to trigger a `mastra dev` reload before
  clicking Approve) to confirm the root cause and validate whatever fix lands.
- [ ] Confirm `edit_canvas` and `delete_scheduled_task` still behave
  correctly now that `requireApproval` is removed from them (they execute
  immediately, no approval card); only `post_message` should still show one.

## Recently completed

- Removed `requireApproval` from `delete_canvas`, `edit_canvas`, and
  `delete_scheduled_task`; only `post_message` requires approval now.
- Removed the `delete_canvas` tool entirely (file, `canvasTools` export, and
  its `prompts/tools.ts` mention); canvases are not deletable through the
  agent anymore.
- Gave `research` direct, always-on access to `list_canvases`, `read_canvas`,
  and `lookup_canvas_sections` (previously only reachable indirectly by
  guessing to call `search_tools`), and updated its instructions to mention
  canvases as a research source while keeping it read-only (no edit, create,
  or delete).
- Added a clearer explanation of what a Slack canvas actually is (a
  persistent per-channel/standalone reference doc, not a one-off message) to
  `prompts/tools.ts`'s offloaded tool notes, so agents know when to reach for
  one instead of only learning the mechanics of each canvas tool.
- `build-template.ts` now explicitly requests `cpuCount: 2, memoryMB: 1024`
  for the E2B template instead of relying on an implicit default; needed
  after a live sandbox was caught OOM-thrashing under whatever the previous
  default was (see Bugs and Verify for the rebuild step still outstanding).
- `edit_canvas` now catches `restricted_action` and throws a clear message
  explaining the canvas's own sharing settings only grant read access, not
  write, and who needs to grant write access, instead of surfacing a raw
  `Error: An API error occurred: restricted_action` with no context.
- Fixed `read_conversation_history` (all 3 source branches) and `list_threads`
  rejecting a live, reproduced tool call where the model passed `limit` as the
  string `"20"` instead of a number, a known LLM tool-calling quirk. Switched
  both from `z.number()` to `z.coerce.number()` so numeric-looking strings are
  accepted while genuine garbage still fails validation.
- Rewrote `read_canvas` to fetch a canvas's HTML export directly (same
  `url_private_download` mechanism as `get_slack_file`) instead of reading
  `files.info`'s `content` field, which Slack never populates for canvases.
  It's a plain-text-snippet field, not a canvas one; this was a root-cause
  bug, not a flaky edge case, "no readable content" fired on every canvas.
  Now returns HTML directly (canvases don't have a markdown export), no
  sandbox round-trip needed since it's a read-and-return, not a download.
- Added `list_canvases`, a real canvas-listing tool using `files.list({types:
  'canvas'})`. Slack's own Canvases docs confirm this is the documented way to
  list canvases; `@slack/web-api`'s `FilesListArguments.types` is typed as a
  plain `string`, not a restrictive union, so no cast or `apiCall` escape
  hatch was needed, the earlier "no listing API exists" conclusion was based
  on a stale reading of `types`, not a real API gap.
- Documented canvas-specific mention syntax on `create_canvas`, `edit_canvas`,
  and `prompts/tools.ts`: canvas markdown mentions are `![](@USER_ID)` and
  `![](#CHANNEL_ID)`, not the normal `<@U123>` message mention format, which
  silently renders as literal plain text inside a canvas. Confirmed via
  Slack's own Canvases docs and an independent Stack Overflow report of the
  same gotcha.
- `isSlackHost` (Slack-hosted URL check on `get_slack_file`/`read_canvas`) was
  extracted into `tools/slack/utils.ts`, then removed entirely per explicit
  request (MITM on Slack's own API response URLs judged not a real concern
  for this template). Neither tool has this check anymore.
- Tightened `canvasIdSchema` (shared by all canvas tools) to reject anything
  that isn't a bare Slack file id (`/^F[A-Z0-9]+$/`), rejecting a URL or
  permalink outright at the schema level instead of trusting downstream code.
- `upload_file` now returns the uploaded file's Slack `fileId`, extracted
  from the returned attachment's private URL (the Chat SDK's `Attachment`
  type doesn't expose the id directly, only the URL, which embeds it) so the
  model can reference an upload afterward (e.g. `get_slack_file`, embedding a
  link in a canvas).
- Live-verified the CloakBrowser + agent-browser hardening from earlier this
  session against a real captcha-solving run in Slack (via `mastra api
  trace`): `agent-browser open` completed with `exitCode: 0`, no error span,
  and the bot correctly read and interacted with real page content (solved a
  Cloudflare Turnstile). Moved the wrapper script out of an inline heredoc in
  `build-template.ts` (which needed every `${...}` backslash-escaped to avoid
  colliding with the JS template literal, the exact bug fixed earlier this
  session) into its own file, `stealth-browser.sh`, copied into the
  image via e2b's `Template.copy(src, dest, {mode})` instead. Same runtime
  behavior, no more escaping footgun, and `build-template.ts` reads cleanly as
  mostly boilerplate apt/node/gh setup now. Needs `bun run build:template` to
  actually take effect, not run this session per the "ask before" policy on
  external side effects.
- Diagnosed and reproduced the reported CloakBrowser + agent-browser
  breakage locally rather than guessing: could not reproduce the actual bug
  with the exact same command sequence against a clean setup, which points at
  that specific live sandbox's stale state (sandboxes persist per-thread;
  rebuilding the template doesn't reach an already-running one) rather than a
  wrapper design flaw. Found and fixed two real things while investigating:
  the wrapper had no error handling (a failed CloakBrowser resolve would
  silently launch with garbage env vars instead of falling back cleanly), and
  `get_default_stealth_args()` returns a fresh random fingerprint on every
  call, which the wrapper was re-resolving on every single invocation instead
  of once per session, a real stealth-consistency bug. Both fixed and verified
  end-to-end locally (session-scoped fingerprint caching, clean fallback on
  resolve failure) before rebuilding the template.
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
