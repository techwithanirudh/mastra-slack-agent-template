# Message ownership scoping for edit_message / delete_message

## Summary

`edit_message` and `delete_message` currently accept any Slack channel/ts the
model is given and call the Slack Web API directly, with no check that the
bot itself sent that message or that the person asking is the same person who
asked for it to be sent. Gorkie's `dev` branch closes this gap with a small
state-tracked ownership assertion; this plan ports that mechanism into the
template, generalizes it (no hardcoded bot identity, no gorkie wording), and
places it so the upcoming Slack code-mode refactor can reuse it unchanged.

## Current state

**This repo has the tools but no scoping.** `src/mastra/tools/slack/edit-message.ts:24-38`
and `src/mastra/tools/slack/delete-message.ts:19-32` parse a Slack URL or
`{channelId, messageId}` pair and call `slack.webClient.chat.update`/
`chat.delete` straight away, no ownership check of any kind:

```ts
// src/mastra/tools/slack/edit-message.ts:24-38 (current, template)
execute: async (input) => {
  const target =
    input.source === 'url'
      ? parseSlackMessageUrl(input.url)
      : { channel: rawId(input.channelId), ts: input.messageId };
  await slack.webClient.chat.update({
    channel: target.channel,
    ts: target.ts,
    text: input.message,
  });
  return { success: true, message: `Edited ${target.channel} ${target.ts}.` };
},
```

`src/mastra/tools/slack/utils.ts` (template, current) only has `joinChannel`
and `formatMessage`, 37 lines total. `src/mastra/tools/slack/post-message.ts`
records nothing about what it posts. Both tools are registered at
`src/mastra/tools/slack/index.ts:15-29` into `slackTools`, merged into
`baseTools` at `src/mastra/tools/base.ts:12-23`, which is the orchestrator's
full tool set (no `activeTools` allowlist on `orchestrator.ts`, confirmed by
grep). Nothing in `src/mastra/agents/*.ts` restricts these tools further.

**TODO.md already names this exact gap** at `TODO.md:176-177`: "Restrict
`edit_message` and `delete_message` to messages the bot itself posted.
Already implemented on gorkie `dev`. Low priority for now." A fuller note at
`TODO.md:76-89` (under "Gorkie regression sweep") explains *why* it isn't
here yet: the guards were dropped from the template on purpose, "DEFERRED
(pending code-mode refactor)," with the explicit intent to "re-add the
ownership + scoping model as part of that refactor" rather than restore and
then immediately rework them. This plan is that restoration; `plans/slack-code-mode.md`
already lists this plan as its hard dependency (`slack-code-mode.md:60-62,469-473,540-545`)
and even pre-quotes gorkie's functions, so the two plans agree on the target
shape.

**Gorkie `dev`'s mechanism, read in full and quoted exactly.**

`/workspaces/gorkie/src/mastra/tools/slack/utils.ts:122-148`:

```ts
export async function assertCanManagePostedMessage({
  message,
  ctx,
}: {
  message: { channel: string; ts: string };
  ctx: ChannelContext;
}) {
  if (!ctx.userId) {
    throw new Error(
      'No current Slack user, so Gorkie will not edit or delete messages.'
    );
  }
  const record = postedMessageRecord.safeParse(
    await chat().getState().get(postedMessageKey(message))
  );
  if (!record.success) {
    throw new Error(
      'Gorkie can only edit or delete messages it previously sent through post_message and recorded ownership for.'
    );
  }
  if (rawId(record.data.requestedBy) !== rawId(ctx.userId)) {
    throw new Error(
      'Only the same Slack user who asked Gorkie to send this message can edit or delete it.'
    );
  }
  return { ...message, isSelfDm: record.data.isSelfDm };
}
```

with the supporting pieces, all in the same file
(`/workspaces/gorkie/src/mastra/tools/slack/utils.ts:9-16, 93-120`):

