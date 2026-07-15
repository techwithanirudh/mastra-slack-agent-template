# Signal subscriptions

## Summary

Let the orchestrator agent be woken by external events, GitHub pull-request
activity and AgentMail email, and act inside the Slack thread that asked for
them, instead of only reacting to Slack messages or firing on a cron. Mastra
1.50.0 ships a native primitive for exactly this (`Agent({ signals: [...] })`
plus `sendNotificationSignal()`), and gorkie already has a hand-rolled,
single-user version of the email half. This plan ports gorkie's mechanism
into the native abstraction and generalizes it to per-thread subscriptions
for any number of users and, new, a GitHub source.

## Current state

**This repo:** no signal source exists. `src/mastra/agents/orchestrator.ts:31`
has no `signals` option. `src/env.ts:24-25` declares `AGENTMAIL_API_KEY` and
`GITHUB_TOKEN` as optional, but both are consumed only inside the E2B sandbox
boundary today:
- `src/mastra/workspace/network.ts:7-40` adds outbound network-proxy rules so
  sandboxed `gh`/`curl`/Python code can call `api.github.com`,
  `github.com`, and `api.agentmail.to` with the real token injected by E2B's
  network layer.
- `src/mastra/workspace/network.ts:50-65` (`createEnv`) sets *placeholder*
  values for `GH_TOKEN`, `GITHUB_TOKEN`, `AGENTMAIL_API_KEY` inside the
  sandbox process env, so the real secret string never enters the sandbox
  even though sandboxed tools can still call authenticated endpoints.
- `src/mastra/workspace/build-template.ts:36` installs the AgentMail
  **Python** package into the E2B image; there is no `agentmail` npm package
  in this repo's `package.json` or `node_modules` at all (confirmed: not
  present on host).

Closest existing precedent for "external event wakes a thread" is the
scheduled-task tool, not a signal: `src/mastra/tools/scheduled-tasks/create.ts:81-107`
calls `service.create({ ifActive: { behavior: 'persist' }, ifIdle: { behavior:
'wake', streamOptions: { requestContext: context.requestContext?.toJSON() } },
... })`, i.e. a cron fires, resolves the stored `threadId`/`resourceId`, and
either drops into the active run or wakes the idle thread with the original
Slack `requestContext` reattached. Signals use the identical `ifIdle`/
`ifActive` vocabulary (see Design), so this is the pattern to mirror, not
reinvent.

`src/mastra/tools/wait.ts` (new in this branch) is agent-invoked,
single-run, bounded (max 60s per call, `stopWhen`/step-budget cost). It is
the mechanism for "pause a few seconds inside the run I'm already in." It is
unrelated to, and does not replace, a standing background subscription that
can wake the agent hours later while no run is active. See "Relation to the
wait tool" in Design.

**Gorkie (`/workspaces/gorkie`, branch `dev`):** already implements the email
half by hand, not with the native `signals` API. Full file,
`/workspaces/gorkie/src/mastra/signals/email.ts` (103 lines, read in full):
- Opens one persistent AgentMail WebSocket (`AgentMailClient(...).websockets.connect()`,
  line 24-26), subscribes to `message.received` on a single hardcoded inbox
  `gorkie@agentmail.to` (line 35), and on every event calls
  `gorkieAgent.sendNotificationSignal(...)` (lines 47-80) with:
  - `source: 'email'`, `kind: 'message-received'`, `priority: 'medium'`,
    `summary`, `payload: message`, `dedupeKey: \`email:${event.eventId}\``,
    `coalesceKey: \`email-thread:${message.threadId}\``.
  - A target of `{ resourceId, threadId, ifIdle: { behavior: 'wake',
    streamOptions: { requestContext: new RequestContext([['channel', {...}]]) } } }`,
    reconstructing a synthetic Slack DM `channel` context by hand so the
    woken run can post back into Slack.
  - `resourceId`, `slackThreadId`, `threadId` all come from **fixed env vars**
    (`EMAIL_SIGNAL_RESOURCE_ID`, `EMAIL_SIGNAL_SLACK_THREAD_ID`,
    `EMAIL_SIGNAL_THREAD_ID`, `/workspaces/gorkie/src/env.ts:29-31`): one
    single hardcoded (person, DM thread) pair, the maintainer's own DM. There
    is no notion of "which thread subscribed to this inbox", because there is
    only ever one.
  - Reconnect/backprop handling: `subscribed` flag re-armed on `close`
    (line 93-98), resubscribes on `open`.
