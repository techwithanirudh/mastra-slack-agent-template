# Generalize gorkie -> template porting

## Summary

Every gorkie -> template port currently strips identity by hand: find each
place `"gorkie"`, a hardcoded Slack user id, or a `techwithanirudh/gorkie`
credit line got typed into a prompt, tool description, or error string, and
retype the generic version. This plan collapses that into one small
`identity` config block plus one structural change (using Mastra's built-in
`botMention`/`botUserId` instead of hardcoded self-recognition ids), so a
future port is a data edit in one place, not a grep-and-retype sweep across
~10 files. It also gives the maintainer a repeatable diff routine to catch
drift between the two repos going forward.

## Current state

### What TODO.md already names (`TODO.md:5-26`, "Process" section)

The strip-down checklist is already written down: hardcoded bot Slack user
ids, `techwithanirudh/gorkie` repo/maintainer attribution, persona/identity
wording in `personality.ts`, `core.ts`'s `"You're gorkie"`, and `slack.ts`'s
self-recognition block. It also says this repo "should periodically diff
against [gorkie] to catch drift," with no concrete mechanism given.

### Identity strings, cited exactly

Grepped both trees (`grep -rniI gorkie`, `grep -rnoE 'U[A-Z0-9]{8,}'`,
`grep -rni techwithanirudh`) across `src/`. The template's `src/` has zero
`gorkie` hits today (already manually stripped), confirming the strip-down
happens, it just isn't centralized:

- `/workspaces/gorkie/src/mastra/prompts/personality.ts:5` - `"You are
  Gorkie, Gork's sister, ... By default, your pronouns are she/it."` vs
  `/workspaces/mastra-slack-agent-template/src/mastra/prompts/personality.ts:3`
  - `"You are a calm, intelligent, and genuinely helpful AI assistant."`
- `/workspaces/gorkie/src/mastra/prompts/core.ts:3` - `"You're gorkie."` vs
  `/workspaces/mastra-slack-agent-template/src/mastra/prompts/core.ts:3` -
  `"You are a capable Slack assistant."`
- `/workspaces/gorkie/src/mastra/prompts/slack.ts:6` - `"These Slack user
  ids are ALL you (gorkie), not other people: \`U0A9GM4P9UN\` (prod),
  \`U0A3EM9JV0T\` and \`U0AGF1M6DKN\` (dev)."` and line 9 - `"gorkie's source
  code is at https://github.com/techwithanirudh/gorkie. gorkie is made by
  Devarsh and twa."` Both lines are entirely absent from the template's
  `prompts/slack.ts` (4 lines shorter, no self-recognition block, no
  attribution).
- Tool-result / tool-description self-reference, the maintainer's own
  example ("Gorkie can't do xyz in tool result -> Can't do xyz"):
  - `/workspaces/gorkie/src/mastra/tools/slack/utils.ts:53,60,69,112,120,125`
    - `"Gorkie can only DM the person currently asking..."`, `"...so Gorkie
    will not post there."`, `"Gorkie can only post to the channel..."`,
    `"...so Gorkie will not edit or delete messages."`, `"Gorkie can only
    edit or delete messages it previously sent..."`
  - `/workspaces/gorkie/src/mastra/tools/slack/post-message.ts:51,57` -
    `"...Gorkie is not a member... /invite @gorkie..."`, `"...Gorkie must
    join that channel... /invite @gorkie..."`
  - `/workspaces/gorkie/src/mastra/tools/slack/leave-channel.ts:12`,
    `delete-message.ts:12`, `edit-message.ts:13`, `search-slack.ts:94,120`
    all say `"Gorkie"` where the template's equivalents already say
    `"the bot"` (confirmed at
    `/workspaces/mastra-slack-agent-template/src/mastra/tools/slack/leave-channel.ts:12`,
    `delete-message.ts:10`, `edit-message.ts:10`, `search-slack.ts:94,120`).
    The template already did this rewrite by hand, file by file. There is no
    shared constant; `"the bot"` is a literal duplicated 6 times today and
    will need to be retyped again for every new ported tool.
- `/workspaces/gorkie/src/mastra/config.ts:2,8` -
  `template: 'gorkie-workspace:1.2'`, `id: 'gorkie'` vs
  `/workspaces/mastra-slack-agent-template/src/mastra/config.ts:2,8` -
  `template: 'workspace:1.0'`, `id: 'orchestrator'`.
