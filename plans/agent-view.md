# Slack `assistant_view` DM anchoring and assistant-thread lifecycle

## Summary

This repo already ships `assistant_view` in `slack-manifest.json` with the
Chat SDK's native `assistant_thread_started` / `assistant_thread_context_changed`
handlers wired up (`src/mastra/chat/events.ts:87-95`), and both `TODO.md` and
this plan's own research confirm that switch already fixed native DM
streaming without any custom reply-anchoring code. The open question this
plan resolves is whether a DM anchor (persisted "first message ts" per DM
channel, as gorkie prototyped but never merged) is still needed on top of
that. It is not: `assistant_view` supplies a real, non-empty `thread_ts` from
the moment the Assistant panel opens, and every message the SDK subsequently
receives in that DM already carries that `thread_ts`, so `@chat-adapter/slack`'s
existing `stream()` path threads correctly with zero custom code. This plan
recommends staying on that state (no DM anchor), documents why, and flags a
real, near-term risk: Slack shipped a brand-new, differently-named `agent_view`
manifest feature on 2026-06-30 that is NOT the same thing this codebase
previously called "agent_view," and the pinned `@chat-adapter/slack@4.32.0`
has zero code for it.

## Current state

### This repo (already implemented)

- `slack-manifest.json:1-72` ships `features.assistant_view` (not
  `agent_view`) with `assistant_description`, and
  `settings.event_subscriptions.bot_events` includes
  `assistant_thread_context_changed`, `assistant_thread_started`,
  `app_home_opened`, `message.im`, etc.
- `src/mastra/chat/events.ts:84-96`: `registerEvents()` wires
  `bot.onAssistantThreadStarted` and `bot.onAssistantContextChanged`, both
  calling `setStarters(event.channelId, event.threadTs)` (line 87-93), plus
  `bot.onAppHomeOpened` for the home tab. No DM-anchor code exists here or
  anywhere else in `src/mastra/chat/`.