- Wired at boot in `/workspaces/gorkie/src/mastra/index.ts:49-51`:
  `startEmailMonitor().catch(...)`, fired once, unawaited, right after
  `mastra.startWorkers()`.
- `gorkieAgent` itself (`/workspaces/gorkie/src/mastra/agents/gorkie.ts`) does
  **not** pass a `signals` array; it never uses `SignalProvider`. The
  `sendNotificationSignal` call is made directly from the monitor module. No
  GitHub signal exists in gorkie at all today; `git grep -i signal` across
  `/workspaces/gorkie/src` (the whole tree, not just `signals/`) turns up
  nothing GitHub-shaped, only the `EMAIL_SIGNAL_*` env vars and a prompt line
  in `/workspaces/gorkie/src/mastra/prompts/core.ts:20`: *"External events
  arrive as notification signals. Triage them before acting. Respond only
  when the event needs the user's attention or a safe, useful action;
  otherwise stay silent with `skip`. Never send email or take an irreversible
  action from a notification without explicit user approval."* This prompt
  line is generic already and worth porting verbatim into this repo's
  `prompts/core.ts` alongside whatever notification wiring lands.
- Roadmap acknowledgment: this repo's own `TODO.md:161-162` already lists
  *"Signal subscriptions: let the agent wait on or react to external events
  (GitHub events, AgentMail) instead of only polling on a cron schedule"* as
  a tracked, not-yet-started roadmap item.

**Conclusion:** gorkie's code is a useful reference for the *shape* of a
notification payload and the *idle-wake* mechanics, but it predates (or
simply doesn't use) Mastra's native `SignalProvider`/`signals` constructor
option, is hardcoded to exactly one (user, thread), and has no GitHub signal
to port at all. This plan does not port gorkie's `email.ts` file verbatim; it
builds the generalized, multi-thread, native-API version its `sendNotificationSignal`
call sketches out.

## Design

### The native primitive (verified against the pinned version)

`@mastra/core` is pinned at `1.50.0` (`package.json:34`). Signals were
*"Added in `@mastra/core@1.39.0`"* per the shipped docs
(`node_modules/@mastra/core/dist/docs/references/docs-long-running-agents-signals.md:5`
and `...-signal-providers.md:5`), so the full API is available. Confirmed
directly against the `.d.ts` (not guessed):

- `Agent` constructor accepts `signals?: SignalProvider[]`
  (`node_modules/@mastra/core/dist/agent/types.d.ts:771`).
- `Agent#sendNotificationSignal(notification, target)`,
  `Agent#sendSignal(signal, target)`, `Agent#sendStateSignal(...)`,
  `Agent#subscribeToThread(...)` all exist on the `Agent` class
  (`node_modules/@mastra/core/dist/agent/agent.d.ts:1145,1183,1187-1188,1192`).
- `SendNotificationSignalInput` shape (`node_modules/@mastra/core/dist/notifications/types.d.ts`):
  `{ source, kind, summary, priority?, payload?, sourceId?, dedupeKey?, coalesceKey?, attributes?, metadata? }`.
- Notification storage: `@mastra/pg` ships a `notifications` domain
  (`node_modules/@mastra/pg/dist/storage/domains/notifications/index.d.ts`,
  class `NotificationsPG extends NotificationsStorage`, methods
  `createNotification`/`listNotifications`/`listDueNotifications`/`updateNotification`).
  This repo's storage is `MastraCompositeStore` with `PostgresStore` as the
  `default` domain (`src/mastra/index.ts:24-35`), so notification records are
  durable "for free," no schema work needed, the domain ships with the
  pinned `@mastra/pg`.
- `Mastra({ notifications: { dispatch } })` auto-schedules deferred/summary
  notification dispatch: *"Notification dispatch is scheduled automatically
  by default"* (`node_modules/@mastra/core/dist/mastra/index.d.ts` around the
  `notifications?: { dispatch?: NotificationDispatchConfig }` field).
