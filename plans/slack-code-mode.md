# Least-privilege Slack code-mode tool

## Summary

Collapse the mutating Slack tools (post, edit, delete, canvas CRUD, pin, set
topic, wait) into a single scoped `createCodeMode()` tool so the model
orchestrates multi-step Slack operations (e.g. "post an update, pin it, and
retitle the channel") as one generated TypeScript function instead of several
separate agentic turns. This shrinks the always-visible tool surface, cuts
round-trips for multi-tool Slack sequences, and gives a template user exactly
one place to control which Slack mutations the agent may call, at the cost of
losing per-action Slack tool cards in favor of one generic "Slack Code" card.

## Current state

**This repo's Slack tool inventory** (`src/mastra/tools/slack/`, 13 tools):
`search-slack.ts`, `read-conversation-history.ts`, `list-threads.ts`,
`get-user.ts`, `get-channel-info.ts`, `get-slack-file.ts`, `upload-file.ts`,
`post-message.ts`, `edit-message.ts`, `delete-message.ts`, `leave-thread.ts`,
`leave-channel.ts`, `summarize-thread.ts`, aggregated into `slackTools` at
`src/mastra/tools/slack/index.ts:15-28`. Canvas tools live separately:
`src/mastra/tools/canvas/{create,read,update}.ts`, aggregated into
`canvasTools` at `src/mastra/tools/canvas/index.ts:5-8`. There is no
`pin_message` or `set_channel_topic` tool anywhere in this repo or in gorkie
today (confirmed by `find` across both trees) — these are net-new.

All tools are merged onto the orchestrator agent at exactly one place,
`src/mastra/tools/base.ts:12-23`:

```ts
export const baseTools = {
  ...slackTools,
  ...scheduledTaskTools,
  ...canvasTools,
  skip: skipTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  grep: grepTool,
  wait: waitTool,
  generate_image: generateImageTool,
  ...mcpTools,
};
```

This is already the "single obvious registration point" the template goals
ask for; the plan should keep using it, not add a second one.

**Ownership scoping is currently absent.** `src/mastra/tools/slack/utils.ts`
today only has `joinChannel` and `formatMessage`. Per
`TODO.md:73-86` ("DEFERRED (pending code-mode refactor)"), the guards gorkie
`dev` has under `tools/slack/utils.ts` — `assertCanPostTo`,
`assertReadableChannel`, `assertCanManagePostedMessage` +
`recordPostedMessage` — were intentionally dropped from this template with a
note that they'd be re-added "as part of that refactor", i.e. this one. See
`/workspaces/gorkie/src/mastra/tools/slack/utils.ts:40-129` for the exact
functions (quoted in full below). TODO.md's own nuance: `post_message` should
stay broadly open for agent-authored posts; only the *send-as-user* case needs
locking down (cross-ref `plans/send-as-user.md`), while edit/delete need
bot-authored-message ownership checks (cross-ref
`plans/message-ownership-scoping.md`). Both of those plans are siblings to
this one in `plans/` per `plans/README.md`; this plan depends on their
ownership model but does not redefine it.

**Gorkie has no code-mode precedent.** `grep -rln "codeMode\|CodeMode\|code-mode"` across
`/workspaces/gorkie/src` returns nothing, and gorkie has no canvas, pin, or
topic tools. This deviates from `TODO.md`'s normal "gorkie first" process
(TODO.md:5-26) because the maintainer is originating this feature directly in
the template. Once it's proven out here, it should be back-ported to gorkie
with its own identity/ownership wiring, not the other way around.

**`createCodeMode` is real and already available**, verified directly against
the pinned version, not the changelog or a sourcemap:

- `package.json:12` pins `"@mastra/core": "1.50.0"` (patched via
  `patches/@mastra+core@1.50.0.patch`, which only touches token-overhead
  accounting in `chunk-JGDMZZAO.js`/`chunk-EVJSSG7F.cjs` — it does not touch
  any code-mode file, confirmed by grep).
- `node_modules/@mastra/core/dist/tools/index.d.ts:8`: `export * from './code-mode/index.js';`
- `node_modules/@mastra/core/dist/tools/index.cjs:74-84` defines real runtime
  getters for `createCodeMode`, `createCodeModeInstructions`, and
  `createCodeModeTool` (not just `.d.ts`/sourcemap hits — the earlier grep
  that only matched sourcemaps was incomplete; the runtime export is genuinely
  there).
- `node_modules/@mastra/core/CHANGELOG.md:6144`: "Added experimental Code Mode
  for agents... Tools still run on the host with full validation and tracing;
  only the orchestration code runs in a workspace sandbox." Shipped in
  `@mastra/core@1.38.0`.
- Docs (bundled at
  `node_modules/@mastra/core/dist/docs/references/docs-agents-code-mode.md`
  and confirmed live via `WebFetch` of
  `https://mastra.ai/docs/agents/code-mode`) mark it **Beta**: "Breaking
  changes may occur without a major version bump until the API is stable."

**The per-thread E2B sandbox is already wired onto the agent.**
`src/mastra/workspace/index.ts:23-75` defines `workspace` (a `Workspace` whose
`sandbox` factory returns a per-thread `E2BSandbox` from
`src/mastra/workspace/sandbox.ts:7-27`), and
`src/mastra/agents/orchestrator.ts:26,43` passes that same `workspace` to the
`Agent` constructor. This means the orchestrator already has a `WorkspaceSandbox`
available at every request — the same one `execute_command`/filesystem tools
use — so code-mode does not need its own sandbox instance (see Design).

## Design

### API shape (verified against `@mastra/core@1.50.0`)

`createCodeMode(config, transport?)` returns `{ tool, instructions }`
(`node_modules/@mastra/core/dist/tools/code-mode/code-mode.d.ts:30`).
`config: CodeModeConfig`
(`node_modules/@mastra/core/dist/tools/code-mode/types.d.ts:15-32`):

```ts
export interface CodeModeConfig {
  tools: ToolsInput; // exposed as external_<id>; only these are callable
  sandbox?: WorkspaceSandbox; // falls back to the agent's workspace sandbox
  timeout?: number; // ms, default 30000
  id?: string; // generated tool id, default 'execute_typescript'
}
```

`instructions` is generated text with one
`declare function external_<name>(...)` per tool
(`node_modules/@mastra/core/dist/tools/code-mode/stub-generator.d.ts:22-35`);
it must be added to the agent's system prompt for the model to know the
functions exist — `createCodeMode()` does not inject it automatically.

Calling `createCodeMode()` more than once with distinct `id`s gives an agent
several independently-scoped code tools; "It can only call the `external_*`
functions for the tools passed to its own `createCodeMode()` call, so the
subsets stay isolated" (`docs-agents-code-mode.md:101`, confirmed live via
WebFetch). This is the exact mechanism the maintainer's "possibly a second
code-mode for email" idea would use — see Risks for why this plan does not
build that one now.