```ts
const postedMessageRecord = z.object({
  requestedBy: z.string().min(1),
  isSelfDm: z.boolean().default(false),
});

function postedMessageKey({ channel, ts }: { channel: string; ts: string }) {
  return `slack:posted-message:${rawId(channel)}:${ts}`;
}

export async function recordPostedMessage({
  target, sent, requestedBy, isSelfDm,
}: {
  target: Target;
  sent: { id: string; threadId?: string };
  requestedBy: string | undefined;
  isSelfDm: boolean;
}) {
  if (!requestedBy) return;
  let channel = target.id;
  if (target.type === 'thread') channel = slack.channelIdFromThreadId(target.id);
  if (sent.threadId) channel = slack.channelIdFromThreadId(sent.threadId);
  await chat().getState().set(postedMessageKey({ channel, ts: sent.id }), {
    requestedBy: rawId(requestedBy),
    isSelfDm,
  });
}
```

`recordPostedMessage` is called once, from the success path of
`/workspaces/gorkie/src/mastra/tools/slack/post-message.ts:35-40`, and
`assertCanManagePostedMessage` is called once each from
`/workspaces/gorkie/src/mastra/tools/slack/edit-message.ts:33-36` and
`/workspaces/gorkie/src/mastra/tools/slack/delete-message.ts:26-29`, both
before touching `slack.webClient`. Registration is unchanged:
`edit_message`/`delete_message` stay ordinary top-level tools at
`/workspaces/gorkie/src/mastra/tools/slack/index.ts:36-37`.

**Important correction to the framing "check the author against the bot's
own id":** gorkie's mechanism does **not** compare anything to the bot's own
Slack user id. It never calls `conversations.history` or inspects
`message.user`/`message.bot_id`. "Bot itself posted" is guaranteed
*by construction*: the KV key `slack:posted-message:{channel}:{ts}` is only
ever written by `recordPostedMessage`, and that function is only ever called
from `post_message`'s own success path. If no record exists, gorkie assumes
the bot didn't post it (or doesn't know), and refuses. The `requestedBy`
match on top of that is a *second*, independent restriction: even for a
message gorkie definitely sent, only the Slack user who originally asked for
it may edit or delete it. Both checks matter and answer different questions;
TODO.md's own description ("bot-recorded messages, for the original
requester," `TODO.md:79-80`) already captures this as two clauses, not one.

**Slack's own API enforces a *related* but weaker guarantee for free.**
Verified against the live Slack docs (`docs.slack.dev/reference/methods/chat.update`,
`chat.delete`): `chat.update` "requires the calling bot/app to be the
original message author... `cant_update_message`" if not, and `chat.delete`
"with a bot token, this method may delete only messages posted by that
bot... `cant_delete_message`" otherwise. So even with zero app-level checks,
Slack already rejects edits/deletes of messages posted by a human or a
different app. What Slack's own enforcement does **not** cover is the
cross-user case inside this repo's *own* bot: nothing stops Slack user B from
asking the agent to edit or delete a message the same bot posted for user A
five minutes earlier in the same channel, since from Slack's point of view
it's still "this app's own message." That cross-user gap is exactly what
`assertCanManagePostedMessage`'s `requestedBy` check exists to close, and is
the part no amount of Slack-side scoping can substitute for.

**Mastra's `ChannelContext` already resolves the bot's own identity at
runtime**, so nothing here needs a hardcoded id. Verified in
`node_modules/@mastra/core/dist/channels/types.d.ts:659-680`:

```ts
export type ChannelContext = {
  platform: string;
  eventType: string;
  isDM?: boolean;
  threadId?: string;
  channelId?: string;
  messageId?: string;
  userId: string;
  userName?: string;
  /** The bot's own user ID on this platform. */
  botUserId?: string;
  /** The bot's display name on this platform. */
  botUserName?: string;
  /** The bot's mention string (e.g. '<@U123>' on Slack/Discord). */
  botMention?: string;
};
```