- `Agent({ notifications: { deliveryPolicy } })` controls wake cadence per
  priority/source (`node_modules/@mastra/core/dist/notifications/delivery-policy.d.ts`):
  `{ default?, priorities?: Partial<Record<'low'|'medium'|'high'|'urgent', Decision>>,
  sources?: Record<string, Decision>, decide?: (input) => Decision }`, where a
  `Decision.action` is one of `'deliver' | 'queue' | 'defer' | 'summarize' |
  'persist' | 'discard'` (`node_modules/@mastra/core/dist/notifications/types.d.ts:124`).
  This is the exact knob for "avoid runaway wakeups" below.
- `SignalProvider` abstract base class
  (`node_modules/@mastra/core/dist/signals/signal-provider.d.ts`, and doc
  `reference-signals-signal-provider.md`): owns an in-memory
  `threadId+resourceId <-> externalResourceId` registry
  (`subscribe`/`unsubscribe`/`getSubscriptionsForResource`/`getSubscriptionsForThread`),
  a `poll(subscriptions)` hook for pull sources, a `handleWebhook(request)`
  hook for push sources, and a protected `notify(notification, target)`
  wrapper around `agent.sendNotificationSignal()`. Lifecycle: `connect(agent)`
  (called by the `Agent` constructor when passed via `signals: [...]`),
  `__registerMastra(mastra)` (gives access to storage), `start()`/`stop()`.
  The doc is explicit that **the base registry is in-memory and per-process**
  and subscriptions must be persisted and rehydrated by the subclass in
  `start()` if they need to survive a restart
  (`...-signal-providers.md:199`). This is the one piece of native
  bookkeeping this template must not assume for free; see Risks.
- `WebhookSignalProvider` is a ready-made concrete class for generic push
  sources (`subscribeThread`/`unsubscribeThread`/`handleWebhook`), not needed
  here since neither source requires an inbound webhook (see below), but
  worth knowing about for a future push-based source.
