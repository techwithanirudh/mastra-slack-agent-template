# Scheduled tasks: fix delivery, drop schedule_reminder, add a Slack-native one-time option

## Summary

The recurring-task system (`create_scheduled_task` and friends, backed by Mastra's
`mastra.schedules`) is already ported from gorkie and live in this repo. What's
missing is a working one-time reminder: this branch deleted `schedule_reminder`
and left a documented but non-functional replacement ("use the sandbox for
one-offs"), which cannot work because the E2B sandbox tears down after 8
minutes. This plan restores one-time scheduling the way the maintainer asked
for it, as a thin wrapper over Slack's own `chat.scheduleMessage` API (already
exposed by the Chat SDK as `thread.schedule()`/`channel.schedule()`), fixes the
one open correctness gap in the channel-thread tool-card delivery fix, and
ports gorkie's `handlers`-based recipient capture instead of the template's
current adapter-level hack.

## Current state

### Recurring scheduled tasks (already ported, working)

`src/mastra/tools/scheduled-tasks/{create,delete,list,pause,resume,queries,utils,index}.ts`
is byte-identical to gorkie's `/workspaces/gorkie/src/mastra/tools/scheduled-tasks/`
except two cosmetic diffs: a loop variable name (`i` vs `index`, Biome-driven)
and the minimum interval, 5 minutes here (`src/mastra/config.ts:14-16`,
`scheduledTasks.minInterval = 5 * 60 * 1000`) vs gorkie's 30 minutes. TODO.md's
gorkie regression sweep (`TODO.md:90`) already confirmed the 5-minute value is
intentional, not drift.

This system is built entirely on Mastra's `mastra.schedules` CRUD service
(`@mastra/core@1.50.0`, beta; see
`node_modules/@mastra/core/dist/docs/references/reference-schedules-overview.md`
and `docs-long-running-agents-schedules.md`):

- `create.ts:81-107` calls `service.create({ agentId, cron, prompt, threadId,
  resourceId, tagName: 'scheduled-task', ifActive: { behavior: 'persist' },
  ifIdle: { behavior: 'wake', streamOptions: { requestContext } }, metadata:
  { kind, task, createdBy, createdIn } })`. `threadId`/`resourceId` come from
  `memoryThread()` (`src/mastra/lib/memory.ts:3-19`), which looks up the
  Mastra memory thread by `metadata.channel_externalThreadId` so the schedule
  fires a signal into the same conversation the tool was called from.