### The crux: how secrets stay host-side (verified in source, not docs prose)

Reading `node_modules/@mastra/core/dist/chunk-EVJSSG7F.cjs:4449-4497`
(`createCodeModeTool`'s `execute`), the dispatch closure is:

```js
const dispatch = async (toolId, args) => {
  const tool2 = toolsById.get(toolId);
  const result = await tool2.execute(args, {
    mastra: ctx?.mastra,
    requestContext: ctx?.requestContext,
    abortSignal: ctx?.abortSignal,
    workspace: ctx?.workspace,
  });
  return result;
};
```

`createCodeModeTool()`'s own `execute` function is itself a normal Mastra
tool `execute`, which per this repo's architecture runs on the **host**
agent process (CLAUDE.md: "The agent brain runs on the host"). `dispatch`
calls `tool2.execute(...)` — the *real* `post_message`/`pin_message`/etc.
tool — directly on the host, inside this same closure, with full access to
`slack.webClient` (which holds `SLACK_BOT_TOKEN` from `src/env.ts`). Only
`transport.run({ sandbox, program, toolIds, dispatch, ... })` crosses into
the sandbox, and `program` is the model-authored TypeScript with no
credentials in it — it only sees typed `external_post_message(...)` stubs.
Concretely: **the Slack token never serializes into anything that enters the
sandbox.** This matches CLAUDE.md's "Never put secrets... into the sandbox"
boundary by construction, not by extra work this plan has to do.

### The gap: the default transport does not work against a remote sandbox

This is the part that needed verifying past the docs, since the docs never
mention non-local sandboxes explicitly. Reading
`StdioCodeModeTransport.run()` in full
(`node_modules/@mastra/core/dist/chunk-EVJSSG7F.cjs:4289-4417`):

```js
const dir = await fs.mkdtemp(nodePath.join(os2.tmpdir(), "mastra-code-mode-"));
// ...writes program-*.ts and runner-*.mjs into `dir` using node:fs (HOST filesystem)
const handle = await sandbox.processes.spawn(
  `node --experimental-strip-types ${runnerPath}`,
  { cwd: dir, abortSignal, onStdout: ... }
);
```

`fs`/`os`/`path` here are Node's host built-ins (imported at the top of the
same chunk), so `dir` is a directory on the **host** machine's `os.tmpdir()`.
The runner script is written there, then `sandbox.processes.spawn(...)` is
asked to run it with `cwd: dir` — a host path.