and populated at `node_modules/@mastra/core/dist/chunk-JGDMZZAO.js:11725-11738`:

```js
const botUserId = adapter.botUserId;
const botMention = botUserId ? chatThread.mentionUser(botUserId) : void 0;
// ...
botUserId,
```

`adapter.botUserId` is a live getter on `@chat-adapter/slack`'s `SlackAdapter`
(`node_modules/@chat-adapter/slack/dist/index.d.ts:527`: `get botUserId():
string | undefined`), backed by a protected `_botUserId` populated from
Slack's own auth handshake at connect time, not a config constant. This is
the correct contrast to gorkie's actual anti-pattern, found by grepping
gorkie's tree for hardcoded ids: `/workspaces/gorkie/src/mastra/prompts/slack.ts:6`
hardcodes three literal Slack user ids ("These Slack user ids are ALL you
(gorkie): `U0A9GM4P9UN` (prod), `U0A3EM9JV0T` and `U0AGF1M6DKN` (dev)") for
an unrelated self-mention-recognition feature. That is precisely the kind of
gorkie-specific, non-portable identity `TODO.md:12-20`'s Process section
says to strip on every port. This template's own `src/mastra/prompts/slack.ts`
already has no such block (confirmed by reading it in full), so there is
nothing to strip *for this feature specifically*, but the principle is the
one to hold to when writing new code here: any bot self-reference goes
through `ctx.botUserId` / `ctx.botMention` / `ctx.botUserName`, resolved via
`channelContext(context?.requestContext)`
(`src/mastra/lib/context.ts:4-11`, already identical in shape to gorkie's own
`lib/context.ts`), never a literal.

**The Chat SDK also exposes a second, adapter-native authorship signal that
gorkie's Slack-only code never uses**, worth naming because it is exactly the
mechanism the "resolve at runtime, don't hardcode" principle points at, and
because it is cross-platform rather than Slack-only. `Message.author.isMe:
boolean`, documented as "Whether this message was sent by this bot/runtime"
(`node_modules/chat/dist/chat-Dm1vQU3i.d.ts:1462`), is computed by each
adapter using its own `botUserId`/`botId`, e.g. `SlackAdapter`'s
`protected isMessageFromSelf(event: SlackEvent): boolean`
(`node_modules/@chat-adapter/slack/dist/index.d.ts:946-949`, comment: "check
both because `_botUserId` is the user ID... matches `event.user`... `_botId`
is the bot ID... matches `event.bot_id`"). `SlackAdapter` also implements
`fetchMessage(threadId, messageId): Promise<Message | null>`
(`@chat-adapter/slack/dist/index.d.ts:890`, the concrete implementation of
the optional `Adapter.fetchMessage?` interface at `chat-Dm1vQU3i.d.ts:583`).
Chained together, `adapter.fetchMessage(...)` then `.author.isMe` is a live,
state-independent way to ask Slack "did *I* send this," using the exact same
`botUserId` the brief points at, without this repo ever touching it directly
or writing a comparison by hand. See Design for how this plugs in as a
defense-in-depth layer, not a replacement for the state-tracked check.

**No `plans/send-as-user.md` exists yet** (confirmed: absent from `plans/`,
though listed in `plans/README.md:19` and referenced by
`plans/slack-code-mode.md:56-62` as a planned sibling). It matters here
because "send-as-user" would change what "the bot posted it" even means: if
a future tool posts through a real user's own Slack token (impersonation)
rather than the bot token, Slack's own authorship (and thus `chat.update`/
`chat.delete`'s enforcement, and `author.isMe`) would attach to that *user*,
not the bot, and `recordPostedMessage` would need an explicit `postedAs:
'bot' | 'user'` field so `assertCanManagePostedMessage` doesn't claim
ownership of a message the bot token can no longer act on. This plan does
not need to solve that now (send-as-user doesn't exist yet), but the record
shape below leaves room for it (see Risks).

## Design

### Chosen approach: port gorkie's state-tracked ownership, add adapter-native authorship as a cheap pre-check

Two layers, both required for v1:

1. **Primary (ported, required): `requestedBy` scoping via `chat().getState()`.**
   This is the only mechanism that can express "same requester," which
   nothing Slack-side or adapter-side can substitute for. Port
   `assertCanManagePostedMessage` and `recordPostedMessage` into this
   template's `src/mastra/tools/slack/utils.ts` near-verbatim, generalized
   only by:
   - Dropping gorkie's name from every error string ("Gorkie can only...").
     This template's existing tool descriptions already avoid naming the bot
     (`edit-message.ts:10`: "Slack only permits the bot to edit messages it
     owns," no proper name), so the fix here is just not reintroducing
     gorkie's phrasing, not stripping an existing one.
   - Dropping the `isSelfDm` field from the record. It exists in gorkie only
     to feed `withAttribution`'s footer-skip logic
     (`/workspaces/gorkie/src/mastra/chat/attribution.ts`), and this
     template has no `chat/attribution.ts` and no message-footer feature at
     all (confirmed absent by `find`). Carrying an unused field would violate
     CODING_STANDARDS.md's "never fabricate data... that's a signal the type
     is wrong." If a future plan adds attribution footers, it can add the
     field back then, next to that feature, not speculatively now.
   - Everything else (the Zod-validated record shape, the key format, the
     "no record → refuse" and "wrong requester → refuse" branches) ports
     unchanged; there is nothing gorkie-specific left in it once the name and
     `isSelfDm` are gone.

2. **Secondary (new, cheap hardening): adapter-native `author.isMe` pre-check.**
   Before even looking at `chat().getState()`, resolve the target message
   through the Chat SDK (`chat().getAdapter?.() ?? slack` — see Risks for the
   exact call this repo can make today) and check `message.author.isMe`. If
   it's `false` (a human posted it, or a different app), fail immediately
   with a clear, specific error ("that message wasn't sent by this bot") —
   never surface Slack's raw `cant_update_message`/`cant_delete_message`, and
   never fall through to the more generic "no ownership record" error, which
   would otherwise look identical whether the message is a stranger's post or
   a legitimate bot message whose record was lost. This also covers restart
   / migration edge cases the KV-only approach can't: a message the bot sent
   *before* this feature shipped, or before a Postgres wipe, has no KV
   record but is still genuinely the bot's own message; `isMe` catches that
   correctly where a KV-only check would wrongly refuse it.

   This layer is genuinely new (gorkie's Slack-only code never calls
   `fetchMessage`/checks `isMe`) and is the part that needs a short spike
   before being trusted, same caution `plans/slack-code-mode.md:441-446`
   applies to its own new transport: confirm `SlackAdapter.fetchMessage`
   resolves correctly for a `threadId` built from an arbitrary `{channel,
   ts}` pair (not necessarily "the current thread"), since `encodeThreadId`
   in this adapter is keyed off `{channel, threadTs}` and a top-level
   (non-threaded) message uses its own `ts` as `threadTs`
   (`src/mastra/chat/adapter.ts:37-40` already relies on exactly this
   convention for a different feature, so the shape is proven, just not yet
   exercised through `fetchMessage`).

Both layers live in the same function so callers can't accidentally use one
without the other:

```ts
// src/mastra/tools/slack/utils.ts (sketch, generalized from gorkie)
const postedMessageRecord = z.object({
  requestedBy: z.string().min(1),
});

function postedMessageKey({ channel, ts }: { channel: string; ts: string }) {
  return `slack:posted-message:${rawId(channel)}:${ts}`;
}

export async function recordPostedMessage({
  target,
  sent,
  requestedBy,
}: {
  target: Target;
  sent: { id: string; threadId?: string };
  requestedBy: string | undefined;
}) {
  if (!requestedBy) {
    return;
  }
  let channel = target.id;
  if (target.type === 'thread') {
    channel = slack.channelIdFromThreadId(target.id);
  }
  if (sent.threadId) {
    channel = slack.channelIdFromThreadId(sent.threadId);
  }
  await chat().getState().set(postedMessageKey({ channel, ts: sent.id }), {
    requestedBy: rawId(requestedBy),
  });
}

export async function assertCanManagePostedMessage({
  message,
  ctx,
}: {
  message: { channel: string; ts: string };
  ctx: ChannelContext;
}) {
  if (!ctx.userId) {
    throw new Error('No current Slack user, so this cannot be scoped.');
  }
  const threadId = chatThreadId(`${message.channel}:${message.ts}`);
  const fetched = await slack.fetchMessage(threadId, message.ts);
  if (!fetched?.author.isMe) {
    throw new Error(
      "That message wasn't sent by this bot, so it can't be edited or deleted."
    );
  }
  const record = postedMessageRecord.safeParse(
    await chat().getState().get(postedMessageKey(message))
  );
  if (!record.success) {
    throw new Error(
      'This bot only edits or deletes messages it sent through post_message, and only if it still has an ownership record for them.'
    );
  }
  if (rawId(record.data.requestedBy) !== rawId(ctx.userId)) {
    throw new Error(
      'Only the Slack user who originally asked for this message to be sent can edit or delete it.'
    );
  }
  return message;
}
```

The one place `ctx.botUserId`/`ctx.botMention` genuinely earns a spot here is
error phrasing, not the ownership logic itself (`isMe` already encapsulates
the id comparison inside the adapter, so this code never needs to compare
against `ctx.botUserId` by hand). Keep the sketch above deliberately generic;
if a future iteration wants a friendlier error, it composes with
`ctx.botMention` (e.g. "I (${ctx.botMention}) didn't send that message"),
still resolved from context, never a literal.

### Where it lives, and why that answers `slack-code-mode.md`'s open question

`plans/slack-code-mode.md:469-473` (step 7) left this open: "land ... inside
`edit-message.ts`/`delete-message.ts` (or a shared `slack-code/ownership.ts`
if that plan says otherwise)." This plan's answer: **`src/mastra/tools/slack/utils.ts`**,
not a new file under a not-yet-existing `slack-code/` directory. Reasons:
- It's exactly where gorkie already put it, and where this template's
  `joinChannel`/`formatMessage` already live, so it's the single obvious
  "Slack tool internals" module, matching CODING_STANDARDS.md's guidance to
  put a shared or exported shape in "the nearest clear owner."
  `plans/slack-code-mode.md` doesn't move or rename `edit-message.ts`/
  `delete-message.ts` (only re-exports the same tool objects into its
  allow-list map, `slack-code-mode.md:311-333`), so `utils.ts` stays their
  neighbor either way, before or after that refactor lands.
- It keeps the assertion inside the tool's own `execute`, so whether
  `edit_message` is called as a standalone top-level tool (today) or as
  `external_edit_message` dispatched from inside `createCodeMode`'s host-side
  `execute` (after `slack-code-mode.md` lands), the check runs identically.
  Per that plan's own read of the code-mode dispatch closure
  (`slack-code-mode.md:135-164`), `tool2.execute(...)` — the real tool, this
  one — always runs on the host inside the same process, never inside the
  generated sandbox code. So an assertion inside `execute` is automatically
  "inside the host-side `external_*` implementation," satisfying this plan's
  own cross-cutting requirement from the brief without any code-mode-specific
  wiring. There is nothing to change in this file when code-mode ships.

### Ergonomics: one call each, impossible to silently skip

`edit_message`/`delete_message`'s `execute` gets exactly one new line each,
first thing in the function body, before any Slack API call:

```ts
// src/mastra/tools/slack/edit-message.ts (sketch)
execute: async (input, context) => {
  const ctx = channelContext(context?.requestContext);
  const message =
    input.source === 'url'
      ? parseSlackMessageUrl(input.url)
      : { channel: rawId(input.channelId), ts: input.messageId };
  await assertCanManagePostedMessage({ message, ctx });
  await slack.webClient.chat.update({
    channel: message.channel,
    ts: message.ts,
    text: input.message,
  });
  return { success: true, message: `Edited ${message.channel} ${message.ts}.` };
},
```

A template user who genuinely wants the old, unscoped behavior (rare; this is
a safety guardrail, not a preference) deletes that one `await
assertCanManagePostedMessage(...)` line from each of the two files. There is
deliberately **no env var or config flag** to disable this at runtime:
CODING_STANDARDS.md's "don't add defensive checks for states that can't
occur" cuts the other way for a guardrail like this — a togglable-by-mistake
safety check is worse than one that requires an actual code edit to remove,
and this repo already treats other authorization guards
(`assertCanPostTo`/`assertReadableChannel` in gorkie, same file) the same
way: code, not config.

### Alternatives considered

- **Only the `isMe` check, no state tracking.** Rejected: `isMe` answers "did
  the bot send this," not "who asked for it," so it cannot express the
  cross-user restriction TODO.md explicitly wants (`TODO.md:79-80`, "for the
  original requester"). Any Slack user could still hijack another user's
  bot-sent message.
- **Only the state-tracked check, no `isMe` (i.e., a literal gorkie port with
  nothing added).** Considered strongly, since it's simpler and matches
  gorkie exactly. Rejected as the *sole* mechanism because it degrades badly
  on missing records (restart before this feature existed, a manually
  truncated `chat_state_cache` row, a second bot instance sharing the
  workspace) by producing the same generic "no ownership record" error
  whether the message is a stranger's or a lost record of the bot's own
  message, which is confusing and, worse, means a legitimate admin action
  ("delete that thing I asked you to post two months ago before I redeployed
  Postgres") fails with no path forward. Adding `isMe` costs one adapter call
  and turns that into "yes it's mine, but the record link to which user asked
  is gone" versus "it was never mine," a real, actionable distinction.
- **Fetch message via `slack.webClient.conversations.history`/`replies`
  directly (bypassing the Chat SDK adapter).** This is closer to what a
  literal gorkie-style port would do if it wanted an authorship check at all
  (gorkie's `utils.ts` already imports `slack.webClient` freely). Rejected in
  favor of `adapter.fetchMessage()` + `.author.isMe` because it's already
  cross-platform-shaped (an `Adapter` interface method every Chat SDK adapter
  can implement, not a Slack-only Web API call), which directly serves
  `TODO.md:57-60`'s "Cross-platform tools... route through the adapter/Chat
  SDK generic surface instead of `slack.webClient` where possible" and
  `plans/multi-platform.md:359-373`'s already-planned generalization of these
  same two tools. Using the adapter method now means less rework later, not
  more.

## Implementation steps

1. **`src/mastra/tools/slack/utils.ts`**: add `postedMessageRecord` (Zod),
   `postedMessageKey`, `recordPostedMessage`, `assertCanManagePostedMessage`
   as sketched above (generalized: no `isSelfDm`, no gorkie wording). Import
   `chat` from `../../chat/instance`, `chatThreadId`/`rawId` from
   `../../lib/ids` (already present, identical to gorkie's), `ChannelContext`
   from `../../types`, `Target` from `../../chat/target`.
2. **Spike `slack.fetchMessage(threadId, messageId)`** against a real
   channel/ts pair (both a top-level message and a threaded reply) before
   wiring it into step 1's `assertCanManagePostedMessage`, per the caution in
   Design. If it doesn't resolve top-level messages the way
   `chat/adapter.ts:37-40`'s `encodeThreadId` convention suggests, fall back
   to `slack.webClient.conversations.history({ channel, latest: ts, oldest:
   ts, inclusive: true, limit: 1 })` (already covered by this template's
   existing `channels:history`/`groups:history`/`im:history`/`mpim:history`
   scopes, `slack-manifest.json`, no new scope needed either way) and check
   `messages[0]?.bot_id` against... nothing hardcoded is available there
   either, so prefer resolving it via `ctx.botUserId`/comparing `user` field
   against `ctx.botUserId` if `fetchMessage` genuinely doesn't work. Record
   whichever path was used in a short comment (the "why," not a rename).
3. **`src/mastra/tools/slack/post-message.ts`**: call
   `recordPostedMessage({ target, sent, requestedBy: ctx.userId })` on the
   success path, after `destination.post(...)` resolves, using
   `channelContext(context?.requestContext)` for `ctx` (the tool doesn't
   currently take `context` as a second `execute` param; add it, mirroring
   `edit-message.ts`'s existing signature).
4. **`src/mastra/tools/slack/edit-message.ts`**: add `context` to `execute`,
   resolve `ctx`, call `await assertCanManagePostedMessage({ message, ctx })`
   before `slack.webClient.chat.update(...)`.
5. **`src/mastra/tools/slack/delete-message.ts`**: same as step 4, before
   `slack.webClient.chat.delete(...)`.
6. **Tool descriptions**: update `edit-message.ts:9-10` and
   `delete-message.ts:9-10`'s `description` strings, and
   `src/mastra/prompts/tools.ts:78-81`'s `<tool>` note for `edit_message /
   delete_message`, so the model knows *why* a call might fail (it can only
   touch messages it sent via `post_message`, for the same requester), not
   just that Slack enforces ownership. This avoids the model retrying the
   same call after a scoping error, thinking it's a transient Slack failure.
7. **Validation**: `bun run typecheck`, `bun run check`,
   `bun run check:spelling` per CLAUDE.md's Validation section. Ask the user
   to exercise this in their own running bot: post a message, ask a
   *different* Slack user to try editing it (expect refusal), then edit it as
   the original requester (expect success). This repo's own rule (CLAUDE.md,
   "never start/restart/kill `mastra dev`") means this step is a request to
   the user, not something to run standalone.
8. **`TODO.md`**: move `TODO.md:176-177` from the backlog list into "Recently
   completed" once shipped, and remove the now-resolved half of
   `TODO.md:76-83`'s deferred note (the ownership-scoping half; the
   guardrails/prompt-level-safety half of that note is unrelated and stays
   deferred).

## Data / schema / config changes

- **No new env vars.** Reuses `SLACK_BOT_TOKEN` (`src/env.ts:11`, already
  wired into `slack.webClient` at `src/mastra/chat/client.ts:5-10`).
- **No new Slack manifest scopes.** `chat:write` (already present,
  `slack-manifest.json:31`) covers both `chat.update`/`chat.delete` per
  Slack's own docs (verified live). If step 2's spike falls back to
  `conversations.history`, that's also already covered
  (`channels:history`/`groups:history`/`im:history`/`mpim:history`, all
  present in the current manifest).
- **No new Postgres schema/migration.** Reuses the existing
  `chat().getState().set/get(key, value, ttlMs?)` primitive
  (`@chat-adapter/state-pg`, `node_modules/@chat-adapter/state-pg/dist/index.js:163-176`),
  backed by the `chat_state_cache` table this template already has running
  (used today for the App Home welcome flag and the scheduled-task recipient
  stash per `TODO.md:127-129` and `src/mastra/chat/adapter.ts:14-20`). Passing
  no `ttlMs` (matching gorkie exactly) stores `expires_at = NULL`, i.e. the
  record persists indefinitely until explicitly deleted, which directly
  answers the "message posted before a restart" failure mode: the record
  survives restarts because it's a Postgres row, not in-memory state.
- **No new dependency.**

## Risks & open questions

- **Message posted before this feature shipped, or before a state wipe.**
  No KV record exists. With only the state-tracked check, this fails closed
  with a generic error; with the `isMe` layer, the tool at least confirms
  "yes, mine" and can say so, though it still correctly refuses to guess
  *who* asked for it (no record = no requester to check against = refuse).
  This is intentional: there is no safe way to reconstruct `requestedBy`
  after the fact, so refusing is correct, just made clearer by `isMe`.
- **A second bot instance (e.g., staging) sharing the same Slack app and bot
  token, but a different Postgres database.** `isMe` still says "mine" (same
  `botUserId`, since it's the same Slack app), but the KV lookup misses
  (different DB), so the tool still correctly refuses on the "no ownership
  record" branch. This is arguably too strict for a legitimate same-app,
  different-deployment case, but the alternative (trusting `isMe` alone) drops
  the requester restriction entirely, which is the one thing gorkie's
  `dev` branch treats as non-negotiable. Flagging as an accepted trade-off,
  not a bug, unless the maintainer decides otherwise.
- **`slack.fetchMessage`'s behavior on an arbitrary `{channel, ts}` pulled
  from a pasted URL, not "the current thread."** Called out in Design/step 2
  as needing a spike; this is the one genuinely unverified piece of this
  plan (mirrors how `plans/slack-code-mode.md` flagged its own new transport
  code the same way before trusting it).
- **`send-as-user` (no plan file yet, see Current state) will need to extend
  `postedMessageRecord`** with something like `postedAs: 'bot' | 'user'` once
  it exists, since a user-token-posted message's Slack-level authorship
  belongs to that user, not the bot, and `isMe`/`chat.update`/`chat.delete`
  will all behave differently for it. Out of scope here; flagging so
  whoever writes `plans/send-as-user.md` knows this record shape needs a
  field, not a redesign.
- **Multi-platform generalization** (`plans/multi-platform.md:359-373`) will
  later change `edit_message`/`delete_message`'s input schema from a
  Slack-URL shape to the generic `target: targetSchema` + `messageId` shape,
  and route through `chat().getAdapter(ctx.platform)` instead of the `slack`
  singleton. This plan's `assertCanManagePostedMessage` takes a plain
  `{channel, ts}` message identity and a `ctx`, which survives that
  refactor unchanged in shape; only the two tool files' *callers* of it
  change, not the assertion itself. No action needed now, just noting the
  seam lines up.
- **Should `assertCanManagePostedMessage` also run for `post_message` edits
  made through a future `SentMessage.edit()`/`.delete()` call** (the Chat
  SDK's own returned-object methods, `node_modules/chat/dist/chat-Dm1vQU3i.d.ts:1491-1500`,
  usable only within the same tool call that produced the `SentMessage`)?
  No: those calls happen within the same `post_message` invocation, for the
  same requester, in the same turn, so there is no cross-user surface to
  guard. Only the standalone `edit_message`/`delete_message` tools (called in
  a *different* turn, possibly by a *different* user) need the guard. Noting
  this explicitly so a future refactor doesn't assume the guard belongs on
  `SentMessage` itself.

## Effort & priority

**S/M.** One new/expanded file (`tools/slack/utils.ts`, +~60 lines over
gorkie's already-small original), two 1-line call-site additions
(`edit-message.ts`, `delete-message.ts`), one small addition to
`post-message.ts`, no schema/env/dependency changes. The only real unknown is
the `fetchMessage` spike (step 2), which is small in scope even if it needs
the `conversations.history` fallback. Priority: matches `TODO.md:176-177`'s
own framing ("low priority") but is a hard, blocking dependency for
`plans/slack-code-mode.md` (`slack-code-mode.md:540-545` calls it a "hard
dependency, not a nice-to-have" for that plan specifically), so it should
land before that one, even if neither is urgent on its own.