- `queries.ts` scopes every read/write to the calling user
  (`taskScope()` reads `context.agent?.resourceId`, `canViewTask`/
  `canManageTask` compare `task.resourceId`, `findOwnedTask` throws if the
  caller isn't the creator).
- `create.ts:10-28` (`assertMinimumInterval`) uses
  `computeNextFireAt`/`validateCron` from `@mastra/core/workflows` to reject
  cron expressions that fire faster than `scheduledTasks.minInterval` by
  sampling five consecutive fires and checking the smallest gap.
- Cron is genuinely recurring only. There is no "fire once at time X, then
  delete" primitive in `mastra.schedules`: `create(input)` always takes a
  `cron` string, and while `schedules.run(id)` fires once immediately
  off-schedule, nothing lets you *schedule* a single future fire without a
  cron. A one-time reminder built on this API would need a synthetic cron for
  one instant (fragile: DST, leap seconds, and no `deleteAfterFirstFire`), or
  a background `setTimeout`, which doesn't survive a restart, violating the
  "schedules are persisted" guarantee the docs promise for anything else.

### Tool-card delivery into channel threads (fixed, unverified)

TODO.md's Bugs section (`TODO.md:117-136`) documents the root cause and fix:
Slack's native `chat.startStream` (which carries the `{ chunk, kind: 'stream'
}` tool-card chunks `src/mastra/chat/tool-display/format.ts` emits) requires
`recipient_user_id`/`recipient_team_id` outside a DM. `chat`'s
`Thread.handleStream()` only derives those from a live inbound message; a
scheduled fire wakes an idle thread with none, so `@chat-adapter/slack`'s
`stream()` saw no recipient and fell back to plain post+edit, silently
dropping tool cards. The fix lives in `src/mastra/chat/adapter.ts:10-85`
(`SlackAgentAdapter`): it overrides the protected `handleMessageEvent` to
stash `{ userId, teamId }` per thread (in-memory `Map` plus `chat.getState()`
for restart durability), and overrides `stream()` to inject the stashed
recipient whenever the caller didn't supply one and the channel isn't a DM.
TODO.md explicitly flags this "Verify live before closing", it has not been
confirmed against a real fired schedule yet.

**Compare to gorkie's actual mechanism**, which differs architecturally, not
just cosmetically. Gorkie (`/workspaces/gorkie/src/mastra/chat/preferences.ts:34-46`,
`handlers.ts:44-62`) captures the same `{ teamId, userId }` pair, but from
inside `onMention`/`onSubscribedMessage`/`onDirectMessage` in
`chat/handlers.ts`, the Chat SDK's own extension point, not by overriding a
`protected` adapter method. It Zod-parses `message.raw` for `team`/`team_id`/
`user.team_id` (`handlers.ts:16-32`, a `looseObject` schema) instead of reading
raw event fields, and it runs for every handler including DMs (the template's
version explicitly skips `event.channel_type === 'im'`). Gorkie's
`chat/adapter.ts:60-93` `stream()` then reads it back via
`getStreamRecipient(state, threadId)`.

This matters for two reasons:
1. `CLAUDE.md` and `CODING_STANDARDS.md` both say never hand-roll what Chat
   SDK's `channels`/`handlers` already provide, and to validate all external
   input (Slack payloads) with Zod at the boundary. The template's
   `handleMessageEvent` override reaches below the `handlers` abstraction and
   reads `event.team_id ?? event.team` unparsed, both of which are exactly the
   pattern the docs warn against.
2. It is one plausible reason the fix might still have gaps: gorkie's own
   TODO.md (`/workspaces/gorkie/TODO.md:44,51`) independently root-caused the
   *identical* bug ("DMs and scheduled/heartbeat-fired tasks both get stuck on
   a bare `...` placeholder") and explicitly separates it into two bugs: the
   DM case (fixed differently there, via `assistant_thread_started`-driven DM
   anchoring, moot here since this template already runs `assistant_view` and
   gets a real `thread_ts` for DMs from the start) and the scheduled/heartbeat
   case, which gorkie's TODO marks "still separately open" as of that
   revision. There is no evidence in either repo that the channel-thread
   scheduled-fire case has been confirmed working end-to-end in Slack.

### schedule_reminder (removed here, still present in gorkie)

`git show HEAD:src/mastra/tools/schedule-reminder.ts` (deleted in this
branch's working tree, still committed) shows the tool this branch removed:

```ts
execute: async ({ text, seconds }, context) => {
  const { userId } = channelContext(context?.requestContext);
  const postAt = new Date(Date.now() + seconds * 1000);
  const dm = await chat().openDM(userId);
  await dm.schedule({ markdown: text }, { postAt });
  ...
}
```

Two things worth noting precisely because they cut against "just delete it":

- It already *was* the Slack-native option. `dm.schedule({ markdown, postAt
  })` resolves through Chat SDK's `Postable.schedule()`
  (`node_modules/chat/dist/chat-Dm1vQU3i.d.ts:1067`, "Currently only supported
  by the Slack adapter via `chat.scheduleMessage`") straight to
  `@chat-adapter/slack`'s `scheduleMessage()`
  (`node_modules/@chat-adapter/slack/dist/index.js:3034-3113`), which calls
  Slack's real `chat.scheduleMessage` Web API method and, on `cancel()`, Slack's
  `chat.deleteScheduledMessage`. No bespoke persistence, no wake-up, no tool
  card needed: Slack's own servers hold and deliver it.
- Its limits were narrower than the API it wrapped: DM-only
  (`chat().openDM(userId)`, hardcoded), one 30-second-to-120-day-ish window
  capped only by the tool's own `.max(120 * 24 * 60 * 60)` seconds (not
  validated against Slack's real 120-day `post_at` ceiling), no cancel, no
  list, and no way to target a channel/thread the way `post_message` can.

gorkie's `base.ts` still registers `schedule_reminder: scheduleReminderTool`
alongside `scheduledTaskTools` (`/workspaces/gorkie/src/mastra/tools/base.ts:5,18`)
unchanged from this shape, so gorkie has not yet solved the generalization
either; this plan is not a straight port, gorkie has nothing more mature to
copy here.

TODO.md (`TODO.md:43-45`) currently records the removal as: "use
`create_scheduled_task` for recurring, and the sandbox for one-offs." The
sandbox is not a viable one-off mechanism: `src/mastra/config.ts:1-5` sets
`sandbox.timeout = 8 * 60 * 1000` (8 minutes), so anything like "remind me in
3 hours" or "message #standup tomorrow at 9am" cannot be done by leaving a
process sleeping in the E2B sandbox. As it stands on this branch, one-time
future delivery is simply broken: no tool the agent has can do it. This is
almost certainly what "scheduled tasks are broken" refers to.

## Design

Two clearly separated mechanisms, not one system straining to cover both
cases:

1. **Recurring, conversational, cron-based** → keep `create_scheduled_task`
   and friends exactly as they are. They need `mastra.schedules` because they
   re-enter the agent loop on every fire (the point is new agent reasoning
   each time, e.g. "check the queue and summarize").
2. **One-time, fire-and-forget delivery of a known message at a known time** →
   a small `schedule_message`/`cancel_scheduled_message`/`list_scheduled_messages`
   tool trio built directly on Slack's native scheduling (`chat.scheduleMessage`
   / `chat.deleteScheduledMessage` / `chat.scheduledMessages.list`, exposed
   through Chat SDK's `Postable.schedule()`). No agent re-invocation, no
   `mastra.schedules` row, no wake-up, no tool-card-in-a-cold-thread problem
   at all, because nothing wakes: Slack posts the message itself. This is the
   "give it as a Slack API option" the maintainer asked for.

**Why not force one-time reminders through `mastra.schedules`:** you'd need a
synthetic single-fire cron plus a `prepare` hook (or an `onFinish` hook, see
`docs-long-running-agents-schedules.md:160-196`) that calls `service.delete`
after the first fire, fighting the API's actual shape (recurring by design)
and re-introducing the exact tool-card-delivery risk above for something that
doesn't need the agent to run at all. Rejected.

**Why not `reminders.add`:** researched and rejected. Slack's Reminders API
has been degraded since a March 2023 retirement notice, and even where it
still works, "recurring reminders can't be set for other team members" and
"setting reminders for other users can now only be done with a bot token" are
real, current constraints (per Slack's docs/changelog, see citations below).
`chat.scheduleMessage` is the actively maintained, fully documented mechanism
and is what Chat SDK already wraps. No reason to hand-roll a second, worse
path when `.schedule()` exists.

**Generalize beyond DM-only.** `src/mastra/chat/target.ts:5-25` already
defines exactly the target-resolution shape needed:

```ts
export const targetSchema = z.object({
  type: z.enum(['thread', 'channel', 'user']),
  id: z.string().min(1),
});
export async function resolveTarget(target: Target): Promise<Channel | Thread> {
  if (target.type === 'channel') return chat().channel(target.id);
  if (target.type === 'user') return await chat().openDM(target.id);
  return chat().thread(target.id);
}
```

`Channel` and `Thread` both implement `Postable`, which is where `.schedule()`
lives (`node_modules/chat/dist/chat-Dm1vQU3i.d.ts:104,302,1067`). The new tool
reuses `targetSchema`/`resolveTarget` verbatim, the same pattern
`post-message.ts:3,11,20` already uses, so a scheduled message can go to the
current thread (the common case, default to `channelContext(...).threadId`
when the model omits a target, same default `create_scheduled_task` uses), an
explicit channel, or a DM, instead of being hardcoded to
`chat().openDM(userId)`.

**Cancel and list need a lightweight index, since Slack doesn't give you an
ownership model.** `chat.scheduledMessages.list` takes no scope and returns
"pending scheduled messages... scheduled via chat.scheduleMessage with the
same token" (i.e., every scheduled message across the whole bot, not scoped
per user or per thread). To let `list_scheduled_messages`/
`cancel_scheduled_message` show only the calling user's own messages (matching
the ownership model `scheduled-tasks/queries.ts` already established for
recurring tasks), `schedule_message` stores a small record via the same state
mechanism `chat/adapter.ts`/gorkie's `chat/preferences.ts` already use
(`chat.getState()`, one JSON blob per key), keyed by `scheduled-message:
<scheduledMessageId>`, holding `{ channelId, postAt, createdBy, createdIn:
{ threadId }, text }`. This is deliberately not a new Postgres table: it
reuses the channels state adapter already backing everything else in
`chat/adapter.ts`, so there's no new storage surface to run migrations for.

**Recipient-stash correctness (blocking, not optional).** Before shipping any
new one-time tool that also posts *into a channel thread while idle*
(scheduled messages posted by Slack itself don't need this, Slack posts them
directly, no agent stream involved, but the existing recurring-task delivery
still does), port gorkie's `handlers`-based capture
(`chat/preferences.ts:7,34-46` + `chat/handlers.ts:44-62`) in place of the
current `handleMessageEvent` override in `chat/adapter.ts:22-52`. Concretely: this template already has the matching hook, `src/mastra/chat/handlers.ts`,
with `onMention`/`onSubscribedMessage`/`onDirectMessage` exports
(lines 60, 78, 102) that already call a `captureSearchToken` helper
(line 16) using the exact `z.looseObject` pattern needed here. Add a sibling
`captureStreamRecipient` helper (inline in `handlers.ts`, no new file needed
per "inline over extract"; gorkie's separate `chat/preferences.ts` exists
because it also holds DM-anchor and tool-display-preference state this
template doesn't have), Zod-validate `message.raw` for
`team`/`team_id`/`user.team_id` the way gorkie's `slackTeam` schema does
(`gorkie/src/mastra/chat/handlers.ts:23-32`) instead of the current unchecked
`event.team_id ?? event.team`, and call it from all three handlers. Then
live-verify: schedule a `create_scheduled_task` in a public
channel thread, let it fire while the thread is idle, and confirm tool cards
(not a stuck `...` placeholder) render. Close out `TODO.md:117-136`'s "Verify
live before closing" only after that.

## Implementation steps

1. **Port the recipient-stash fix onto `handlers`, not the raw adapter event.**
   This template already has the exact hook gorkie uses:
   `src/mastra/chat/handlers.ts` exports `onMention` (line 60),
   `onSubscribedMessage` (line 78), and `onDirectMessage` (line 102), each
   already calling a small `captureSearchToken(thread, message.raw)` helper
   (line 16) as its first line, using the same `z.looseObject` pattern this
   plan wants for the recipient. Follow that existing shape exactly:
   - Add a `slackTeam` Zod schema next to `actionToken` (`handlers.ts:12-14`),
     copying gorkie's shape (`gorkie/src/mastra/chat/handlers.ts:23-32`):
     `team`/`team_id`/`user.team_id` as a `looseObject`.
   - Add `captureStreamRecipient(thread, message)` next to
     `captureSearchToken` (`handlers.ts:16-22`), parsing `message.raw` and
     calling `chat().getState().set('stream-recipient:' + thread.id, {
     teamId, userId: message.author.userId })` when a team id is present.
   - Call it alongside the existing `captureSearchToken` call at the top of
     `onMention` (line 65), `onSubscribedMessage` (line 83), and
     `onDirectMessage` (line 107), e.g.
     `await Promise.all([captureSearchToken(...), captureStreamRecipient(...)]);`
     matching gorkie's three call sites exactly
     (`gorkie/src/mastra/chat/handlers.ts:107,132,173`).
   - Delete the `handleMessageEvent` override in `chat/adapter.ts:22-52`
     entirely (it becomes dead code once `handlers.ts` captures the same
     data); keep the `stream()` override's read side (`chat/adapter.ts:54-85`)
     reading the same `stream-recipient:<threadId>` key, either via the
     existing in-adapter `Map` cache or read straight from `chat.getState()`
     if profiling shows the cache isn't earning its keep, per "inline over
     extract".
   - This also fixes two smaller gaps versus gorkie's version: the current
     `handleMessageEvent` override explicitly skips DMs
     (`event.channel_type !== 'im'`, `chat/adapter.ts:31`) and reads
     `event.team_id ?? event.team` with no validation. Moving to `handlers.ts`
     naturally covers DMs too (`onDirectMessage` also calls the capture) and
     replaces the unchecked field read with a Zod-parsed one, per
     CODING_STANDARDS's "parse all external input with Zod" rule.
2. **Live-verify channel-thread scheduled delivery** (ask the user, since
   CLAUDE.md forbids starting/restarting `mastra dev` unilaterally): create a
   `create_scheduled_task` in a public channel thread with a 5-minute cron,
   let it fire once while idle, confirm a live tool card (not `...`) appears.
   Only then mark `TODO.md:117-136` fully closed.
3. **Add `src/mastra/tools/scheduled-tasks/message.ts`** (new file, same
   directory as the recurring tools so `docs/adding-tools.md`'s registration
   story stays in one place):
   ```ts
   export const scheduleMessageTool = createTool({
     id: 'schedule_message',
     description:
       'Schedule a one-time message for future delivery via Slack itself: no recurrence, no agent re-run. Use for reminders, nudges, or a message that should land later. For recurring work use create_scheduled_task instead.',
     inputSchema: z.object({
       message: z.string().min(1).max(3000),
       postAt: z.string().datetime().describe('ISO 8601 timestamp, must be in the future and within 120 days.'),
       target: targetSchema.optional().describe('Defaults to the current thread.'),
     }),
     execute: async ({ message, postAt, target }, context) => {
       const ctx = channelContext(context?.requestContext);
       const resolved = target ?? (ctx.threadId ? { type: 'thread' as const, id: ctx.threadId } : undefined);
       if (!resolved) throw new Error('No current thread and no explicit target.');
       const destination = await resolveTarget(resolved);
       const scheduled = await destination.schedule({ markdown: message }, { postAt: new Date(postAt) });
       await chatState().set(`scheduled-message:${scheduled.scheduledMessageId}`, {
         channelId: scheduled.channelId, postAt: scheduled.postAt.toISOString(),
         createdBy: ctx.userId, createdIn: { threadId: ctx.threadId }, text: message,
       });
       return { success: true, id: scheduled.scheduledMessageId, postAt: scheduled.postAt.toISOString() };
     },
   });
   ```
   (Sketch only; validate the exact `Postable.schedule()` return shape against
   `node_modules/chat/dist/chat-Dm1vQU3i.d.ts:1530-1546` before finalizing, and
   surface Slack's `time_too_far`/`time_in_past`/`restricted_too_many` errors
   as clear tool-result messages rather than a raw throw, matching
   `post-message.ts:28-42`'s error-translation pattern.)
4. **Add `cancel_scheduled_message`**: look up the stored record by id, verify
   `createdBy === ctx.userId` (same ownership check shape as
   `scheduled-tasks/queries.ts`'s `findOwnedTask`), call `.cancel()` on a
   `ScheduledMessage` reconstructed from the stored `channelId`/id (or keep
   the live `ScheduledMessage` object only for the synchronous case and fall
   back to a direct `slack.webClient.chat.deleteScheduledMessage({ channel,
   scheduled_message_id })` call for a message scheduled in an earlier
   process/turn), delete the state key.
5. **Add `list_scheduled_messages`**: read the calling user's own
   `scheduled-message:*` keys from state (or, since state adapters generally
   don't support prefix scans, keep a small per-user index key,
   `scheduled-messages:<userId>`, holding an array of ids, updated by
   `schedule_message`/`cancel_scheduled_message`) and format similarly to
   `scheduled-tasks/utils.ts`'s `formatTask`.
6. **Register the trio** in `src/mastra/tools/scheduled-tasks/index.ts`
   alongside the existing five, and update `src/mastra/tools/base.ts`'s
   `scheduledTaskTools` spread (no new top-level import needed, it already
   spreads that module).
7. **Update tool descriptions** on `create_scheduled_task`
   (`scheduled-tasks/create.ts:33`) to stop implying the sandbox handles
   one-offs and instead point at `schedule_message`; likewise update any
   prompt copy that references scheduling (checked: none currently do, per
   the grep in Current state).
8. **Update `TODO.md`**: replace the "and the sandbox for one-offs" line
   (`TODO.md:44-45`) once `schedule_message` ships, and close the "Verify live
   before closing" bug (`TODO.md:117-136`) only after step 2's live check.
9. **Docs**: add a short section to `docs/adding-tools.md` or a new
   `docs/scheduling.md` distinguishing "recurring → create_scheduled_task"
   from "one-time → schedule_message", since two tools that both say
   "schedule" invite model confusion without a clear split documented
   somewhere a template user will actually read.

## Data / schema / config changes

- **No new dependencies.** Everything needed (`Postable.schedule()`, Slack Web
  API `chat.scheduleMessage`/`chat.deleteScheduledMessage`/
  `chat.scheduledMessages.list`) is already present in `chat` and
  `@chat-adapter/slack`, both already pinned dependencies.
- **No new Slack OAuth scope.** `chat:write` is already granted
  (`slack-manifest.json:31`) and is the only scope `chat.scheduleMessage`
  requires; `chat.scheduledMessages.list` requires no scope at all.
- **No new Postgres table/migration.** State for the one-time-schedule
  ownership index reuses the existing `chat.getState()` channels-state
  adapter (same mechanism `chat/adapter.ts`'s recipient stash and gorkie's
  `chat/preferences.ts` already use), just new key names
  (`scheduled-message:<id>`, `scheduled-messages:<userId>`).
- **`src/env.ts`**: no changes; nothing here reads a new environment variable.
- **`src/mastra/config.ts`**: no changes needed for `schedule_message` itself;
  Slack's own 120-day/30-per-5-min limits are enforced server-side. If a
  template-level cap is wanted (e.g. to bound how many pending one-time
  messages a single user can have), that would be a new `config.ts` constant,
  flagged here as optional, not required by this plan.
- **Types**: add the stored record shape (`{ channelId, postAt, createdBy,
  createdIn, text }`) to `src/mastra/types/tools.ts` alongside
  `TaskToolContext`, per CODING_STANDARDS's "shared types live in
  `src/mastra/types/`" and "tool-owned shared shapes live under
  `types/tools/<tool>.ts`" (create `types/tools/scheduled-tasks.ts` if the
  existing flat `types/tools.ts` is judged to have outgrown a single file;
  otherwise extend it in place, since it currently holds one small interface).

## Risks & open questions

- **The channel-thread tool-card fix is unverified.** This is the single
  highest-risk open item: both this repo's and gorkie's own TODOs flag the
  scheduled/heartbeat-fired case as unconfirmed live. Until step 2 is done,
  "scheduled tasks are broken" may still be true for `create_scheduled_task`
  even after this plan ships `schedule_message`.
- **`Postable.schedule()` doesn't support streaming or rich content
  ("streaming not supported" per the JSDoc at
  `chat-Dm1vQU3i.d.ts:1053`).** `schedule_message` can only send a static
  markdown string decided at call time, it cannot decide what to say based on
  state at delivery time (that's what `create_scheduled_task` is for). Worth
  stating explicitly in the tool description so the model doesn't try to use
  it for "check X and tell me" style one-offs.
- **Ownership index can drift from Slack's actual state** if a scheduled
  message is canceled or fires through a path that doesn't go through
  `cancel_scheduled_message` (e.g., manually via Slack's UI, or Slack fired it
  already). `list_scheduled_messages` should reconcile against a live
  `chat.scheduledMessages.list` call rather than trusting the stored index
  alone, or clearly caveat that listed entries may already have fired.
- **`state` adapter has no prefix-scan/query**, confirmed by inspecting the
  `StateAdapter` type Chat SDK exposes (get/set/delete by exact key only), so
  a per-user id-array index (step 5) is required; this is the same shape
  constraint gorkie's `preferences.ts` already lives with, not new risk this
  plan introduces.
- **Open question for the maintainer**: should `schedule_message` allow
  targeting *any* channel/DM like `post_message` does, or be restricted to
  the current thread only (safer default, matches `create_scheduled_task`'s
  current scoping)? TODO.md's deferred Slack tool-authorization work
  (`TODO.md:73-86`) explicitly separates "agent-authored posts stay open"
  from "send-as-user is secured", a scheduled message to an arbitrary
  channel is agent-authored, so the existing `post_message` precedent argues
  for allowing any target, but flag this for an explicit decision rather than
  assuming it.
- **`schedule_message`'s 3000-char cap** was copied from the old
  `schedule_reminder`'s arbitrary limit; Slack's real constraint is
  `msg_too_long` at a much higher character count. Keep a cap for prompt
  hygiene but don't present it as a Slack limit in the tool description.

## Effort & priority

**M.** The one-time-scheduling tool trio (steps 3-6) is small, it is
almost entirely target resolution and state bookkeeping already proven
elsewhere in this codebase (`post-message.ts`, `scheduled-tasks/queries.ts`,
`chat/adapter.ts`'s state usage). The size is driven by step 1 (porting the
`handlers`-based recipient capture) and step 2 (live verification in a real
Slack workspace, which the maintainer must do, not an agent). No dependency
on other plans in this folder to start, but it's worth sequencing after or
alongside [wait-tool.md](wait-tool.md) (the `wait` tool is the other half of
"how do I make the agent do something later," for sub-60-second gaps) and
before [signal-subscriptions.md](signal-subscriptions.md), since that plan
will likely want the same recipient-stash correctness fix (step 1) for its
own "wake a thread later" delivery path, no reason to fix it twice.