For `LocalSandbox`, this is fine by design: its process manager "run[s] as
child processes on the local machine using `child_process.spawn`"
(`node_modules/@mastra/core/dist/docs/references/reference-workspace-local-sandbox.md:117-119`),
i.e. sandbox == host filesystem, so the host tmp path trivially resolves.

For `E2BSandbox`, it does not. `E2BProcessManager.spawn`
(`node_modules/@mastra/e2b/dist/index.cjs:499-520`) forwards `cwd` verbatim
into E2B's remote API:

```js
const e2bHandle = await e2b.commands.run(command, {
  background: true, stdin: true, cwd: options.cwd, envs, timeoutMs: options.timeout, ...
});
```

`e2b.commands.run`'s `cwd` is a path **inside the remote sandbox VM**, not
the host. There is no file-upload step anywhere in
`StdioCodeModeTransport.run()` — it never calls anything like
`sandbox.files.write` before spawning. So `cwd: <host tmp dir>` and the
literal host path baked into the spawn command
(`node --experimental-strip-types /tmp/mastra-code-mode-xxxx/runner-xxxx.mjs`)
point at a path that does not exist on the remote E2B VM. The default
transport, run as-is against this repo's `E2BSandbox`, is expected to fail
(ENOENT on the runner script) the first time the model calls the code-mode
tool.

The only sandbox/config combination the default transport actually supports
is `sandbox: new LocalSandbox()` — which the docs themselves flag as running
"the function as a host `node` process with host privileges, so only use it
for trusted or local development"
(`docs-agents-code-mode.md:28`). That is precisely what CLAUDE.md forbids:
"Never run user/agent code on the host. E2B sandbox only; nothing else
touches our OS." **`LocalSandbox` is not an option for this repo.**

**Recommendation: ship a small custom `CodeModeTransport` for E2B.** It
reuses the exact same stdout/stdin JSON-RPC protocol (which does cross the
E2B boundary fine — `onStdout`/`sendStdin` are exactly what
`src/mastra/tools/workspace`'s `execute_command`/`get_process_output` tooling
already relies on today via the same `E2BProcessManager`), and only replaces
the file-placement step:

