# Multi-platform support: Discord and Telegram

## Summary

Register `@chat-adapter/discord` and `@chat-adapter/telegram` alongside the
existing `@chat-adapter/slack` entry in `orchestrator`'s `channels.adapters`
map, so the same Mastra `Agent` answers mentions and DMs on all three
platforms with one memory, one tool set, and one set of traces. This
delivers the template's "plug-and-play channel" promise: a user who wants
Discord support adds one adapter object and two env vars, nothing else.
Both adapters are official, already published, and Mastra's `AgentChannels`
already treats `adapters` as `Record<string, Adapter>` with per-platform
config, so this is additive wiring plus a cleanup pass on the handful of
places that currently assume Slack is the only platform.

## Current state

### This repo (Slack-only today)

- `src/mastra/chat/client.ts:5-10` constructs one adapter, `slack`, from
  `SlackAgentAdapter` (`src/mastra/chat/adapter.ts:10`), and every other chat
  module imports that singleton directly.
- `src/mastra/agents/orchestrator.ts:80-96` is the single registration point:
  ```ts
  channels: {
    state: createPostgresState({ url: env.DATABASE_URL }),
    chatOptions: { fallbackStreamingPlaceholderText: 'working...' },
    adapters: {
      slack: { adapter: slack, streaming: true, toolDisplay, formatError: (e) => `...` },
    },
    threadContext: { maxMessages: 10 },
    handlers: { onMention, onSubscribedMessage, onDirectMessage },
  },
  ```
  `adapters` is already `Record<string, ChannelAdapterConfig | Adapter<any, any>>`
  per `node_modules/@mastra/core/dist/channels/types.d.ts:315-317`, and
  `handlers` (`src/mastra/chat/handlers.ts`) are platform-agnostic Chat SDK
  callbacks `(thread: Thread, message: Message, defaultHandler) => Promise<void>`
  shared across every adapter registered here — there is no per-adapter
  handler wiring to duplicate.