- `src/mastra/chat/adapter.ts:10-127`: `SlackAgentAdapter extends SlackAdapter`
  overrides `handleMessageEvent` (line 22) and `stream` (line 54) but only to
  stash a `{ userId, teamId }` *recipient* for scheduled-task streaming into
  non-DM channels (the fix documented in `TODO.md`'s "Bugs" section). It does
  **not** touch DM thread anchoring, and it does not call `super.stream()`
  with a rewritten `threadId` for DMs the way gorkie's stashed prototype does.
- `src/mastra/processors/title.ts:7-19` (`mirrorTitle`) decodes
  `ctx.threadId` via `slack.decodeThreadId` and calls
  `slack.setAssistantTitle(channel, threadTs, title)`, bailing if `threadTs`
  is falsy (line 15). `TODO.md` marks Slack title-mirroring "[x]" as shipped
  and working for DMs. This only works if DM `threadId`s already carry a
  non-empty `threadTs` end to end, which is itself evidence the native
  `assistant_view` thread_ts is flowing correctly with no anchor.
- `src/mastra/agents/orchestrator.ts:61-81`: `Memory` config:
  `lastMessages: 20`, `generateTitle` pointed at `summarizerModel[0].model`
  (line 64-68), `observationalMemory.scope: 'thread'` (line 78). Documented
  in `docs/memory.md:6-18`, which still carries an open note ("Revisit
  whether thread-scoped Observational Memory should stay the Slack default
  after `assistant_view` DM behavior has been live-tested", also tracked as
  an open bullet in `TODO.md`'s "Customize" section).
- `docs/messaging.md:84-88`: the "DMs" section is thin ("DMs work like
  normal agent conversations") and does not document the `assistant_view`
  lifecycle (suggested prompts on open, title mirroring, no anchor needed).
- `TODO.md` "Recently completed" already records: "Switched the Slack
  manifest and adapter from `agent_view` back to `assistant_view`... this
  fixes native streaming and live tool display in DMs without the custom
  reply-anchoring workaround `agent_view` needed." This plan's research
  independently confirms that claim at the SDK-source level (see Design).

### Gorkie (`/workspaces/gorkie`, unmerged WIP, not shipped)

- Gorkie's tracked `dev` HEAD (`git show HEAD:src/mastra/chat/adapter.ts`,
  `git show HEAD:src/mastra/chat/events.ts`) matches this repo's shape
  exactly: no DM anchor, `assistant_thread_started`/`assistant_thread_context_changed`
  → `setStarters`, nothing more. Gorkie's own tracked
  `slack-manifest.yaml:14-15` also ships `assistant_view`, and its
  `event_subscriptions` (line 45-55) matches this repo's list. Gorkie has
  never shipped `agent_view` or a DM anchor on `dev`.
- A DM-anchor prototype exists ONLY in `stash@{0}` ("wip: DM anchor + titles
  + mid-thread refetch fixes", `git stash show --name-only 'stash@{0}'`):
  `src/mastra/chat/adapter.ts`, `src/mastra/chat/events.ts`,
  `src/mastra/processors/turns.ts`, `src/mastra/prompts/tools.ts`,
  `src/mastra/tools/scheduled-tasks/create.ts`. There is no
  `chat/preferences.ts` or `chat/dm-anchor.ts` file in this stash's changed-file
  list; the anchor persistence is imported from `./dm-anchor`
  (`getDmAnchor`/`setDmAnchor`, referenced but not itself included in the
  stash diff, so its own contents were not inspectable here. Treat it as
  unverified plumbing, not just the class body below.
- The stashed `GorkieSlackAdapter` (`git show 'stash@{0}:src/mastra/chat/adapter.ts'`)
  adds `anchorDmThreadId()`, and overrides `postMessage()` and `stream()` to
  call it. Its own top-of-class comment states the premise directly: "DMs
  encode an empty `threadTs` for their flat/un-threaded conversation... But
  Slack's real `chat.startStream` API requires a non-empty `thread_ts`, so an
  empty one makes `stream()` bail... The common case is covered proactively:
  `assistant_thread_started` (`chat/events.ts`) persists the real `thread_ts`
  Slack hands us the moment a new Assistant conversation starts... This is
  only the remaining gap: `stream()` can't post unanchored the way
  `postMessage` can... so if it's ever the very first call into a DM with no
  anchor anywhere, guess at the most recent message via
  `conversations.history`." In other words: even gorkie's own prototype
  describes the anchor as covering only a narrow race (the very first
  `stream()` call landing before `assistant_thread_started`'s handler has
  persisted anything), not the general case. It is a defensive patch for an
  edge case, not a required mechanism for `assistant_view` DMs to work at all.
  It was never merged, never ran against real Slack traffic on `dev`, and per
  the brief must be treated as an unproven prototype.

## Design

### The central technical question, resolved

Under `assistant_view`, does the Chat SDK already have a real, non-empty
`thread_ts` for a DM by the time it needs one for streaming, or does a custom
anchor still fill a gap? Traced end to end in
`node_modules/@chat-adapter/slack/dist/index.js` (v4.32.0, pinned in
`package.json:32`):

- `handleAssistantThreadStarted` (index.js:2255-2290) fires on Slack's
  `assistant_thread_started` event, destructures
  `{ channel_id, thread_ts, user_id, context }` from `event.assistant_thread`
  (line 2268), and forwards a `threadId` encoded from that real `thread_ts`
  to `chat.processAssistantThreadStarted` (line 2270-2290).
- `chat.processAssistantThreadStarted` (`node_modules/chat/dist/index.js:2758-2771`)
  only fans this event out to registered `onAssistantThreadStarted` handlers
  (i.e. this repo's `setStarters`, `chat/events.ts:87-89`). It does **not**
  persist any thread mapping into Chat SDK's own state; the thread_ts here is
  purely handed to app code, not remembered internally.
- `handleMessageEvent` (index.js:2089-2145) is what actually resolves the
  `threadId` used for every inbound message, including the DM's first turn:
  `const isDM = event.channel_type === "im"; const threadTs = isDM ? event.thread_ts || "" : event.thread_ts || event.ts;`
  (line 2131-2132). For a DM, this is empty **only if Slack's own
  `message.im` payload has no `thread_ts`**.
- `stream()` (index.js:3556-3568) bails to the post+edit fallback whenever
  `threadTs` decodes empty: `if (!threadTs) { ...; return null; }`
  (line 3559-3562). This is the exact failure mode in the brief's
  "established facts."
- Slack's own documentation for the `assistant_view` interaction model
  (`docs.slack.dev/ai/agent-entry-and-interaction/`, fetched during this
  research) states: "all messages in the container or in conversation with
  the app take place in message threads." That is Slack's platform-level
  guarantee, independent of the SDK: once a conversation is opened through
  the Assistant panel (`assistant_view`), Slack itself threads every message
  in it, including the first, under a real `thread_ts`. That is what makes
  `event.thread_ts || ""` resolve non-empty for DMs under `assistant_view`
  without any app code doing extra work.
- Corroboration inside this repo: `processors/title.ts:15` only calls
  `setAssistantTitle` when `threadTs` is truthy, and `TODO.md` marks that
  mirror as shipped and working in Slack DMs today. If DMs were still
  arriving with an empty `threadTs`, that mirror would be a permanent no-op,
  which is not the reported behavior.

Conclusion: **no DM anchor is needed under `assistant_view`.** Gorkie's
stashed prototype exists to patch a narrow first-`stream()`-call race under
a mental model ("DMs are flat/un-threaded") that predates the switch to
`assistant_view` and no longer applies here. Porting it would add a second,
redundant source of truth for DM threading (Postgres-backed anchor state,
plus `postMessage`/`stream` overrides) to guard against a race this repo's
own `assistant_thread_started` handler already avoids in the common path,
for a benefit that has not been observed or reproduced in this codebase.

### Recommendation: (a) full `assistant_view`, no custom anchor, stay as-is

Of the brief's three options:

- **(a) full `assistant_view` relying on SDK-native `thread_ts`, no custom
  anchor.** This is what the repo already does. Recommended: keep it.
- **(b) `assistant_view` + a persisted DM anchor.** Rejected: adds a second
  Postgres-backed source of truth (`chat/preferences.ts`-shaped state store),
  two more adapter method overrides (`postMessage`, `stream`), and a
  `conversations.history` fallback call, all to guard a race with no
  reproduced instance in this codebase. Violates this repo's own "inline
  over extract" / "no defensive checks for states that can't occur" coding
  rules (`CODING_STANDARDS.md:161-163`) without a demonstrated need.
- **(c) stay on `agent_view`.** Rejected: this is the state the repo already
  moved away from, specifically because it reproduces the flat/un-threaded
  DM bug (`handleMessageEvent`'s `event.thread_ts || ""` resolves empty for
  a first `message.im` with no Assistant panel wrapping it).

Ship nothing for this repo's day-to-day `assistant_view` behavior; the
remaining work is closing out the loose ends left by the switch (docs,
memory-scope TODO) and recording the migration risk below so it doesn't get
rediscovered from scratch later.

### New risk uncovered: Slack's *new* `agent_view` is a different, unrelated feature

While verifying the brief's naming against live Slack docs, this research
found that Slack shipped an **unrelated, newer manifest feature also called
`agent_view`** on 2026-06-30
(`docs.slack.dev/changelog/2026/06/30/agent-messages-tab/`, fetched during
this research), 11 days before this plan was written. This is a source of
serious naming confusion with this repo's own history and needs to be
recorded so nobody conflates the two:

- Slack's new `agent_view`: "Agent conversations now look & feel the same as
  a regular direct message... all conversations appear in the standard
  message tab... the `thread_ts` argument is no longer required when
  `agent_view` is enabled." It replaces the `assistant_view` model
  ("Assistant messaging experience... happens in separate Chat and History
  tabs") that this repo currently uses, and Slack states existing
  `assistant_view` apps "can continue to use it for now, but `assistant_view`
  will eventually be deprecated, and we'll ask existing apps to migrate to
  `agent_view`." New apps as of that changelog can reportedly only start on
  `agent_view`.
  - Under Slack's new `agent_view`, `assistant_thread_started` "no longer
    serves this purpose" for detecting a DM being opened; apps should use
    `app_home_opened` instead, and keeping a thread alive after a user's new
    message now goes through `assistant.threads.setStatus`
    (`docs.slack.dev/reference/methods/assistant.threads.setStatus/`).
  - Slack's changelog lists minimum SDK versions for adopting this
    (Slack CLI v4.4.0, Python SDK v3.43.0 + Bolt v1.29.0, Node SDK @7.18.0).
    None of those are `@chat-adapter/slack`/`chat` (the Chat SDK this repo
    uses). Slack's changelog only covers Slack's own official SDKs.
- Checked directly: `grep -n "agent_view\|agentView" node_modules/@chat-adapter/slack/dist/*.js node_modules/chat/dist/*.js` returns **zero matches**. The pinned `@chat-adapter/slack@4.32.0` / `chat@4.32.0`
  (`package.json:27,32,45`) has no code path for Slack's new `agent_view`
  contract at all: it still derives DM `threadTs` from
  `event.channel_type === "im" ? event.thread_ts || "" : ...`
  (index.js:2131-2132) and still relies on `assistant_thread_started` to
  learn a DM's `thread_ts` (index.js:2255-2290). If this repo's manifest were
  flipped to Slack's new `agent_view` today, with no other change, the most
  likely outcome is a regression back to the exact broken behavior described
  in the brief's "established facts" (empty `threadTs` on first DM message,
  `stream()` bails to post+edit) **plus** silently broken suggested prompts,
  since Slack may stop firing `assistant_thread_started` reliably under its
  new model while `chat/events.ts:87-93` still depends on it.

This is exactly the kind of drift this template's `TODO.md`/gorkie-diff
process exists to catch, but it originates from the platform, not from
gorkie. Track it as an explicit, dated risk (see below) rather than acting
on it now: acting today would require either patching around
`@chat-adapter/slack`'s missing support (out of scope, high risk, upstream's
job) or accepting a regression, for zero present-day benefit since
`assistant_view` still functions and Slack has not set a deprecation date.

### Template ergonomics

- **Extension surface stays minimal.** DM lifecycle is fully owned by
  `chat/events.ts`'s two handlers (`onAssistantThreadStarted`,
  `onAssistantContextChanged`) plus the adapter class in `chat/adapter.ts`.
  A template user adding a new platform (Discord, Telegram, see
  `TODO.md` roadmap and `plans/multi-platform.md` if present) does not need
  to reason about DM anchoring at all for Slack, and other Chat SDK adapters
  each own their own equivalent lifecycle independently; nothing here is
  Slack-anchor-shaped in a way that would leak into a generic surface.
- **Studio/token cost:** no change. No extra model calls are introduced;
  `setStarters`/`setAssistantTitle` are direct Slack Web API calls, not LLM
  calls. Recommending *against* the anchor also avoids adding an extra
  Postgres-state read/write per DM turn that option (b) would have
  introduced.
- **Un-confusing:** recommending (a) keeps the current single, obvious
  DM code path (`assistant_thread_started` → real `thread_ts` → everything
  downstream just works) instead of adding a second conditional path
  (anchor cache hit / miss / `conversations.history` fallback) that a reader
  would have to hold in their head to understand DM behavior.
- **Opt-in/removable:** not applicable to the recommendation itself (there is
  no new feature to gate), but the risk section below explains how to keep
  `assistant_view` opt-out-able if a maintainer ever needs to test Slack's
  new `agent_view` early: do it behind a manifest swap plus an
  `@chat-adapter/slack` version bump, never by adding a runtime toggle inside
  application code for two Slack thread models at once (that would be exactly
  the "billion statements" branchiness `CLAUDE.md`/the brief warn against).

## Implementation steps

This plan's scope is documentation and TODO bookkeeping; no production code
changes are needed, because the correct code state already exists. Steps:

1. **Do not port gorkie's stashed DM-anchor prototype.** No action beyond
   this plan recording why (done above). If a maintainer later observes the
   narrow race gorkie's prototype guards against (a `stream()` call landing
   before `assistant_thread_started`'s handler persists anything, causing one
   dropped stream on a brand-new DM), re-open this plan with the reproduction
   details rather than pre-emptively porting unverified code.

2. **Update `docs/messaging.md`'s "DMs" section (line 84-88)** to document
   the actual lifecycle instead of the current one-liner. Sketch:

   ```md
   ## DMs

   DMs work like normal agent conversations. Slack's Assistant panel
   (`assistant_view` in `slack-manifest.json`) threads every message in a DM
   conversation from the moment it opens, so streaming, tool cards, and
   thread titles (see [Memory](./memory.md)) all work the same way they do
   in a channel thread, no extra setup required.

   On open, `chat/events.ts`'s `onAssistantThreadStarted` /
   `onAssistantContextChanged` handlers set the suggested prompts shown in
   the panel. The suggested prompts in `slack-manifest.json` are unused;
   edit the `STARTERS` array in `chat/events.ts` instead.
   ```

   This directly fixes the stale claim that suggested prompts live in the
   manifest (they were moved to `chat/events.ts`, per `TODO.md`'s "Recently
   completed" list, but `docs/messaging.md:87` was never updated to match).

3. **Close the open TODO item in `docs/memory.md:32-35` and `TODO.md`'s
   "Customize" section** ("Revisit whether thread-scoped Observational
   Memory should stay the Slack default after `assistant_view` DM behavior
   has been live-tested"). This plan's research establishes `assistant_view`
   DM behavior is already correct and has been running long enough to be
   marked "[x] Recently completed" for the manifest switch itself. Concretely:
   - Ask the user (per `CLAUDE.md`: never restart their bot yourself) to
     confirm in their own running instance that a DM conversation
     accumulates Observational Memory correctly across multiple turns in the
     same Assistant panel thread (same thread_ts persists), not one
     observation-thread per message.
   - On confirmation, change `docs/memory.md:32-35`'s hedge to a plain
     statement that thread scope is the tested Slack default, and check off
     the corresponding `TODO.md` bullet.
   - If the maintainer instead observes fragmentation (a new memory thread
     per DM turn), that would mean `thread_ts` is NOT stable turn-to-turn
     under `assistant_view` as expected, contradicting this plan's SDK-source
     analysis; re-open investigation rather than silently reverting scope.

4. **Record the Slack `agent_view` (new, 2026-06-30) platform risk** as a
   dated `TODO.md` bullet (Roadmap or a new "Watch" section) so it isn't
   rediscovered as a surprise regression later, e.g.:

   ```md
   - [ ] WATCH: Slack shipped a new `agent_view` manifest feature
     (2026-06-30, docs.slack.dev/changelog/2026/06/30/agent-messages-tab/)
     that will eventually deprecate `assistant_view`. Do not adopt it yet:
     `@chat-adapter/slack@4.32.0` has no code for it (`agent_view`/`agentView`
     do not appear anywhere in `node_modules/@chat-adapter/slack/dist/` or
     `node_modules/chat/dist/`), and Slack's own migration notes say
     `assistant_thread_started` "no longer serves this purpose" under the new
     model, which `chat/events.ts`'s suggested-prompts wiring depends on.
     Revisit once `@chat-adapter/slack` ships explicit support (watch
     https://github.com/vercel/chat releases/issues) or Slack announces a
     deprecation date for `assistant_view`.
   ```

5. **No manifest, adapter, scope, or dependency changes.** Explicitly out of
   scope for this plan; flagging here per `CLAUDE.md`'s "ask first" rule so
   it's clear none of steps 1-4 require that approval gate.

## Data / schema / config changes

None. No env vars, no Postgres schema changes, no Slack manifest scope or
event changes, no new dependencies. The manifest already has everything this
plan relies on (`assistant_thread_started`, `assistant_thread_context_changed`,
`message.im`, `app_home_opened` all already subscribed in
`slack-manifest.json:52-60`).

## Risks & open questions

- **Unverified**: the exact race gorkie's stashed `anchorDmThreadId()`
  defends against (a `stream()` call arriving before
  `assistant_thread_started`'s handler runs) has not been reproduced or
  observed in this repo. If it turns out to occur in practice (e.g. Slack
  delivers the first `message.im` and `assistant_thread_started` out of
  order, or concurrently, under load), the fix would be narrower than
  gorkie's full anchor: `stream()`'s own `if (!threadTs) return null` fallback
  to post+edit already degrades gracefully (loses live tool cards for that
  one turn, doesn't break the conversation), so this may not need a fix at
  all even if observed.
- **Unverified**: whether Slack's assistant-panel threading guarantee ("all
  messages in the container... take place in message threads") holds for
  every entry point into a DM (e.g. a user re-opening an old Assistant
  conversation from History versus starting fresh) or only the common "open
  panel, type message" path this research traced through
  `assistant_thread_started`. Recommend the maintainer watch for any DM
  where `mirrorTitle` (`processors/title.ts:15`) silently no-ops (falsy
  `threadTs`) as a signal this assumption has a gap.
- **Unverified**: gorkie's stashed `dm-anchor` module itself (imported by
  name as `getDmAnchor`/`setDmAnchor` in the stashed `adapter.ts` but not
  part of `stash@{0}`'s changed-file list, see Current state). Its
  persistence shape was not inspectable in this research and should be
  treated as unverified plumbing, not confirmed working code, if this plan's
  recommendation is ever revisited.
- **Decision needed from maintainer**: whether to add the "WATCH" TODO
  bullet for Slack's new `agent_view` verbatim as drafted in step 4, or fold
  it into an existing roadmap item.
- **Decision needed from maintainer**: whether closing the Observational
  Memory scope TODO (step 3) should wait for the maintainer's own live test
  in their running Slack instance, per `CLAUDE.md`'s rule against this
  agent starting/restarting their bot itself.

## Effort & priority

**S** (small). No code changes; two doc edits (`docs/messaging.md`,
`docs/memory.md`) and two `TODO.md` bookkeeping edits (close one item, add
one dated watch item). No dependencies on other plans in this folder. Low
priority to execute since the underlying behavior already works; the value
here is closing the open question cleanly and leaving a documented trail so
the `agent_view` naming collision and the "why no anchor" reasoning aren't
re-litigated from scratch by a future session.