1. Write `program`/`runner` into the sandbox via the underlying E2B SDK's
   file API, not `node:fs`. `E2BSandbox` exposes the raw SDK sandbox via
   `get e2b(): Sandbox`
   (`node_modules/@mastra/e2b/dist/sandbox/index.d.ts:155`), which has
   `.files.write(path, content)` — already used this way elsewhere in
   `@mastra/e2b` for writing credentials/config into a sandbox
   (`node_modules/@mastra/e2b/dist/index.cjs:120,196,423,1101`).
2. Write into a path under the sandbox's own workdir,
   `sandbox.workdir` config = `'/home/user'` (`src/mastra/config.ts:4`, same
   convention `E2BFilesystem`/`createSandbox` already use), e.g.
   `/home/user/.mastra-code-mode/<random>/`.
3. Spawn with `cwd` set to that in-sandbox path instead of the host tmp dir.
4. Keep everything else — frame parsing, RPC dispatch, timeout race,
   cleanup — identical to `StdioCodeModeTransport`.

This is a genuine ~100-line file, not a one-liner, so it earns its place per
CODING_STANDARDS.md's "deletion test." Before writing it, do a 10-minute
smoke test first (call `createCodeMode` with a single trivial tool against a
real resolved `E2BSandbox` from this repo's `workspace`, and observe whether
it fails exactly as predicted) — cheap, and turns "we're confident from
static reading" into "we verified it," which is worth doing before writing
~100 lines other engineers will trust.

### Sandbox sourcing: don't build a second sandbox

`config.sandbox` is optional: `const sandbox = config.sandbox ?? ctx?.workspace?.sandbox;`
(`chunk-EVJSSG7F.cjs:4460`). Since `orchestrator.ts:43` already passes
`workspace` to the `Agent`, **omit `sandbox` in `createCodeMode()`** and let
it resolve the same per-thread `E2BSandbox` the filesystem/shell tools
already use for that thread. This avoids spinning up a second sandbox per
thread and keeps one lifecycle to reason about. Only the custom `transport`
(second positional arg to `createCodeMode(config, transport)`) needs to be
E2B-aware; `sandbox` sourcing stays automatic.

### What gets wrapped, and what stays a plain tool

TODO.md's own roadmap line (`TODO.md:156-160`) already specifies the intended
scope precisely: "post_message, edit/delete own messages, canvas CRUD, pin a
message, set channel topic, and a wait tool." This plan follows that scope
literally:

| external_* function | Source |
|---|---|
| `post_message` | existing, `src/mastra/tools/slack/post-message.ts` |
| `edit_message` | existing, `src/mastra/tools/slack/edit-message.ts` (gains ownership check, cross-ref `plans/message-ownership-scoping.md`) |
| `delete_message` | existing, `src/mastra/tools/slack/delete-message.ts` (same) |
| `create_canvas` | existing, `src/mastra/tools/canvas/create.ts` |
| `read_canvas` | existing, `src/mastra/tools/canvas/read.ts` |
| `update_canvas` | existing, `src/mastra/tools/canvas/update.ts` |
| `pin_message` | **new**, wraps `slack.webClient.pins.add`/`pins.remove` |
| `set_channel_topic` | **new**, wraps `slack.webClient.conversations.setTopic` |
| `wait` | existing, `src/mastra/tools/wait.ts` |

Both new Slack Web API methods are present on the pinned `@slack/web-api`
client, confirmed in
`node_modules/@slack/web-api/dist/methods.d.ts:976` (`setTopic`) and
`:1180-1194` (`pins.add`/`pins.list`/`pins.remove`).

Everything else stays a plain top-level tool: reads (`search_slack`,
`read_conversation_history`, `list_threads`, `get_user`, `get_channel_info`,
`get_slack_file`), `upload_file`, `leave_thread`/`leave_channel`,
`summarize_thread`. These are either read-only, already narrowly scoped, or
used on nearly every turn (forcing them through code-mode would add
indirection without a least-privilege benefit, since reads aren't the risk
surface). `post_message` deliberately stays reachable for ordinary
agent-authored posts too — see the "un-confusing" note below on why this
does **not** mean duplicating the tool.