- `/workspaces/gorkie/src/mastra/workspace/index.ts:24-25` - `id:
  'gorkie-workspace', name: 'gorkie'` vs
  `/workspaces/mastra-slack-agent-template/src/mastra/workspace/index.ts:24-25`
  - `id: 'main-workspace', name: 'Workspace'`.
- `/workspaces/gorkie/src/mastra/workspace/network.ts:53-56` -
  `GIT_AUTHOR_NAME: 'gorkie-agent'`, `GIT_AUTHOR_EMAIL:
  'gorkie@agentmail.to'` (same for committer) vs
  `/workspaces/mastra-slack-agent-template/src/mastra/workspace/network.ts:53-56`
  - `'slack-agent'` / `'slack-agent@users.noreply.github.com'`.
- `/workspaces/gorkie/src/mastra/workspace/build-template.ts:53-56` runs
  `git config --global user.name gorkie-agent` / `user.email
  gorkie@agentmail.to` at image-build time; the template's
  `build-template.ts` has no such block at all (git identity is only set at
  sandbox-env time via `network.ts`, not baked into the image).
- `/workspaces/gorkie/src/mastra/lib/logger/index.ts:26` - `name: 'gorkie'`
  vs `/workspaces/mastra-slack-agent-template/src/mastra/lib/logger/index.ts:26`
  - `name: 'orchestrator'`.
- `/workspaces/gorkie/src/mastra/index.ts:27,33,63,66` - storage `id:
  'gorkie-storage'`, `serviceName: 'gorkie'`, log lines `'[gorkie] online'`
  / `'[gorkie] initialization failed'` vs the template's
  `/workspaces/mastra-slack-agent-template/src/mastra/index.ts:27,41,62,65`
  - `'main-storage'`/`'composite-storage'`, `serviceName: 'orchestrator'`,
  `'[agent] online'` / `'[agent] initialization failed'`.
- `/workspaces/gorkie/src/mastra/agents/gorkie.ts:27-29` - `export const
  gorkieAgent = new Agent({ id: config.id, name: 'Gorkie', ...` vs
  `/workspaces/mastra-slack-agent-template/src/mastra/agents/orchestrator.ts:30-32`
  - `const orchestrator = new Agent({ id: config.id, name: 'Orchestrator',
  ...`. Every importer of `gorkieAgent` (`index.ts`, `chat/commands/stop.ts`,
  `signals/email.ts`) also carries the name, so a rename ripples.
- `/workspaces/gorkie/src/mastra/types/channel.ts:6` - `export type
  GorkieRequestContext = ...` vs
  `/workspaces/mastra-slack-agent-template/src/mastra/types/channel.ts:6-8`
  - `export type SlackAgentRequestContext = ...`. Already renamed in the
  template; a real type name, not a literal, so nothing to centralize here.