- `@mastra/github-signals` (published npm package, `0.2.2`, Apache-2.0, zero
  runtime deps, `peerDependencies: { "@mastra/core": ">=1.0.0-0 <2.0.0-0" }`,
  compatible with the pinned `1.50.0`) is a real, actively maintained
  `SignalProvider` subclass, cited directly by the Mastra docs as *"a
  production signal provider that watches GitHub pull requests and notifies
  threads about comments, review state, CI status, and merges"*
  (`...-signal-providers.md:203`). Inspected the actual package (`npm pack
  @mastra/github-signals@0.2.2`, unpacked, read `dist/index.d.ts` and
  `CHANGELOG.md` in full): it is **poll-based**, no webhook route needed. Key
  surface:
  - `new GithubSignals(options?: GithubSignalsOptions)` with
    `{ owner?, repo?, cwd?, syncOnSubscribe?, pollIntervalMs?, syncClient?,
    repositoryResolver?, threadStore?, authorizedPermissions?, authorizedBots?,
    ignoredBots?, permissionResolver? }`.
  - `subscribeThreadToPR({ threadId, resourceId, agentId?, ifIdle?, pr: number
    | { owner?, repo?, number } })` and `unsubscribeThreadFromPR(...)`: explicit
    owner/repo/number per subscription, so the default `GitRemoteRepositoryResolver`
    (reads a local `git remote`, meant for a coding-agent's own working
    directory) is not required as long as the subscribe call always passes
    `owner`/`repo` explicitly.
  - Default sync path is `GitcrawlSyncClient`, which shells out to `gh`/git
    against a `cwd` (`gitcrawlCommand` option). That is host-side process
    execution of a fixed, framework-controlled command (not user/agent code),
    but it is still a new host-side git/`gh` dependency this template doesn't
    have today (`gh` currently only exists inside the E2B image,
    `src/mastra/workspace/build-template.ts:36`). Recommendation below is to
    supply a custom `syncClient: GithubSignalsSyncClient` that calls the
    GitHub REST API directly over `fetch` with `env.GITHUB_TOKEN`, mirroring
    how `workspace/network.ts` already authenticates against
    `api.github.com`, instead of shelling out to `gh`/git on the host.
  - Subscribe/unsubscribe are agent-triggerable *dynamically*: at read time,
    `processInputStep` (confirmed in `dist/index.js`, not just the `.d.ts`)
    builds subscribe/unsubscribe tools on the fly and reacts to
    `GITHUB_SUBSCRIBE_PR_TAG`/`GITHUB_UNSUBSCRIBE_PR_TAG` signals, i.e. the
    package gives the model a natural "watch PR #123" capability without this
    repo writing a bespoke tool.
  - Subscriptions are persisted through a `GithubSignalsThreadStore`
    (`getThreadById`/`saveThread`, i.e. `StorageThreadType` on the Mastra
    memory thread, backed by whatever storage the agent's `Mastra` instance
    uses, Postgres here) rather than only the in-memory base registry. This
    is the answer to "resume after restart" for GitHub specifically, see
    Risks for the one thing to verify (does it also restart *polling* for
    previously-subscribed threads on boot, or only remember the subscription
    list).

### Two sources, two different shapes, one registration point

**GitHub -> use `@mastra/github-signals` as-is**, configured with a custom
`syncClient`. Do not hand-roll a GitHub `SignalProvider`; the pinned,
published package already does PR comment/review/CI/merge tracking with
bot-noise filtering (`authorizedBots`/`ignoredBots`/`sanitizeCommentText`)
that would be wasted effort to reimplement, and it is already scoped
correctly (poll-based, no public endpoint, explicit owner/repo/number,
per-thread subscriptions with Postgres-backed persistence).

```ts
// src/mastra/signals/github.ts (sketch)
import { GithubSignals, type GithubSignalsSyncClient } from '@mastra/github-signals';
import { env } from '@/env';

const restSyncClient: GithubSignalsSyncClient = {
  async syncPullRequest({ owner, repo, number, abortSignal }) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
      {
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` },
        signal: abortSignal,
      }
    );
    // map response -> GithubSignalsSyncResult
  },
};

export const githubSignals = env.GITHUB_TOKEN
  ? new GithubSignals({ syncClient: restSyncClient, pollIntervalMs: 5 * 60_000 })
  : undefined;
```

This keeps the "no new host-side git/gh dependency" boundary intact: the
sync client is a plain `fetch` call, same pattern already used for other
host-side API calls (no sandbox involved, `GITHUB_TOKEN` is read on the host
exactly like `workspace/network.ts` already does for the sandbox proxy
rules).

**AgentMail -> generalize gorkie's `email.ts` into a custom `SignalProvider`.**
There is no published `@mastra/agentmail-signals` package (checked: only
`@mastra/github-signals` exists as an official signal provider on npm today),
so this is the one piece that must be hand-written, but it is a small,
mechanical generalization of the file already read in full above:

```ts
// src/mastra/signals/email.ts (sketch)
import { SignalProvider } from '@mastra/core/signals';
import type { SignalProviderTarget } from '@mastra/core/signals';
import { AgentMailClient } from 'agentmail';
import { env } from '@/env';

export class EmailSignals extends SignalProvider<'email-signals'> {
  readonly id = 'email-signals' as const;
  readonly name = 'Email Signals';