**Only one registration per tool id.** Once `post_message`, `edit_message`,
`delete_message`, `create_canvas`, `read_canvas`, `update_canvas`, and `wait`
move into the code-mode allow-list, they must be **removed** from
`slackTools`/`canvasTools`/`baseTools`'s top-level maps. Registering the same
tool object both standalone and inside code-mode would double the schema
cost this feature exists to cut, and would confuse the model about which
surface to use for the same action.

### Ergonomics: the one place a template user edits

`src/mastra/tools/base.ts` stays the single registration point (goal: "a
single obvious registration point over scattered wiring"). Sketch of the end
state:

```ts
// src/mastra/tools/slack-code/tools.ts
import { createCanvasTool } from '../canvas/create';
import { readCanvasTool } from '../canvas/read';
import { updateCanvasTool } from '../canvas/update';
import { deleteMessageTool } from '../slack/delete-message';
import { editMessageTool } from '../slack/edit-message';
import { postMessageTool } from '../slack/post-message';
import { pinMessageTool } from './pin-message';
import { setChannelTopicTool } from './set-channel-topic';
import { waitTool } from '../wait';

export const slackCodeModeTools = {
  post_message: postMessageTool,
  edit_message: editMessageTool,
  delete_message: deleteMessageTool,
  create_canvas: createCanvasTool,
  read_canvas: readCanvasTool,
  update_canvas: updateCanvasTool,
  pin_message: pinMessageTool,
  set_channel_topic: setChannelTopicTool,
  wait: waitTool,
};
```

```ts
// src/mastra/tools/slack-code/index.ts
import { createCodeMode } from '@mastra/core/tools';
import { E2BCodeModeTransport } from './transport';
import { slackCodeModeTools } from './tools';

export const slackCode = createCodeMode(
  { id: 'slack_code', tools: slackCodeModeTools },
  new E2BCodeModeTransport()
);
```

```ts
// src/mastra/tools/base.ts (final shape)
import { slackCode } from './slack-code';

export const baseTools = {
  ...slackTools, // now excludes post/edit/delete/message, kept for reads etc.
  ...scheduledTaskTools,
  ...canvasTools, // now excludes create/read/update
  slack_code: slackCode.tool,
  skip: skipTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  grep: grepTool,
  generate_image: generateImageTool,
  ...mcpTools,
};
```

A template user who wants to add another Slack mutation later touches
exactly `slack-code/tools.ts` (add the import and the map entry) — no
change to `base.ts`, no new wiring elsewhere. A user who wants the feature
off entirely deletes `tools/slack-code/`, restores the 7 moved tools into
`slackTools`/`canvasTools`, and removes the one `slack_code` line from
`base.ts` — no other file references it (see Risks for the one instructions
wiring exception).

### Prompt/instructions wiring

`createCodeMode()` does not auto-inject `instructions` into the agent; this
repo's system prompt is assembled in `src/mastra/prompts/index.ts:9-25` from
`[corePrompt, personalityPrompt, slackPrompt, toolsPrompt]`
(`prompts/index.ts:16`). Add `slackCode.instructions` to that join, e.g. a
new `slackCodeInstructions` export alongside `toolsPrompt` so the model has
the typed `external_*` stub list. This is a straight text append, no new
plumbing.

### Studio / token-cost / tool-card trade-offs

- **Fewer round-trips, not smaller schemas, is the actual saving.** Per the
  docs' own framing ("Fewer round-trips: A multi-tool query runs in one tool
  call instead of repeating the agentic loop for every tool decision"), the
  win is collapsing e.g. "post, pin, retitle" from 3 separate agent turns
  (3 full context re-sends, 3 model invocations) into 1 turn that issues one
  `execute_typescript` call. That is the dominant cost lever for Slack
  workflows that chain 2+ mutations, which is common for "ship an update and
  pin it" style requests.
- **Tool-list schema size shrinks too, but modestly.** 9 tool schemas
  (several discriminated unions: `edit-message.ts:11-23`,
  `delete-message.ts:11-18`) collapse into one `{ code: string }` schema
  (`codeModeInputSchema`, `chunk-EVJSSG7F.cjs:4426-4430`) plus one static
  instructions block appended to the system prompt. The instructions block is
  fixed per agent (not re-derived per call), so it behaves like the rest of
  `toolsPrompt` — a one-time prompt-token cost, not a per-tool-call one.
- **Tool cards regress to one generic card.** `chat/tool-display/index.ts:7-47`
  renders cards purely from `event.toolName`/`displayName` plus
  `formatInput`/`formatResult` (`chat/tool-display/format.ts`). A code-mode
  call will render as one "Slack Code" card whose input is the raw generated
  TypeScript (truncated at `config.toolDisplay.maxDetails` = 1200 chars,
  `src/mastra/config.ts:18-22`) instead of separate "Post message" / "Pin
  message" cards. This is a real UX cost, already implicitly accepted by the
  maintainer putting this on the roadmap; mitigate by keeping the generated
  code's `console.log` calls short and structured, since `logs` is what
  `formatResult` surfaces on success (`chat/tool-display/format.ts:78-99`
  reads `result.message`/`result.output`/etc., but the code-mode tool's own
  `outputSchema` returns `{ success, result, logs, error }`
  (`chunk-EVJSSG7F.cjs:4431-4440`) — `formatResult` falls through to
  stringifying the whole object, so double-check this renders acceptably
  during implementation and add a `logs`-first branch to `formatResult` if it
  doesn't).
- **Un-confusing:** this does not add a new decision axis to `base.ts`. It
  removes 6 entries and adds 1. The only new branchy-looking thing is
  `slack-code/tools.ts`'s own map, which is exactly as flat as
  `slackTools`/`canvasTools` already are.

### Alternatives considered

- **Do nothing / keep discrete tools.** Rejected: doesn't address the
  explicit roadmap ask, and multi-step Slack sequences stay expensive in
  round-trips.
- **`sandbox: new LocalSandbox()`.** Rejected outright: violates CLAUDE.md's
  E2B-only boundary; the docs' own warning label ("host privileges... only
  for trusted or local use") makes this a non-starter for a Slack bot with
  real tokens in-process.
- **A second code-mode tool for email/AgentMail tools.** The maintainer was
  unsure; TODO.md itself already records "decided against it for now." Keep
  it that way in this plan too — see Risks for why the mechanism would be
  trivial to add later (just another `createCodeMode({ id: 'email_code', ... })`
  call) but isn't justified yet given AgentMail tools live inside the E2B
  sandbox already (per `src/mastra/workspace/sandbox.ts:20`, "AgentMail...
  credentials... are brokered by the host through sandbox network rules"),
  not as host-side Mastra tools — there's nothing to wrap yet.

## Implementation steps

1. **Smoke-test the transport gap** (throwaway script, not committed):
   resolve a real `E2BSandbox` via `workspace.resolveSandbox({ requestContext })`
   and call `createCodeModeTool({ tools: { wait: waitTool } })`'s `execute`
   directly (or exercise it through a minimal agent run) to confirm the
   default `StdioCodeModeTransport` fails as predicted (ENOENT / spawn
   failure) before investing in the custom transport.
2. **`src/mastra/tools/slack-code/pin-message.ts`**: new tool, Zod input
   mirroring `edit-message.ts`'s `source: 'url' | 'id'` discriminated union
   plus an `action: 'pin' | 'unpin'` enum (default `'pin'`), calling
   `slack.webClient.pins.add`/`pins.remove` with `{ channel, timestamp }`.
3. **`src/mastra/tools/slack-code/set-channel-topic.ts`**: new tool, Zod
   input `{ channelId?: string, topic: string }` defaulting to the current
   channel via `channelContext(context?.requestContext)` (same pattern as
   `canvas/create.ts:22-27`), calling `slack.webClient.conversations.setTopic`.
4. **`src/mastra/tools/slack-code/transport.ts`**: `E2BCodeModeTransport`
   implementing `CodeModeTransport.run()`, mirroring
   `StdioCodeModeTransport`'s frame protocol but writing program/runner via
   `sandbox.e2b.files.write(...)` into `${sandbox config.workdir}/.mastra-code-mode/<id>/`
   and spawning with that in-sandbox `cwd`. Skip this step (use the default
   transport) only if step 1's smoke test disproves the predicted failure.
5. **`src/mastra/tools/slack-code/tools.ts`**: the allow-list map shown in
   Design, importing existing tool objects from their current files (no
   file moves).
6. **`src/mastra/tools/slack-code/index.ts`**: `createCodeMode({ id:
   'slack_code', tools: slackCodeModeTools }, new E2BCodeModeTransport())`,
   exporting `{ tool, instructions }` renamed to fit this module (e.g.
   `slackCodeTool`, `slackCodeInstructions`) per this repo's naming
   convention of exporting the concrete thing, not the factory result as-is.
7. **Ownership scoping**: land `plans/message-ownership-scoping.md`'s
   `assertCanManagePostedMessage`-equivalent inside `edit-message.ts`/
   `delete-message.ts` (or a shared `slack-code/ownership.ts` if that plan
   says otherwise) before wiring them into the allow-list, so the code-mode
   surface doesn't ship with less scoping than gorkie already proved out.
8. **`src/mastra/tools/slack/index.ts`**: remove `post_message`,
   `edit_message`, `delete_message` from the `slackTools` map (keep the
   files; only stop double-registering).
9. **`src/mastra/tools/canvas/index.ts`**: remove `create_canvas`,
   `read_canvas`, `update_canvas` from `canvasTools`.
10. **`src/mastra/tools/base.ts`**: drop the standalone `wait: waitTool`
    line, add `slack_code: slackCode.tool`.
11. **`src/mastra/prompts/tools.ts`** (or a new small export next to it):
    append `slackCode.instructions` into the system prompt assembly in
    `src/mastra/prompts/index.ts:16`.
12. **`slack-manifest.json`**: add scopes (see Data/schema/config changes).
    Requires reinstalling the Slack app, same as other manifest changes this
    template has already made (TODO.md notes this pattern repeatedly).
13. **`chat/tool-display/format.ts`**: verify `formatResult` renders the
    code-mode tool's `{ success, result, logs, error }` shape acceptably;
    add a `logs`-first branch if the default JSON dump reads poorly in
    Slack.
14. **`TODO.md`**: check off the roadmap line (`TODO.md:156-160`) and add a
    "Recently completed" entry once shipped.
15. Run `bun run typecheck`, `bun run check`, `bun run check:spelling` per
    CLAUDE.md's Validation section. Ask the user to exercise a real
    multi-step Slack scenario in their running bot instance rather than
    starting a second `mastra dev`/`mastra start` (CLAUDE.md boundary).

## Data / schema / config changes

- **Slack manifest scopes** (`slack-manifest.json`, currently
  `slack-manifest.json:23-48`): add `pins:write` (for `pins.add`/`pins.remove`)
  and, for least privilege, the narrow topic scopes rather than the broad
  `channels:manage`/`groups:write` — `channels:write.topic` (public
  channels) and `groups:write.topic` (private channels), per Slack's own
  scope docs (verified via web search against
  `https://docs.slack.dev/reference/methods/conversations.setTopic/` and
  `https://docs.slack.dev/reference/scopes/groups.write.topic/`). Requires
  reinstalling the Slack app, consistent with prior manifest changes logged
  in `TODO.md`.
- **No new env vars.** Reuses `SLACK_BOT_TOKEN` (already read via
  `src/env.ts` into `slack.webClient`) and `E2B_API_KEY` (already read into
  `workspace`'s `E2BSandbox`). No `.env.example` change needed.
- **No new dependency.** `createCodeMode` ships inside the already-pinned
  `@mastra/core@1.50.0`; no `package.json` change, so this does not trip
  CLAUDE.md's "ask first: dependency changes" gate. Flag this explicitly
  since it's easy to assume a beta feature needs a version bump — it
  doesn't, here.
- **No Postgres schema change.** If ownership recording is needed (per
  `plans/message-ownership-scoping.md`), it reuses the existing
  `chat().getState().set(key, value)` key/value mechanism gorkie's
  `recordPostedMessage` already uses
  (`/workspaces/gorkie/src/mastra/tools/slack/utils.ts:74-101`), the same
  primitive this template already uses for the `titled` per-thread flag and
  the scheduled-task recipient stash (`TODO.md:127-129`) — no migration.

## Risks & open questions

- **Beta API.** `@mastra/core`'s own docs warn code-mode may have breaking
  changes without a major version bump. Pin the exact behavior this plan
  relies on (the `dispatch`/`sandbox` fallback shape) with a smoke test in
  CI or at minimum a manual check after any `@mastra/core` bump.
- **The custom transport is the highest-risk, highest-value part of this
  plan.** It's the one piece of new infrastructure code, and it's currently
  based on careful static reading of the compiled source, not a live test
  against E2B. Do the smoke test (step 1) before writing it; if the
  hypothesis is wrong (e.g. E2B's `commands.run` turns out to auto-sync a
  scratch dir, which nothing in the source suggests but hasn't been run
  live), the plan simplifies to "just omit `sandbox` and use the default
  transport."
- **Ownership scoping is a hard dependency, not a nice-to-have.** Folding
  `edit_message`/`delete_message` into a code-mode allow-list without first
  restoring `assertCanManagePostedMessage` would ship a *wider* blast radius
  than today's already-unscoped tools (a single generated program could
  chain edit+delete across multiple messages in one call). Sequence step 7
  before step 8, not after.
- **Tool-card regression is real and one-way.** Once `post_message` etc.
  move into code-mode, Slack users lose the discrete "Posted to #general"
  card in favor of a generic "Slack Code" card. If this proves confusing in
  practice, the fallback is keeping `post_message` as a standalone
  top-level tool (frequent, low-risk, single-action) while only
  edit/delete/canvas/pin/topic/wait go through code-mode — a smaller version
  of this plan's scope. Flag as a decision to revisit after a week of real
  usage, not something to pre-decide now.
- **`external_wait` calls block the RPC round-trip on the host**, i.e. a
  generated program awaiting `external_wait({ seconds: 30 })` holds the
  sandboxed process (and the host dispatch call) open for 30s. This is the
  same behavior `wait` already has standalone; code-mode doesn't change the
  cost, just where it's invoked from.
- **Second code-mode for email/AgentMail**: explicitly deferred (TODO.md
  already says "decided against it for now"). Revisit only once AgentMail
  gains host-side Mastra tools to wrap — today AgentMail is sandbox-only
  credential brokering (`src/mastra/workspace/sandbox.ts:20`), so there is
  nothing to scope yet.
- **`formatResult`'s rendering of the code-mode output shape** needs a
  manual check in Slack once implemented; it's an assumption in this plan
  (see Design) that the default JSON-dump fallback may need a small
  `logs`-first branch.

## Effort & priority

**M.** No new dependency and no schema migration keep it from being L, but
it touches 6+ existing tool files' registration, needs one genuinely new
~100-line transport class verified against a live sandbox, and depends on
`plans/message-ownership-scoping.md` landing first (sequencing risk, not
size risk). Priority: matches its position in `TODO.md`'s Roadmap section
(not the Active work stream), so it's next after items already in flight.
Blocked on `plans/message-ownership-scoping.md`; loosely related to
`plans/send-as-user.md` (both touch `post_message`'s authorization model,
but target different misuse cases per TODO.md's own nuance).