- `package.json:2` - `"gorkie"` vs `"mastra-slack-agent-template"`.
  `slack-manifest.json`'s `display_information.name`,
  `bot_user.display_name`, and `assistant_view.assistant_description` are
  the Slack-side equivalent (template's copy already reads `"Mastra Agent"`
  / generic description); gorkie's manifest is not checked into
  `/workspaces/gorkie` (it's created directly in the Slack app UI there), so
  there is nothing to diff on that file, only to keep in sync with whatever
  `identity.displayName` ends up being.
- `techwithanirudh/gorkie` attribution only appears in this repo's own
  meta-docs (`TODO.md`, `README.md`, `plans/README.md`), never in
  agent-facing code. Correct as-is; nothing to fix there.

### Structural diff between the two `src/` trees

`find src -name '*.ts' | sort` on both, diffed:

Only in gorkie (not yet in the template):
- `mastra/agents/gorkie.ts` - superseded by `agents/orchestrator.ts`, not a
  gap.
- `mastra/chat/onboarding.ts`, `mastra/lib/allowed-users.ts` - single
  workspace opt-in/allowlist flow gated by `OPT_IN_CHANNEL`. Deployment-
  specific per `TODO.md:18-20` ("assumes gorkie's own deployment... specific
  env vars"); intentionally not ported.
- `mastra/chat/attribution.ts` - `withAttribution()`, a two-line "_sent on
  behalf of <@user>_" footer helper. Already generic (no identity string in
  it); just hasn't been ported. Used by gorkie's `post-message.ts:27-31` to
  attribute cross-target posts; the template's `post-message.ts` doesn't
  attribute at all. Unrelated to identity, worth a separate small port.
- `mastra/chat/preferences.ts` - generic `StateAdapter` key helpers (DM
  anchor, DM-title-set flag, stream-recipient stash, per-user tool-display
  preference). No identity content. The template's
  `chat/state.ts` (334 bytes) is smaller than gorkie's (450 bytes); the
  DM-anchor/stream-recipient logic that TODO.md's "Bugs" section describes
  fixing (`chat/adapter.ts` stashing `{ userId, teamId }`) was reimplemented
  directly in the template's `chat/adapter.ts` rather than via a shared
  `preferences.ts` module. Pure drift, not identity, flagged for the diff
  workflow below, not fixed by this plan.
- `mastra/lib/allowed-users.ts` - see onboarding, same reasoning.
- `mastra/prompts/guardrails.ts` - deferred per `TODO.md:66-72` (tracked,
  not this plan's job to restore).
- `mastra/signals/email.ts` - AgentMail inbox listener wired to
  `gorkieAgent`; single-workspace-specific, not ported.
- `mastra/tools/schedule-reminder.ts` - removed from the template on the
  current branch (`git status` shows `D
  src/mastra/tools/schedule-reminder.ts`) per `TODO.md:43-44`; gorkie still
  has it. Expected, tracked divergence.
- `mastra/tools/slack/get-file.ts` - renamed `get-slack-file.ts` in the
  template. TODO.md's "Confirmed non-issues" note already calls this
  "fully consistent," just a naming diff to remember when diffing.

Only in the template (ahead of gorkie, flows the other direction):
- `mastra/agents/orchestrator.ts`, `mastra/tools/canvas/{create,read,update,index}.ts`,
  `mastra/tools/wait.ts`, `mastra/tools/slack/get-slack-file.ts`. These are
  template features gorkie hasn't picked up yet; call this out explicitly
  because "generalize gorkie -> template" is usually one-directional in the
  maintainer's framing, but canvas tools and `wait` are proof the flow goes
  both ways. Not this plan's scope to port backward, just worth noting so
  the drift workflow below diffs in both directions, not one.

### The self-recognition mechanism gorkie hand-rolled already exists in Mastra

`/workspaces/gorkie/src/mastra/prompts/slack.ts:6` hardcodes three Slack
user ids (prod + 2 dev bot identities) so the model can recognize mentions
of itself in transcript text. But
`node_modules/@mastra/core/dist/channels/types.d.ts:657-680` shows
`ChannelContext` (imported today by both repos' `types/channel.ts`) already
carries:

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

Neither repo's `lib/context.ts` / `prompts/context.ts` reads `botUserId` /
`botMention` today; both only forward `channelId` and `threadId`
(`/workspaces/mastra-slack-agent-template/src/mastra/prompts/context.ts:9-15`,
byte-identical in gorkie). Gorkie's hardcoded prod/dev id list is solving a
problem the channels SDK already solves generically and per-request
correctly. This is the single highest-value fix in this plan: it doesn't
just generalize the hardcoded ids, it deletes an entire category of
"update this when the bot's Slack user id changes" maintenance gorkie
currently has to do by hand across environments.

## Design

Two different kinds of hardcoding are tangled together in the current
strip-down process; treat them differently instead of inventing one big
config object for both.

**Axis 1: internal resource slugs** (agent `id`, sandbox `template` name,
workspace `id`/`name`, logger `name`, storage `id`, `serviceName`, sandbox
git author name/email). These are cosmetic/log-only, not user-facing, and
each repo already independently chose a different generic-enough string
per file (`orchestrator`, `workspace`, `slack-agent`, `main-storage`,
`composite-storage`...). Consolidating these into `identity` would conflate
"what the bot calls itself to a Slack user" with "what string tags a
Postgres storage id," which is a real interface smell, not a simplification.
**Recommendation: leave axis 1 alone.** It costs nothing today (each file
already has its own working default) and isn't what the maintainer's
example ("Gorkie can't do xyz in tool result") is about. Flag it as a
possible follow-up only if it becomes real porting friction.

**Axis 2: user-facing persona and self-reference** (persona/name wording in
`personality.ts` and `core.ts`, the self-recognition mechanism in
`slack.ts`, the "who made me" attribution line, and the repeated `"the
bot"` / `"Gorkie"` literal in tool descriptions and error strings). This is
the actual recurring strip-down cost, and it collapses cleanly into one
small config block plus the `botMention` fix above.

### `identity` config

Add to the existing `src/mastra/config.ts` (not a new file: `config.ts`
already is the documented home for "magic numbers or strings that could
plausibly change per deployment," per `CODING_STANDARDS.md:170-171`, and it
already holds sibling groups `sandbox`, `agent`, `scheduledTasks`,
`toolDisplay`; a new top-level export follows the existing pattern instead
of adding a module):

```ts
export const identity = {
  // Shown to Slack users; keep in sync with slack-manifest.json's
  // display_information.name / bot_user.display_name.
  displayName: 'Mastra Agent',
  // How tool descriptions and errors refer to the assistant in third
  // person. Must read naturally mid-sentence, lowercase-safe.
  selfReference: 'the bot',
  // Optional one-line persona folded into personality.ts. Unset keeps the
  // template's neutral default voice.
  persona: undefined as string | undefined,
  // Optional "who made me" line surfaced in slack.ts. Unset omits it
  // entirely; this is what gorkie's techwithanirudh/gorkie credit becomes
  // once it's a data value instead of a hardcoded sentence.
  attribution: undefined as { repoUrl: string; makers: string } | undefined,
};
```

This is a plain data object, no Zod needed (it's not parsing external
input, it's a compile-time constant a maintainer edits directly, same as
`sandbox.template` today).

### Where each field is consumed

- `prompts/personality.ts` becomes a one-line conditional instead of two
  divergent files:

  ```ts
  import { identity } from '../config';

  const opener = identity.persona
    ? `You are ${identity.displayName}, ${identity.persona}.`
    : 'You are a calm, intelligent, and genuinely helpful AI assistant.';

  export const personalityPrompt = `\
  <personality>
  ${opener} You prioritize correctness, clarity, and usefulness while keeping a natural conversational style.
  ...
  </personality>`;
  ```

  A gorkie-style fork sets `persona: "Gork's sister, with a spark of
  personality. By default, your pronouns are she/it"` and gets the current
  gorkie sentence back verbatim, no file edit.

- `prompts/core.ts` drops its own separate `"You're gorkie."` opener
  entirely. Identity only needs to be stated once; today it's stated twice
  (`core.ts` and `personality.ts`), which is exactly the kind of scattered,
  redundant identity-touch-point the maintainer is asking to collapse.
  `core.ts` keeps pure capability framing ("You can download and process
  media...") with no persona line at all.

- `prompts/slack.ts` drops the hardcoded id block and the attribution
  sentence, replaced by:
  - the `botMention` fix in `prompts/context.ts` (see below), for
    self-recognition, and
  - one conditional line for attribution:

    ```ts
    ${identity.attribution ? `\n\n${identity.displayName}'s source code is at ${identity.attribution.repoUrl}, made by ${identity.attribution.makers}.` : ''}
    ```

- `tools/slack/utils.ts`, `leave-channel.ts`, `delete-message.ts`,
  `edit-message.ts`, `search-slack.ts`, `post-message.ts`: replace every
  literal `'the bot'` (or, pre-strip, `'Gorkie'`) with
  `identity.selfReference`. This is exactly the case
  `CODING_STANDARDS.md:47-50` describes ("When multiple files check the
  same string-literal... export one named union from a single canonical
  location") applied to a phrase instead of a type union: six call sites
  today, all needing the same literal, none of them currently sharing a
  source.

### `botMention` instead of hardcoded self-recognition ids

Extend `prompts/context.ts` (or `lib/context.ts`'s `channelContext`, same
call site either way) to surface the field that's already on
`ChannelContext`:

```ts
export function contextPrompt(requestContext: RequestContext): string {
  const ctx = channelContext(requestContext);
  if (!(ctx.channelId || ctx.threadId || ctx.botMention)) {
    return '';
  }
  const lines: string[] = [];
  if (ctx.channelId) {
    lines.push(`The current channel id is ${ctx.channelId}.`);
  }
  if (ctx.threadId) {
    lines.push(`The current thread id is ${ctx.threadId}.`);
  }
  if (ctx.botMention) {
    lines.push(
      `Your own Slack mention is ${ctx.botMention}; any message containing it is addressed to you.`
    );
  }
  return `<context>\n${lines.join('\n')}\n</context>`;
}
```

This is strictly better than gorkie's current approach, not just a
generalized version of it: it's correct per-request instead of a
maintained prod/dev id list, it needs zero config from a template user, and
it survives a bot user id changing (reinstall, new workspace, dev vs prod)
with no code change at all. Verify `botMention` is actually populated by
`@chat-adapter/slack` for both mention and non-mention events before
relying on it exclusively; if it's only populated on `app_mention` events,
keep the field optional (`if (ctx.botMention)`) so DMs and other event
types degrade gracefully rather than needing a fallback identity list.

### What this does NOT try to solve

- Axis 1 internal slugs (see above), left alone.
- `slack-manifest.json` and `README.md` branding: these are static/meta
  files a template user edits once at setup, not runtime TS. Don't build a
  manifest generator for this; that adds a build step for something
  touched once per fork (against `CODING_STANDARDS.md`'s inline-over-
  extract bias). Instead, add one sentence to `docs/configuration.md`'s
  existing step 3 (Slack app creation) noting that
  `slack-manifest.json`'s `display_information.name` /
  `bot_user.display_name` should match `config.ts`'s `identity.displayName`.
  Revisit only if manifest drift becomes a recurring real problem.
- `prompts/guardrails.ts` restoration: already tracked as deferred in
  `TODO.md:66-72`, out of scope here.
- `chat/attribution.ts` and the `chat/preferences.ts` /
  `chat/state.ts` drift: both are generic (no identity content), just
  unported. Worth doing, but as their own small plan, not folded into an
  identity plan.

## Implementation steps

1. `src/mastra/config.ts`: add the `identity` export (shape above) after
   the existing `toolDisplay` export.
2. `src/mastra/prompts/personality.ts`: import `identity`, add the
   `opener` conditional, drop the hardcoded opener sentence.
3. `src/mastra/prompts/core.ts`: remove the redundant identity opener
   sentence entirely (keep only capability/behavior framing). Update
   `src/mastra/prompts/index.ts` only if the assembly order needs
   adjusting; it shouldn't.
4. `src/mastra/prompts/context.ts`: add the `botMention` line as shown
   above. Confirm `ChannelContext.botMention` / `botUserId` population by
   checking `@chat-adapter/slack`'s emitted context for both
   `assistant_thread_started` and `app_mention` event paths (grep
   `node_modules/@chat-adapter/slack` for where `botMention` is set) before
   relying on it for every event type.
5. `src/mastra/prompts/slack.ts`: drop the self-recognition id block, add
   the conditional attribution line reading `identity.attribution`.
6. `src/mastra/tools/slack/utils.ts`, `leave-channel.ts`,
   `delete-message.ts`, `edit-message.ts`, `search-slack.ts`: replace the
   six `'the bot'` literals with `identity.selfReference`, imported from
   `../../config`.
7. `docs/configuration.md`: add one sentence to step 3 cross-referencing
   `identity.displayName` and the manifest's display fields.
8. `TODO.md`: update the "Process" section (currently `TODO.md:5-26`) to
   name `config.ts`'s `identity` block as the single place future ports
   edit, replacing the current prose list of files-to-strip. Add the diff
   workflow below to the same section.

No changes needed to `src/env.ts` or `.env.example`: `identity` is a
fork-time code edit (like `sandbox.template` already is), not a runtime
secret or per-deployment env toggle.

## Data / schema / config changes

- No new dependencies.
- No Postgres/state shape changes.
- No Slack manifest scopes or event subscriptions change; only the
  documentation cross-reference noted above.
- No new env vars.
- This does not need the "ask first" gate in `CLAUDE.md` (no dependency
  change, no schema-shape change, no destructive git operation); it's a
  same-shape refactor of existing prompt/tool strings plus one additive
  config export.

## Risks & open questions

- **`botMention` availability**: needs verifying against the pinned
  `@chat-adapter/slack` version before removing the hardcoded id fallback
  outright. If it's only populated on some event types, keep `slack.ts`'s
  general mention-syntax guidance (lines 1-4, unrelated to self-
  recognition) untouched and only gate the new self-recognition line on
  `ctx.botMention` being present, so behavior degrades to "no explicit
  self-recognition hint that turn" rather than breaking.
- **`identity.persona` shape**: the sketch above assumes a single string
  slotted into one sentence. Gorkie's actual persona text spans pronouns,
  a nickname ("Gork's sister"), and a personality-vs-instructions
  precedence rule (`core.ts:5-6`, about saved custom instructions
  overriding default persona). That precedence rule is really about
  `custom-instructions.md` (a separate planned feature per
  `plans/README.md`), not identity; if that feature lands first, revisit
  whether `identity.persona` needs a richer shape or stays a single
  sentence.
- **Whether `selfReference` should ever need capitalization variants**: all
  six current call sites use it mid-sentence, lowercase-safe. If a future
  string needs it sentence-initial, that's a `identity.selfReference[0]
  .toUpperCase() + ...` call at the call site, not a second config field;
  don't add one speculatively.
- **Maintainer must decide**: whether `identity.attribution` should ever
  default to something for the template itself (e.g., crediting
  `mastra-slack-agent-template` as a Mastra example), or stay `undefined`
  by default as sketched. Recommend `undefined`, template stays silent
  about its own provenance to end Slack users.

### Drift-detection workflow

Not shipped as a `package.json` script: it hardcodes a path
(`/workspaces/gorkie`) that only exists in the maintainer's own dev
environment, never in a template fork's. Document it in `TODO.md`'s
"Process" section as a manual maintainer command instead:

```bash
# Structural diff: files present on only one side.
comm -13 \
  <(cd /workspaces/mastra-slack-agent-template/src && find . -name '*.ts' | sort) \
  <(cd /workspaces/gorkie/src && find . -name '*.ts' | sort)   # gorkie-only
comm -23 \
  <(cd /workspaces/mastra-slack-agent-template/src && find . -name '*.ts' | sort) \
  <(cd /workspaces/gorkie/src && find . -name '*.ts' | sort)   # template-only

# Content diff on files that should track gorkie closely (post-refactor,
# these should differ only in the identity.ts import/data line, if at all).
for f in mastra/prompts/core.ts mastra/prompts/personality.ts \
         mastra/prompts/slack.ts mastra/prompts/tools.ts \
         mastra/tools/slack/utils.ts mastra/tools/slack/post-message.ts \
         mastra/chat/adapter.ts mastra/chat/handlers.ts; do
  diff -u "/workspaces/mastra-slack-agent-template/src/$f" "/workspaces/gorkie/src/$f"
done
```

Maintain two explicit lists next to this command in `TODO.md`:

- **Expected to diverge permanently**: `chat/onboarding.ts`,
  `lib/allowed-users.ts`, `signals/email.ts`, `agents/gorkie.ts` vs
  `agents/orchestrator.ts`, `prompts/guardrails.ts` (while deferred),
  `package.json`'s `name`, `slack-manifest.json`, all of axis 1 (internal
  slugs).
- **Should track near-identically after this plan**: `prompts/core.ts`,
  `prompts/personality.ts`, `prompts/slack.ts`, and the six tool files
  touched in step 6. Use the size of the remaining diff on this list as
  the plan's own success metric: run the diff before merging this plan and
  after, and confirm it shrinks to near-zero (import line plus a data
  value) instead of full-sentence rewrites.

Run this after each gorkie -> template port session, not on a calendar; it
only needs to happen when something actually moved.

## Effort & priority

**S.** Roughly 10 files touched, all same-shape edits (add an import, swap
a literal, add a conditional), one additive config export, no new
dependencies, no schema changes. The `botMention` verification step
(implementation step 4) is the only part that isn't purely mechanical and
should be done first, since it determines whether `prompts/slack.ts`'s
self-recognition block can be deleted outright or needs to keep a
degraded-mode fallback.

No dependency on other plans in this folder. `custom-instructions.md`
(persona/tone/addressing precedence) may want to reuse or extend
`identity.persona`'s shape once it lands; this plan should land first
since it's the smaller, foundational piece.