  async start(): Promise<void> {
    const socket = await new AgentMailClient({ apiKey: env.AGENTMAIL_API_KEY }).websockets.connect();
    socket.sendSubscribe({ type: 'subscribe', inboxIds: [env.AGENTMAIL_INBOX], eventTypes: ['message.received'] });
    socket.on('message', (event) => {
      if (event.type !== 'event' || event.eventType !== 'message.received') return;
      const { message } = event;
      for (const sub of this.getSubscriptionsForResource(message.to ?? env.AGENTMAIL_INBOX)) {
        this.notify(
          {
            source: 'email',
            kind: 'message-received',
            priority: 'medium',
            summary: `Email from ${message.from}: ${message.subject ?? '(no subject)'}`,
            payload: message,
            dedupeKey: `email:${event.eventId}`,
            coalesceKey: `email-thread:${message.threadId}`,
          },
          { threadId: sub.threadId, resourceId: sub.resourceId }
        );
      }
    });
  }
}
```

The load-bearing generalization versus gorkie: **subscriptions are looked up
per inbox/recipient via the registry** (`getSubscriptionsForResource`)
instead of a single hardcoded `(resourceId, threadId)` pair from env vars.
Any Slack thread can ask "watch this inbox" and get notified in *that*
thread; this is what makes it a template feature instead of one maintainer's
personal wiring. A minimal `subscribe_email` / `unsubscribe_email` tool
(same shape as the scheduled-task tools) drives `this.subscribe(target,
inboxId)` from inside a run, mirroring how `github-signals` exposes
subscribe/unsubscribe dynamically.

**One registration point.** Both sources plug into the exact same array on
the one agent:

```ts
// src/mastra/agents/orchestrator.ts (sketch, inside the Agent config)
signals: [
  ...(env.GITHUB_TOKEN ? [githubSignals] : []),
  ...(env.AGENTMAIL_API_KEY ? [emailSignals] : []),
],
```

This is deliberately the same shape as `tools/base.ts`'s `baseTools` object
and `mcp/index.ts`'s auto-spawned server list: one array literal, additive,
each entry conditionally present based on whether its env vars are
configured. A template user who wants neither leaves both env vars unset and
the array is empty; nothing else in the codebase branches on whether signals
are enabled. This directly satisfies "make it opt-in / removable" without
introducing a feature flag or config switch beyond the credentials the
feature already requires.

### Why not a Chat SDK GitHub adapter instead

Checked the `chat-sdk` skill and the adapter catalog shipped in this repo's
own `node_modules/chat/dist/adapters/index.js`. There *is* an official
adapter, `github: { packageName: '@chat-adapter/github', group: 'official',
type: 'platform', factoryExport: 'createGitHubAdapter', description: "Build
bots that respond to pull request and issue comment threads." }`, with
`GITHUB_WEBHOOK_SECRET` required and PAT or GitHub-App credential modes.
That would make GitHub PR/issue threads a *first-class chat platform*,
symmetric with Slack: the bot would have its own presence and reply directly
as PR/issue comments, and would need a public webhook endpoint (this repo
runs no HTTP server today, Slack is Socket Mode only).

That is a materially different feature: "the agent lives on GitHub too" vs.
"the agent already working in a Slack thread gets woken by a GitHub event
related to that thread." The maintainer's stated want ("if it could listen
for a github event") and this repo's own `TODO.md:161-162` roadmap line both
describe the notification/wake shape, not a second bot identity. Recommend
`@mastra/github-signals` for this plan and leave `@chat-adapter/github` as a
candidate for a *future*, separate plan (natural extension of
`plans/multi-platform.md`'s Discord/Telegram adapter work, since it would
register through the exact same `channels.adapters.<platform>` point Slack
already uses in `agents/orchestrator.ts:82-90`). Do not build both in one
plan.

### Relation to the `wait` tool

These solve different problems and are not substitutes for each other:

| | `wait` tool (`tools/wait.ts`, see `plans/wait-tool.md`) | Signal subscriptions (this plan) |
|---|---|---|
| Trigger | Agent calls it mid-run | External event, any time, run or no run |
| Duration | 1-60s per call, bounded by `stopWhen`/step budget | Indefinite, thread can be idle for days |
| Cost while waiting | Burns the active run's step count and wall-clock | Zero, no run exists until the event arrives |
| Use case | "I just kicked off a background job, give it a few seconds" | "Notify me when PR #123 gets a review, whenever that is" |

An agent could technically loop `wait` + `gh pr checks` today to poll a PR,
but that only works while a run is active (thread open, user watching) and
wastes step budget on empty polls. Signal subscriptions are the standing,
zero-cost-while-idle version of the same intent, and are the mechanism to
reach for whenever the wait would need to span more than the current run.

### Avoiding runaway wakeups / Studio token cost

Every notification signal injects a compact `<notification source="..."
type="..." priority="..." status="delivered">summary</notification>` tag
into context, not a full tool round-trip, so the *floor* cost is low. The
risk is wake frequency: a 5-minute GitHub poll interval times several
watched PRs, or a chatty email thread, can wake an idle Slack thread (and
spend a full model turn) far more often than a human would want.

Mitigate with `Agent({ notifications: { deliveryPolicy } })` on the
orchestrator, source- and priority-scoped:

```ts
notifications: {
  deliveryPolicy: {
    sources: {
      'github-signals': { action: 'summarize' },
      'email-signals': { action: 'defer' },
    },
    priorities: { high: { action: 'deliver' }, urgent: { action: 'deliver' } },
  },
},
```

Default both sources to `priority: 'medium'` or lower in the `notify()`
calls (only CI failures / explicit @mentions on a watched PR, or an email
matching an urgent heuristic, would justify `'high'`), and let low/medium
notifications summarize/defer into a single `<notification-summary
pending="N">` tag that the agent can read via
`createNotificationInboxTool()` on demand rather than force a wake per
event. This keeps Studio runs cheap: a subscribed-but-quiet thread costs
nothing, a noisy one costs one small context tag per poll cycle instead of a
full generation, and only genuinely urgent events spend a real model turn.

## Implementation steps

1. **`src/env.ts`**: no new required vars for GitHub (reuses existing
   optional `GITHUB_TOKEN`). Add for AgentMail signals specifically:
   `AGENTMAIL_INBOX: z.string().email().optional()` (which inbox to watch;
   gorkie hardcoded `gorkie@agentmail.to`, this repo has no fixed identity to
   default to, so require the user to name their inbox once it's created via
   AgentMail's console). Mirror into `.env.example`.
2. **`package.json`** (needs user approval, dependency change):
   - Add `agentmail` (JS/TS SDK) as a **host** dependency. Confirmed it is
     not currently a host dependency anywhere in this repo (only the Python
     package ships inside the E2B image per
     `workspace/build-template.ts:36`); gorkie has it host-side at
     `^0.5.14` (`/workspaces/gorkie/package.json`).
   - Add `@mastra/github-signals` (`^0.2.2` or the resolved latest matching
     `@mastra/core@1.50.0`'s peer range) as a host dependency.
3. **`src/mastra/signals/github.ts`** (new): construct `githubSignals =
   new GithubSignals({ syncClient: restSyncClient, pollIntervalMs })`, with
   `restSyncClient` a small `GithubSignalsSyncClient` implementation using
   `fetch` + `env.GITHUB_TOKEN` against the GitHub REST API (map the PR
   response into `GithubSignalsSyncResult`/`GithubPullRequestSnapshot`
   fields the package expects, read `GithubSignals`'s exact field
   expectations from the unpacked `dist/index.d.ts` when implementing, not
   guessed). Export the instance, or `undefined` when `GITHUB_TOKEN` is
   unset.
4. **`src/mastra/signals/email.ts`** (new): the `EmailSignals` class
   sketched above, generalized from `/workspaces/gorkie/src/mastra/signals/email.ts`
   to look subscriptions up via `getSubscriptionsForResource` instead of
   fixed env vars. Export the instance, or `undefined` when
   `AGENTMAIL_API_KEY` is unset.
5. **`src/mastra/tools/signals/subscribe-email.ts` /
   `unsubscribe-email.ts`** (new, small, dict-param `createTool`s following
   the scheduled-task tool shape in `tools/scheduled-tasks/create.ts`):
   resolve the current thread via `channelContext`/`memoryThread`
   (same helpers `create.ts` uses), call
   `emailSignals.subscribe({ threadId, resourceId }, inboxOrAddress)` /
   `unsubscribe(...)`. GitHub does not need an equivalent tool: `github-signals`
   exposes subscribe/unsubscribe to the model itself via its input processor.
6. **`src/mastra/tools/base.ts`**: add the two new email subscribe tools
   (`subscribe_email`, `unsubscribe_email`) to `baseTools`, same one-object
   pattern already used for every other tool group. Optionally add
   `notification_inbox: createNotificationInboxTool({ storage: await
   mastra.getStorage()?.getStore('notifications') })` if the read/list/dismiss
   surface is wanted beyond automatic delivery, wire this from
   `src/mastra/index.ts` after `mastra` is constructed (storage isn't
   available at `tools/base.ts` module-eval time) rather than forcing it into
   the static tool object; flag as optional scope, not required for v1.
7. **`src/mastra/agents/orchestrator.ts`**: add
   `signals: [...(githubSignals ? [githubSignals] : []), ...(emailSignals ?
   [emailSignals] : [])]` to the `Agent` config, and optionally
   `notifications: { deliveryPolicy: {...} }` per the wakeup-control sketch
   above.
8. **`src/mastra/index.ts`**: on boot, after `mastra.startWorkers()`, rehydrate
   polling for any threads already subscribed before this process started.
   For GitHub, call `githubSignals?.startPollingForThread(...)` for each
   thread found via its persisted subscription metadata (confirm the exact
   rehydration entry point against the package's `start()`/`__registerMastra`
   behavior when implementing, see Risks). For email, `EmailSignals.start()`
   only needs to open the one shared WebSocket, no per-thread rehydration,
   since AgentMail pushes to the single inbox connection and the registry
   resolves per-message.
9. **`src/mastra/prompts/core.ts`**: port gorkie's generic notification-triage
   line verbatim (already generic, no identity to strip): *"External events
   arrive as notification signals. Triage them before acting. Respond only
   when the event needs the user's attention or a safe, useful action;
   otherwise stay silent with `skip`. Never send email or take an
   irreversible action from a notification without explicit user approval."*
10. **Docs**: extend `docs/configuring-github.md` and
    `docs/configuring-agentmail.md` with a "Signal subscriptions" section
    (how to ask the agent to watch a PR/inbox, what env var enables it,
    that it's opt-in).

## Data / schema / config changes

- **New env vars** (`src/env.ts` + `.env.example`): `AGENTMAIL_INBOX`
  (optional, required only if the agent should watch AgentMail messages;
  reuses existing `AGENTMAIL_API_KEY`). No new GitHub env var: reuses
  existing optional `GITHUB_TOKEN`.
- **New dependencies** (needs explicit user approval per `CLAUDE.md`):
  `agentmail` (host, JS/TS SDK, gorkie pins `^0.5.14`) and
  `@mastra/github-signals` (host, `^0.2.2`, zero runtime deps, peer-compatible
  with pinned `@mastra/core@1.50.0`).
- **No new Postgres schema**: notification records use `@mastra/pg`'s
  existing `notifications` domain (ships with the pinned package, no
  migration authored by this repo). GitHub subscription state lives in
  existing Mastra thread metadata via `github-signals`'s own thread store,
  also no new tables.
- **No Slack manifest changes**: this feature does not touch Slack scopes or
  events; it only ever writes into threads the Slack side already owns.
- **No new HTTP server / public endpoint**: both sources are outbound-only
  from the host (AgentMail WebSocket client, GitHub REST polling), consistent
  with this repo running Slack in Socket Mode with no inbound webhook route
  today. Do not introduce one for this plan.

## Risks & open questions

- **Subscription persistence across restarts is source-specific and must be
  verified per source, not assumed.** `github-signals` persists subscriptions
  into Mastra thread metadata via its `GithubSignalsThreadStore`, but whether
  it *automatically resumes polling* for those threads on process boot, or
  only remembers the subscription list until something calls
  `startPollingForThread` again, needs to be confirmed against the actual
  runtime behavior (not just the `.d.ts`) before relying on it; step 8 above
  assumes the latter (explicit rehydration) as the safer default.
- **`agentmail` npm package version drift**: gorkie pins `^0.5.14` with a
  local patch (`gorkie/patches/agentmail@0.5.14.patch`, referenced in
  `gorkie/package.json:25`). Check whether that patch is still needed against
  whatever version this repo would add; if so, the patch itself (or its
  underlying bug) needs porting too, not just the dependency.
- **GitHub sync client scope**: the sketch above sends only a single-PR
  `GET /repos/{owner}/{repo}/pulls/{number}` request per poll per
  subscription; whether that alone satisfies everything `GithubSignals`
  expects from `GithubSignalsSyncResult`/`GithubPullRequestSnapshot` (review
  threads, check runs, comments) needs confirming against the package's
  actual field usage when implementing; a REST-only client may need 2-3
  calls (PR, checks, reviews) instead of one, or may need to fall back to the
  default `GitcrawlSyncClient` for some subset. Budget for this during
  implementation, not assumed to be a single fetch.
- **Rate limits**: a 5-minute GitHub poll interval times N subscribed PRs
  times N users could add up against GitHub's REST rate limit on a single
  PAT; no per-provider request budget/backoff is designed here beyond
  `pollIntervalMs`, worth a pass once real usage exists.
- **Multi-user AgentMail inboxes**: this plan assumes one shared inbox
  (`AGENTMAIL_INBOX`) watched by one `EmailSignals` instance, with
  per-thread subscriptions distinguishing which thread cares about which
  sender/subject via `getSubscriptionsForResource`. If the template ever
  wants per-user inboxes (each Slack user gets their own AgentMail address),
  that is a bigger AgentMail-account-provisioning feature, out of scope
  here.
- **Distributed pub/sub**: the signals doc calls out that the default
  in-memory pub/sub can't cross instance boundaries and recommends
  `RedisStreamsPubSub` for multi-instance/serverless deployments. This
  template runs one Socket Mode process, so this is a non-issue today; flag
  it only if the multi-instance roadmap item ever lands.
- **Maintainer decision needed**: default `priority` for each source's
  `notify()` calls, and the `deliveryPolicy` defaults, directly trade off
  "never miss something important" against "don't wake me for noise." Ship
  a conservative default (medium/summarize) and let it be tuned from real
  usage rather than guessing the right cadence up front.

## Effort & priority

**L.** Two new signal sources, one new host dependency needing approval, one
package to evaluate and possibly extend (`@mastra/github-signals`'s sync
client), two new small tools, one agent config change, prompt and docs
updates, plus the persistence/rehydration verification called out in Risks.
Depends on nothing else in `plans/`, but pairs naturally with
`plans/scheduled-tasks.md` (both are "wake a thread later" mechanisms and
should read the same `ifIdle`/`ifActive` vocabulary the same way) and is
referenced by `plans/wait-tool.md`'s "relation to signals" framing. No
dependency on `plans/multi-platform.md`, though a future `@chat-adapter/github`
plan would build on the same `channels.adapters` registration point already
established for Slack.