- `src/mastra/index.ts:52-63` calls `orchestrator.getChannels()?.initialize(mastra)`
  once; `AgentChannels.initialize` (`node_modules/@mastra/core/dist/channels/agent-channels.d.ts:116-119`)
  starts every registered adapter, including the Gateway reconnection loop
  for adapters that need one (`private startGatewayLoop`, line 274: "Persistent
  reconnection loop for Gateway-based adapters (e.g. Discord)"). No new
  bootstrap code is needed for Discord's Gateway or Telegram's polling loop.
- `env.ts` (`src/env.ts:1-28`) validates only `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN`
  via `@t3-oss/env-core`; nothing reads `process.env` outside this file
  per `.claude/CLAUDE.md`.

### Slack-only couplings found (cited, not assumed)

1. **`src/mastra/lib/ids.ts:1-11`** — `rawId`, `chatChannelId`, `chatThreadId`
   hardcode the `slack:` prefix (`id.replace(/^slack:/, '')`,
   `` `slack:${rawId(id)}` ``). Every tool that calls these
   (`get_channel_info`, `read_conversation_history`, `list_threads`,
   `summarize_thread`) would silently mangle a `discord:...` or
   `telegram:...` id today. This is the single highest-leverage fix: most
   tools become cross-platform for free once this stops assuming Slack.

2. **`src/mastra/chat/handlers.ts:69`** — `onMention` calls
   `slack.decodeThreadId(message.threadId).threadTs === message.id` to
   detect whether a mention is at the thread root. `decodeThreadId` is a
   `SlackAdapter`-only method (`node_modules/@chat-adapter/slack/dist/index.d.ts:906`),
   not part of the base `Adapter` interface, so this line throws or
   misbehaves the instant a Discord/Telegram message reaches `onMention`.

3. **`src/mastra/chat/message.ts:1-13`** — `rawText()` parses `message.raw`
   looking for a Slack-shaped `{ text: string }` payload to recover the
   *raw* mention token syntax (`<@U123|label>`) that
   `withoutLeadingMentions` (`message.ts:11-13`) strips before command
   detection (`##`-ignore, `!stop`). `message.text` (the Chat SDK's
   platform-normalized field, "Plain text content, all formatting
   stripped" — `node_modules/chat/dist/chat-Dm1vQU3i.d.ts:2399-2400`) has
   already converted mentions to display form by the time it reaches
   `rawText`'s fallback, so leading-mention stripping degrades (not
   crashes) on Discord/Telegram: a leading `@BotName` won't be stripped
   before the `##`/`!command` check runs.

4. **`src/mastra/chat/adapter.ts` (`SlackAgentAdapter`)** — the recipient-stash
   override (`stream()`, lines 54-85) and `resolveInlineMentions` (lines
   87-126) exist to work around a Slack Assistant-API quirk (scheduled runs
   need `recipientUserId`/`recipientTeamId` outside DMs). This is legitimately
   Slack-only machinery; Discord/Telegram don't need an equivalent subclass.

5. **Tools that call `slack.webClient` directly** (from
   `src/mastra/tools/base.ts:1-16`'s `slackTools` and `canvasTools`):
   - No cross-platform analog, keep Slack-only:
     `tools/canvas/{create,read,update}.ts` (`slack.webClient.conversations.canvases.create`,
     `.canvases.edit`, `.files.info` — Slack Canvas has no Discord/Telegram
     equivalent), `tools/slack/search-slack.ts:101` (`assistant.search.context`,
     a Slack Assistant API), `tools/slack/get-slack-file.ts:71` (`files.info`),
     `tools/slack/leave-channel.ts:44` (`conversations.leave`).
   - Already cross-platform, just blocked by `lib/ids.ts`'s `slack:` prefix:
     `tools/slack/post-message.ts` and `tools/slack/upload-file.ts` route
     through `chat/target.ts`'s `resolveTarget()` → `chat().thread()` /
     `.channel()` / `.openDM()` → `destination.post()`, which is the fully
     generic Chat SDK surface (`node_modules/chat/dist/chat-Dm1vQU3i.d.ts:1497`
     `edit(...)`, and `Postable.post`). `tools/slack/get-channel-info.ts:23`
     already calls the generic `chat().channel(...).fetchMetadata()`.
     `tools/slack/leave-thread.ts` already calls only generic `Thread`
     methods (`chat().thread(threadId).setState(...)`, `.unsubscribe()`).
     `tools/slack/get-user.ts` → `chat/names.ts:resolveUserProfile` already
     calls the generic `chat().getUser(userId)`
     (`node_modules/chat/dist/chat-Dm1vQU3i.d.ts:637`) for the base lookup,
     and layers Slack-only profile enrichment (pronouns, timezone, custom
     fields via `slack.webClient.users.profile.get`) on top.
   - Portable with a moderate rewrite: `tools/slack/read-conversation-history.ts`,
     `tools/slack/list-threads.ts`, `tools/slack/summarize-thread.ts` call
     instance methods directly on the concrete `slack` singleton
     (`slack.fetchMessages`, `slack.fetchChannelMessages`, `slack.listThreads`,
     `slack.channelIdFromThreadId`) instead of resolving the adapter for the
     message's actual platform. These methods are declared on the base
     `Adapter` interface itself
     (`node_modules/chat/dist/chat-Dm1vQU3i.d.ts:545,574,616,652`, `editMessage`
     at 553, `deleteMessage` at 549) — some optional, with per-platform
     support noted in the feature matrix below — so swapping
     `slack.<method>` for `chat().getAdapter(platform).<method>()`
     (`getAdapter<K>` at `chat-Dm1vQU3i.d.ts:2922`) makes them work anywhere
     the adapter implements the method. `tools/slack/edit-message.ts` and
     `tools/slack/delete-message.ts` currently take a Slack-message-URL input
     shape (`parseSlackMessageUrl`) baked into the tool schema; the
     underlying operation (`editMessage`/`deleteMessage`) is generic, but the
     *input schema* needs to become target+messageId to be platform-neutral.
   - This whole cluster is TODO.md's open "Cross-platform tools" item
     (`TODO.md`: *"make Slack-only tools work on other platforms where the
     Chat SDK supports it... route through the adapter/Chat SDK generic
     surface instead of `slack.webClient` where possible"*) — this plan is
     that item, done as part of adding the second and third platform so the
     generalization has real adapters to test against.

6. **`src/mastra/types/channel.ts:6`** — `SlackAgentRequestContext` is a
   generic `RequestContext<{ channel?: ChannelContext }>` wrapper with a
   Slack-specific name. `ChannelContext` itself (line 4, re-exported from
   `@mastra/core/channels`) is already platform-agnostic: `platform: string`,
   `isDM?`, `threadId?`, `channelId?`, `userId`, `botUserId?`, etc.
   (`node_modules/@mastra/core/dist/channels/types.d.ts:657-680`).

### Gorkie (`/workspaces/gorkie`, branch `dev`)

Gorkie is **also Slack-only**. `grep -rn "discord\|telegram" /workspaces/gorkie/src/mastra`
returns nothing, `/workspaces/gorkie/node_modules/@chat-adapter/` contains
only `shared`, `slack`, `state-pg`, and gorkie's `channels` config
(`/workspaces/gorkie/src/mastra/agents/gorkie.ts:72-85`) registers a single
`slack` adapter, structurally identical to this repo's. So per the
brief's Process rule, there is nothing to port for the adapter registration
itself — this is new work, not a strip-down of a gorkie feature. The couplings
listed above (items 1-6) are equally present in gorkie's `dev` branch (its
`chat/handlers.ts` has the same `slack.decodeThreadId` call, just wrapped in
extra gorkie-specific onboarding/allow-list logic that this template already
dropped per `TODO.md`'s "Process" section). Fixing them here does not need to
wait on gorkie; if gorkie later adds a second platform, it can pull this
plan's generalization back the normal direction.

### Chat SDK adapter catalog (verified against pinned versions)

`chat/adapters` (`node_modules/chat/dist/adapters/index.d.ts`, loaded via
`node -e "require('chat/adapters')"`) is the authoritative, dependency-free
catalog. Confirmed entries for this task:

```json
{
  "discord": {
    "packageName": "@chat-adapter/discord",
    "factoryExport": "createDiscordAdapter",
    "peerDeps": ["discord-api-types", "discord-interactions", "discord.js"],
    "env": {
      "required": ["DISCORD_BOT_TOKEN (secret)", "DISCORD_PUBLIC_KEY", "DISCORD_APPLICATION_ID"],
      "optional": ["DISCORD_MENTION_ROLE_IDS", "DISCORD_API_URL"]
    }
  },
  "telegram": {
    "packageName": "@chat-adapter/telegram",
    "factoryExport": "createTelegramAdapter",
    "peerDeps": [],
    "env": {
      "required": ["TELEGRAM_BOT_TOKEN (secret)"],
      "optional": ["TELEGRAM_WEBHOOK_SECRET_TOKEN (secret)", "TELEGRAM_BOT_USERNAME", "TELEGRAM_API_BASE_URL"]
    }
  }
}
```

Both are `"group": "official"` (same tier as `@chat-adapter/slack`). npm
registry currently serves `4.33.0` for both
(`npm view @chat-adapter/discord version` / `@chat-adapter/telegram version`),
compatible with this repo's pinned `"chat": "^4.32.0"` /
`"@chat-adapter/slack": "^4.32.0"`. Neither package is present in
`node_modules` yet (`ls node_modules/@chat-adapter` → `shared`, `slack`,
`state-pg` only) — this is a real dependency addition, flagged below for
approval per `.claude/CLAUDE.md`.

Feature parity (from `node_modules/chat/docs/platform-adapters.mdx`'s
`GlobalFeatureMatrix`, official Chat SDK doc, quoted verbatim):

| Feature | Slack | Discord | Telegram |
|---|---|---|---|
| Post message | Yes | Yes | Yes |
| Edit message | Yes | Yes | Yes |
| Delete message | Yes | Yes | Yes |
| File uploads | Yes | Yes | Warn: single file/media |
| Streaming | Native | Warn: Post+Edit | Warn: Rich drafts / Post+Edit |
| Scheduled messages (platform-native) | Native | No | No |
| Reactions (add/remove) | Yes | Yes | Yes |
| Typing indicator | Yes | Yes | Yes |
| DMs | Yes | Yes | Yes |
| Ephemeral messages | Native | No | No |
| Mentions | Yes | Yes | Yes |
| Modals | Yes | No | No |
| Slash commands | Yes | Yes | No |
| User lookup (`getUser`) | Yes | Yes | Warn: seen users only |
| Native client (`.webClient`/equivalent) | Yes | No | No |
| Fetch channel messages | Yes | Yes | Warn: cached |
| List threads | Yes | Yes | No |

Deployment mode, verified from each adapter's published README
(`npm view @chat-adapter/discord readme` / `@chat-adapter/telegram readme`):

- **Discord**: two independent transports — HTTP Interactions (buttons,
  slash commands, works serverless) and Gateway WebSocket (regular messages
  and reactions, requires a persistent connection). This repo is a
  long-running Bun process, so Discord runs the same way Slack Socket Mode
  does: register the adapter with `gateway: true` (the default per
  `ChannelAdapterBaseConfig.gateway`, `node_modules/@mastra/core/dist/channels/types.d.ts:19-25`)
  and `AgentChannels` owns the reconnect loop. No Interactions Endpoint URL,
  no public HTTP server needed for a Socket-Mode-shaped deployment.
- **Telegram**: `mode: "auto"` (the adapter's default) picks webhook on
  serverless platforms and long-polling (`getUpdates`) everywhere else,
  including local dev and long-running processes — again, no public URL
  required, matching this repo's no-inbound-webhook posture. Requires
  `void bot.initialize()` to actually start polling in a long-running
  process, which `AgentChannels.initialize()` already does.

## Design

### Registration surface: one map, one line per platform

The template's ergonomic goal is already met by Mastra's `channels.adapters`
shape — it is *already* `Record<string, Adapter | ChannelAdapterConfig>`.
Adding a platform is: construct the adapter once in `chat/client.ts`
(mirroring the existing `slack` export), add one key to the `adapters` map
in `orchestrator.ts`, add its env vars to `src/env.ts` as `.optional()`.
Nothing else in the wiring changes: `handlers` (`onMention`,
`onSubscribedMessage`, `onDirectMessage`) already fire for every registered
adapter, `toolDisplay` and `threadContext` already apply per-adapter with
sane per-adapter fallback (the streaming-only `toolDisplay` modes
`'timeline'`/`'grouped'` auto-fall back to `'cards'`/static rendering with a
one-time warning per platform, per `agent-channels.d.ts:276-289`'s
`resolveToolDisplay` doc comment — Discord/Telegram render the same
`taskUpdate`-shaped tool cards, just via post+edit instead of a live
`StreamingPlan`).

This is the one deliberate design decision worth naming: **do not build a
custom adapter registry, a config-driven platform list, or a factory
function that decides which adapters to construct from env presence.** That
would add a layer between the template author and the one map Mastra already
gives them, exactly the "billion statements" sprawl `.claude/CLAUDE.md` warns
against. Instead:

```ts
// src/mastra/agents/orchestrator.ts — the only registration point
channels: {
  state: createPostgresState({ url: env.DATABASE_URL }),
  chatOptions: { fallbackStreamingPlaceholderText: 'working...' },
  adapters: {
    slack: { adapter: slack, streaming: true, toolDisplay, formatError: slackError },
    ...(discord && { discord: { adapter: discord, streaming: true, toolDisplay, formatError: discordError } }),
    ...(telegram && { telegram: { adapter: telegram, streaming: true, toolDisplay, formatError: telegramError } }),
  },
  threadContext: { maxMessages: 10 },
  handlers: { onMention, onSubscribedMessage, onDirectMessage },
},
```

Opt-in is a plain `undefined` check on the exported adapter (see
`chat/client.ts` below), not a feature flag or a separate config file — a
template user who never sets `DISCORD_BOT_TOKEN` gets `discord === undefined`,
the spread contributes nothing, and the object shape collapses back to
today's Slack-only map. `bun run typecheck` still needs the branches typed;
`discord`/`telegram` are typed as `DiscordAdapter | undefined` so the spread
is a real `false`/object union, not an `as` cast.

### Env vars: optional, adapter auto-detects them

`@chat-adapter/discord`/`@chat-adapter/telegram` both auto-read their
canonical env var names when constructed with no args (`createDiscordAdapter()`,
`createTelegramAdapter()` — confirmed in both READMEs). So `chat/client.ts`
doesn't need to thread values through by hand; it only needs to know
*whether* to construct the adapter at all, which requires the vars to be
`.optional()` in `src/env.ts` (never `process.env` read outside it, per
`.claude/CLAUDE.md`) and a presence check before construction:

```ts
// src/mastra/chat/client.ts (sketch)
export const discord = env.DISCORD_BOT_TOKEN
  ? new DiscordAgentAdapter({ logger: chatLogger }) // auto-reads DISCORD_* from env
  : undefined;

export const telegram = env.TELEGRAM_BOT_TOKEN
  ? new TelegramAgentAdapter({ mode: 'auto', logger: chatLogger }) // auto-reads TELEGRAM_* from env
  : undefined;
```

Only `DISCORD_BOT_TOKEN` and `TELEGRAM_BOT_TOKEN` gate construction —
`DISCORD_PUBLIC_KEY`/`DISCORD_APPLICATION_ID` are required by Discord's own
constructor once `DISCORD_BOT_TOKEN` is set (fail loudly there, not silently
skip), matching the pattern where `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN` are
both plain non-optional `z.string().min(1)` today. Consider whether
`DiscordAgentAdapter`/`TelegramAgentAdapter` need to exist at all as
subclasses, or whether the base `createDiscordAdapter`/`createTelegramAdapter`
factories suffice unmodified — see Implementation step 1.

### Fixing the Slack-only couplings (the actual generalization work)

In priority order, because each unblocks a cluster of tools:

1. **`lib/ids.ts`** stops hardcoding `slack:`. The Chat SDK already encodes
   platform into the id prefix (`discord:guildId:channelId:threadId`,
   `slack:C...:ts`, confirmed by `ChannelContext.threadId`'s doc comment at
   `node_modules/@mastra/core/dist/channels/types.d.ts:664`-`665`). `rawId`
   should strip *whatever* platform prefix is present (split on the first
   `:` unconditionally, not `slack:` specifically), and `chatChannelId`/
   `chatThreadId` need the caller's platform to re-prefix correctly —
   which means they need a `platform` parameter (dict-param per
   `CODING_STANDARDS.md`'s "Dict params" rule) instead of assuming Slack.
   Every call site (`get-channel-info.ts`, `read-conversation-history.ts`,
   `list-threads.ts`, `summarize-thread.ts`) already has `channelContext(...)`
   in scope, which carries `.platform`.

2. **`handlers.ts:69`**'s `slack.decodeThreadId(...).threadTs === message.id`
   root-mention check needs a platform-agnostic replacement. The Chat SDK's
   `Thread`/`Adapter` surface doesn't expose a generic "is this message the
   thread root" helper directly, so the options are: (a) compare
   `message.threadId` structurally against `message.id` only when
   `ctx.platform === 'slack'` and fall back to Chat SDK's own
   `thread.isDM` / first-message-in-thread semantics otherwise, or (b) check
   with the adapter resolved generically: `chat().getAdapter(ctx.platform).decodeThreadId?.(...)`
   guarded by an `in` check, since `decodeThreadId` *is* declared on the base
   `Adapter` interface (`chat-Dm1vQU3i.d.ts:547`) even though its return
   shape (`TThreadId`) is adapter-specific — every adapter must implement it.
   Recommendation: (b), since it needs no platform branching in `handlers.ts`
   itself and stays inside the one generic call. Needs verification against
   Discord/Telegram's actual `decodeThreadId` return shape once those
   packages are installed (their `.d.ts` isn't available until step 1 of
   Implementation).

3. **`message.ts`'s `rawText`** either needs a Discord-shaped fallback (its
   raw payload uses `content`, not `text`, so today's `slackRawText` schema
   already correctly no-ops there) or, better, `withoutLeadingMentions`
   needs to also recognize the platforms' own raw mention token syntax.
   Discord's raw mention token is `<@!?\d+>` (same angle-bracket shape as
   Slack's `<@U123>`), so extending the schema/regex to accept a raw
   `content` field too is a small, mechanical addition, not a rewrite.
   Telegram doesn't use inline mention tokens at all (entities are
   positional, out-of-band), so `withoutLeadingMentions` naturally becomes a
   no-op there and `message.text` is already correct as-is — no fallback
   needed for Telegram specifically.

4. **Tool tier reclassification** (implements TODO.md's "Cross-platform
   tools" item): rewrite `read_conversation_history`, `list_threads`,
   `summarize_thread`, `edit_message`, `delete_message` to resolve
   `chat().getAdapter(ctx.platform)` instead of importing the `slack`
   singleton, gated by `if (typeof adapter.listThreads !== 'function')` (or
   equivalent) throwing a clear "not supported on {platform}" error for the
   optional methods a given adapter doesn't implement (e.g. Telegram has no
   `listThreads`). `edit_message`/`delete_message` additionally need their
   input schema changed from a Slack-message-URL shape to the existing
   generic `target: targetSchema` + `messageId` shape already used by
   `post_message`/`upload_file`. Tools with no cross-platform analog
   (`canvas/*`, `search_slack`, `get_slack_file`, `leave_channel`) get a
   guard at the top of `execute` — `if (channelContext(...).platform !== 'slack') throw new Error(...)`
   — rather than being silently unavailable, so the model gets an
   actionable error instead of a confusing tool-not-found.

5. **Rename `SlackAgentRequestContext`** → a platform-neutral name (e.g.
   `AgentRequestContext`) in `src/mastra/types/channel.ts`, since the type
   itself already carries `ChannelContext.platform: string` and has never
   been Slack-specific in shape, only in name — a `CODING_STANDARDS.md`
   "Direct names" violation once a second platform exists. Every import
   site (`lib/context.ts:2`, plus wherever else it's imported) needs the
   rename followed through, per `CODING_STANDARDS.md`'s "search for the old
   name across source ... before handoff" rule.

### What stays Slack-only, on purpose

Canvases, `search_slack`'s `assistant.search.context`, `get_slack_file`,
`leave_channel`: these have no Chat SDK generic surface because the
*platform itself* has no equivalent concept (confirmed absent from the
`Adapter` interface and from the feature matrix). These tools stay under
`tools/slack/` and `tools/canvas/`, ungated in `baseTools` (all platforms'
agents see the tool schema), but each `execute` throws a clear
platform-mismatch error rather than silently failing or being conditionally
excluded from the tool list — conditionally excluding tools per platform
would require `tools` to become a `DynamicArgument<TTools, TRequestContext>`
function (`node_modules/@mastra/core/dist/agent/types.d.ts:546` — Agent does
support this), which adds a genuine branch point for a marginal ergonomics
win over a clear runtime error; not worth it for a template whose target
audience adds platforms one at a time and will notice a Slack-only tool
failing clearly on Discord immediately. Revisit only if a template user
reports the error-message UX is bad in practice.

### Mastra Studio and token cost

No new token cost: `toolDisplay` is the same function reused across all
three adapters (`chat/tool-display/index.ts`), so no extra model calls per
platform. `generateTitle` (`agents/orchestrator.ts:62-66`) already runs
per-thread on the cheap `summarizer` model regardless of which platform
created the thread — Discord/Telegram threads get titled the same way Slack
DMs do today (per `TODO.md`'s already-shipped titles item). Traces
(`Observability` in `src/mastra/index.ts:38-46`) are keyed by run, not by
platform, so Discord/Telegram runs show up in the same DuckDB-backed trace
view with no additional wiring. The one thing to watch: Discord's
Post+Edit streaming fallback issues more platform API calls per turn than
Slack's native streaming — this is a Discord-side rate-limit concern, not a
token-cost concern, and is entirely inside `@chat-adapter/discord`'s
`updateIntervalMs` handling (`StreamingConfig`, already configurable per
adapter in `types.d.ts:170-172` if the default cadence turns out to be too
chatty).

### Removability

A template user who never sets `DISCORD_BOT_TOKEN`/`TELEGRAM_BOT_TOKEN` gets
byte-identical behavior to today: `discord`/`telegram` are `undefined`, the
spread in `orchestrator.ts`'s `adapters` map contributes nothing, no
`discord.js`/`discord-api-types`/`discord-interactions` code path executes
(the packages are still installed as `dependencies`, which is the one real
cost — see Data/config changes for why this can't be made truly zero-install
without a bigger dependency-injection change that isn't worth it for two
lightweight, tree-shakeable packages). To remove a platform entirely later,
delete its `chat/client.ts` export, its `orchestrator.ts` map entry, its
`.env.example` block, and its `package.json` dependency — four grep-able
spots, no scattered wiring.

## Implementation steps

1. **Install dependencies** (needs user approval per `.claude/CLAUDE.md`,
   "Ask first: dependency changes"):
   ```bash
   bun add @chat-adapter/discord@^4.32.0 @chat-adapter/telegram@^4.32.0 \
     discord-api-types discord-interactions discord.js
   ```
   (Telegram has no peer deps.) After install, re-run
   `node -e "require('chat/adapters').getAdapter('discord')"`-style checks
   against the now-present `node_modules/@chat-adapter/discord/dist/*.d.ts`
   to confirm `decodeThreadId`'s return shape and `editMessage`/`deleteMessage`
   signatures before writing step 4's generic tool rewrites — the catalog's
   `.d.ts` (`chat/dist/adapters/index.d.ts`) only carries metadata, not the
   adapter class itself.

2. **`src/env.ts`**: add, all `.optional()` (this repo's existing pattern for
   optional integrations, e.g. `GITHUB_TOKEN`):
   ```ts
   DISCORD_BOT_TOKEN: z.string().min(1).optional(),
   DISCORD_PUBLIC_KEY: z.string().min(1).optional(),
   DISCORD_APPLICATION_ID: z.string().min(1).optional(),
   DISCORD_MENTION_ROLE_IDS: z.string().min(1).optional(),
   TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
   TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(1).optional(),
   TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
   ```
   Add a Zod `.refine()` (or a follow-up check in `chat/client.ts`) so that
   if `DISCORD_BOT_TOKEN` is set, `DISCORD_PUBLIC_KEY`/`DISCORD_APPLICATION_ID`
   are also required — partial Discord config should fail fast at boot, not
   at first webhook.

3. **`src/mastra/chat/client.ts`**: add `discord`/`telegram` exports beside
   `slack`, each `undefined` unless its bot token is set (see Design
   sketch). Decide during implementation whether either needs a subclass
   like `SlackAgentAdapter` — likely no for Telegram (no known quirks to
   patch), possibly no for Discord either since the recipient-stash
   workaround in `adapter.ts` is Slack Assistant-API-specific; only add a
   subclass if a real quirk surfaces in testing, per "inline over extract."

4. **`src/mastra/agents/orchestrator.ts`**: extend the `adapters` map per
   the Design sketch. Reuse the existing `toolDisplay` and a per-adapter
   `formatError` (can share one function across all three if the message
   doesn't need to be platform-specific — check whether "Oops, something
   went wrong" reads fine on Discord/Telegram before assuming a shared
   formatter, since the current one uses Slack `*bold*` mrkdwn syntax which
   Chat SDK should translate per-platform automatically via its
   markdown-to-native conversion, per `platform-adapters.mdx`'s "Converts
   outgoing messages from markdown/AST/cards to the platform's native
   format").

5. **`src/mastra/lib/ids.ts`**: generalize `rawId`/`chatChannelId`/
   `chatThreadId` to take `{ id, platform }` (dict param) instead of
   assuming `slack:`. Update all four call sites
   (`get-channel-info.ts:23`, `read-conversation-history.ts:31,36`,
   `list-threads.ts:27`, `summarize-thread.ts:32`) to pass
   `channelContext(context?.requestContext).platform`.

6. **`src/mastra/chat/handlers.ts:69`**: replace the
   `slack.decodeThreadId(...)` root-mention check with the generic
   `chat().getAdapter(ctx.platform).decodeThreadId(...)` form from Design
   step 2, or the documented adapter-agnostic alternative discovered once
   Discord/Telegram `.d.ts` is available (step 1).

7. **`src/mastra/chat/message.ts`**: extend `withoutLeadingMentions`'s regex
   (or `rawText`'s schema) to also recognize Discord's `<@!?\d+>` raw mention
   token, sourced from `message.raw`'s Discord-shaped `content` field
   instead of `text`.

8. **Tool tier rewrites** (`src/mastra/tools/slack/`): `read-conversation-history.ts`,
   `list-threads.ts`, `summarize-thread.ts`, `edit-message.ts`,
   `delete-message.ts` — swap the `slack` singleton import for
   `chat().getAdapter(ctx.platform)`, add the not-supported guard for
   optional `Adapter` methods, and (for edit/delete) replace the
   Slack-URL input schema with `target: targetSchema, messageId: z.string()`.
   Add the `platform !== 'slack'` guard to the Slack-only tools listed in
   Design's "stays Slack-only" section (`canvas/*`, `search-slack.ts`,
   `get-slack-file.ts`, `leave-channel.ts`).

9. **`src/mastra/types/channel.ts`**: rename `SlackAgentRequestContext` →
   `AgentRequestContext` (or similar), update `lib/context.ts:2` and any
   other import.

10. **Docs**: update `docs/messaging.md` to note that mentions/DMs/`!stop`/
    thread-follow work identically across whichever platforms are
    configured, and add a short "Adding a platform" section to
    `docs/configuration.md` (if that's where Slack app setup currently
    lives) pointing at step 2-4 above as the four things a template user
    touches. Confirm `docs/configuration.md`'s exact current content before
    writing this step — not read during this research pass.

11. **`.claude/skills` / `AGENTS.md`**: no change expected — the `chat-sdk`
    skill already documents multi-adapter registration generically.

## Data / schema / config changes

**New dependencies (needs approval):**
- `@chat-adapter/discord@^4.32.0`, `@chat-adapter/telegram@^4.32.0`
- Discord peer deps: `discord-api-types`, `discord-interactions`, `discord.js`
- No new state/storage dependency — `createPostgresState` already backs all
  adapters registered on the same `channels.state`.

**Env vars** (add to `src/env.ts` and `.env.example`, all optional):
`DISCORD_BOT_TOKEN` (secret), `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`,
`DISCORD_MENTION_ROLE_IDS` (optional), `TELEGRAM_BOT_TOKEN` (secret),
`TELEGRAM_WEBHOOK_SECRET_TOKEN` (secret, optional), `TELEGRAM_BOT_USERNAME`
(optional).

**No Postgres schema change**: Chat SDK's state adapter is keyed by thread
id, which already embeds the platform prefix; no migration needed.

**No Slack manifest change**: `slack-manifest.json` is untouched by this
plan.

**Discord app setup** (user-facing, for the eventual README/docs step):
create an application in the Discord Developer Portal, create a bot, grant
the "Message Content Intent" privileged gateway intent, invite it with
`bot` + `applications.commands` OAuth2 scopes, and leave the Interactions
Endpoint URL unset (this repo uses Gateway, not HTTP Interactions).

**Telegram bot setup**: create a bot via BotFather, no further app-review
step; `mode: 'auto'` handles the rest.

**Function-signature change**: `rawId`/`chatChannelId`/`chatThreadId` in
`lib/ids.ts` change from single-string params to a `{ id, platform }` dict
per `CODING_STANDARDS.md`'s "Dict params" rule — this is a breaking change
to their four call sites, all within this repo, all updated in step 5.

## Risks & open questions

- **`handlers.ts:69`'s root-mention check** (Design step 2 / Implementation
  step 6) needs Discord and Telegram's actual `decodeThreadId` return shapes
  to finalize — currently only Slack's is known. Flagged as the one step in
  this plan that can't be fully speced until dependencies are installed.
- **Discord "Message Content Intent"** is a privileged intent Discord can
  gate behind app verification for bots in 100+ servers; irrelevant for a
  template/personal-use deployment but worth a one-line callout in setup
  docs so it doesn't surprise someone scaling up later.
- **Telegram has no `listThreads`** (feature matrix: Cross) and only
  "cached" `fetchChannelMessages` — `list_threads` and
  `read_conversation_history` will throw a clear "not supported on
  telegram" error there rather than silently returning nothing; confirm
  that's the desired UX versus omitting the tool for Telegram-originated
  runs (would require the dynamic-`tools`-function approach explicitly
  deferred in Design).
- **`formatError` per adapter**: the current single Slack formatter uses
  mrkdwn (`*bold*`); need to verify Chat SDK's markdown-to-native conversion
  actually handles this correctly for Discord (which uses `**bold**`) and
  Telegram (MarkdownV2, which requires escaping many punctuation
  characters) before assuming one shared formatter works everywhere —
  otherwise each adapter needs its own `formatError`, a small addition to
  the Design step 4 sketch, not a redesign.
  Reference: `node_modules/chat/docs/posting-messages.mdx` covers this
  conversion; not read during this research pass, read before implementing
  step 4.
  `assistant_thread` /App Home equivalents are Slack-only concepts
  (`chat/events.ts`) — no action needed, they simply don't fire for
  Discord/Telegram since `onAssistantThreadStarted`/`onAppHomeOpened` are
  Slack Assistant-API-specific Chat SDK events.
- **Scoping**: this plan intentionally does not add Teams, Google Chat, or
  any vendor-official adapter (AgentPhone, Lark, etc.) even though the
  catalog lists them — the brief's stated first priority is Discord and
  Telegram specifically. The registration pattern established here
  (Design's "one map, one line per platform") is what makes adding a third
  platform later cheap, so no extra abstraction is needed to "prepare" for
  that.

## Effort & priority

**Size: M.** The registration itself (Implementation steps 1-4) is small —
an afternoon, mostly dependency install and env var plumbing, since
`channels.adapters` already supports this shape with zero Mastra-side
changes needed. The bulk of the effort is the Slack-only-coupling cleanup
(steps 5-9), which is real but bounded: five files with hardcoded `slack:`
assumptions, one root-mention check, one mention-token regex, five tools to
reclassify, one type rename. No other plan in this folder is a prerequisite
or blocker; this is the first plan in `plans/` per the brief's framing as
the maintainer's first priority.
