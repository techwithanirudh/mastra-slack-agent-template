# MCP support: firm up built-in servers, let end users add their own

## Summary

Two deliverables. First, firm up how this template ships built-in MCP
servers: replace the blocking top-level-await Context7 example with a
config-driven, error-tolerant, opt-in map, closing the open `TODO.md`
verification item about shipping a live auto-spawned external MCP by
default. Second, let Slack end users register their own MCP servers at
runtime (name + URL + auth header), scoped strictly to the registering
user, surfaced through a modal reachable from the App Home tab's existing
"More settings coming soon" placeholder. Runtime user MCPs must use the
existing `ToolSearchProcessor` path so their schemas stay out of the default
tool list.

## Current state

**Built-in MCP, this repo.** `src/mastra/mcp/index.ts:1-11`:

```ts
import { MCPClient } from '@mastra/mcp';

export const mcpTools = await new MCPClient({
  id: 'mcp',
  servers: {
    context7: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  },
}).listTools();
```

This is a top-level `await`: importing this module (transitively, importing
`orchestrator.ts`) blocks until an `npx -y @upstash/context7-mcp` child
process spawns, resolves its package from the npm registry, and completes
the MCP stdio handshake, or until the client's default 60s timeout
(`reference-tools-mcp-client.md:25`, "Default: `60000`") elapses. There is
no error handling around it. `tools/base.ts:1,22` spreads `mcpTools` (the
already-`listTools()`-resolved object) into `baseTools`, and
`orchestrator.ts:55` passes `baseTools` to the `Agent` constructor as a
static object. `docs/adding-mcps.md` documents exactly this pattern as "the
template includes a working Context7 example," and its step 2 tells a
template user to add more servers to the same `servers` map. `TODO.md`'s
own regression sweep already flagged this as unresolved: "VERIFY:
`mcp/index.ts` ships a live default MCP server... Confirm shipping a
template with an auto-spawned external MCP by default is intended"
(`TODO.md`, Gorkie regression sweep section), and the Roadmap section lists
"MCP support: firm up the built-in MCP servers, then let end users add
their own MCPs" as a distinct, not-yet-started line, separate from "MCP
emoji proxy" (also unstarted).

**Built-in MCP, gorkie.** `/workspaces/gorkie/src/mastra/mcp/index.ts`
(3 lines): `new MCPClient({ id: 'mcp-client', servers: {} })` with an empty
server map. Gorkie has *not* built this out further, contrary to the usual
"gorkie is ahead" assumption in `TODO.md`'s Process section: this template
is currently ahead of gorkie on built-in MCP (it actually wires up
Context7; gorkie ships nothing). There is no `chat/commands/mcp.ts`, no
per-user MCP state key, and no App Home MCP section anywhere in gorkie's
tree (`grep -rn "mcp" /workspaces/gorkie/src/mastra/chat` returns nothing
outside the empty client file). This plan is therefore original design for
the end-user-registration half, not a port. What gorkie *does* have that
this plan reuses as precedent: the `chat().getState()` KV pattern
(`/workspaces/gorkie/src/mastra/lib/allowed-users.ts:12-30`, a per-scope
string-keyed cache read/written through the same Postgres-backed state the
channels config already requires), the `!command` text-command dispatcher
(`/workspaces/gorkie/src/mastra/chat/commands/index.ts:6-23` and
`stop.ts`), and the Button/Actions/`postEphemeral` onboarding flow
(`/workspaces/gorkie/src/mastra/chat/onboarding.ts:24-58`) as the shape of
a lightweight Slack-native settings interaction.

**How MCP tools attach to the orchestrator today.** `baseTools` in
`src/mastra/tools/base.ts:12-23` is a static `Record<string, Tool>` built
once at module load (`...mcpTools` spread in at the end) and passed as
`tools: baseTools` at `orchestrator.ts:55`. The `Agent` constructor's other
dynamic fields already use `({ requestContext }) => ...`
(`instructions: ({ requestContext }) => instructions(requestContext)`,
`orchestrator.ts:34`) but `tools` does not; it is the one static field in
an otherwise per-request-aware config. `src/mastra/lib/context.ts:4-11`
already extracts the Slack actor from a request:

```ts
export function channelContext(
  requestContext?: RequestContext
): ChannelContext {
  return (
    (requestContext as SlackAgentRequestContext | undefined)?.get('channel') ??
    {}
  );
}
```

`ChannelContext` (`node_modules/@mastra/core/dist/channels/types.d.ts:657-673`)
carries `userId: string` ("Platform user ID of the sender") on every
channel-originated request, which is the per-user key this plan needs and
which prompts already read via `channelContext(requestContext)`
(`src/mastra/prompts/context.ts:4-5`).

**App Home settings placeholder.** `src/mastra/chat/content.ts` defines the
static `content.home` published on `app_home_opened`
(`registerEvents()` calls `bot.onAppHomeOpened((event) =>
publishHome(event.userId))`), ending with a context block: `'More settings
coming soon.'` (`:70-73`). `TODO.md`'s App Home entry explicitly earmarks
this: "Later: replace with real settings controls (e.g. tool-visibility
toggle) once the template has any." This plan is the first feature to fill
that placeholder.

**Docs.** `docs/adding-mcps.md` (54 lines) only covers the template-author
path (edit `mcp/index.ts`, re-register in `tools/base.ts`, typecheck). It
has no end-user-facing section; this plan adds one.

## Design

### Part 1: firm up the built-in servers

Keep exactly one registration point (`src/mastra/mcp/index.ts`), matching
the template's existing "single obvious registration point" pattern
(`tools/base.ts` is the analogous precedent for tools generally). Change
three things:

1. **Make it a declarative map, not an eagerly-awaited result.**

   ```ts
   // src/mastra/mcp/index.ts
   import { MCPClient } from '@mastra/mcp';
   import { env } from '@/env';

   export const builtinMcpServers: Record<string, MastraMCPServerDefinition> = {
     ...(env.MCP_CONTEXT7_ENABLED
       ? {
           context7: {
             command: 'npx',
             args: ['-y', '@upstash/context7-mcp'],
             timeout: 10_000,
           },
         }
       : {}),
   };

   export const mcpClient = new MCPClient({
     id: 'mcp-builtin',
     servers: builtinMcpServers,
   });
   ```

   `env.MCP_CONTEXT7_ENABLED` (new, `src/env.ts`, `z.stringbool().default(false)`
   or `z.enum(['true','false']).default('false').transform(...)`, matching
   this repo's existing boolean-env conventions, exact Zod helper to be
   confirmed against `@t3-oss/env-core` + `zod` versions pinned in
   `package.json` during implementation) makes the shipped default an
   **opt-in empty map**, matching gorkie's posture and directly resolving
   the open "VERIFY" item in `TODO.md` by making the answer explicit and
   operator-controlled instead of implicit and always-on.

2. **Resolve tools with error visibility, not `listTools()`'s silent drop.**
   `listTools()` is implemented as `const result = await
   this.listToolsWithErrors(); return result.tools;`
   (`node_modules/@mastra/mcp/dist/index.cjs:32942-32945`): it already
   does not throw on a broken server, it just silently omits that server's
   tools. That is worse than throwing for a template default: a template
   user with a flaky `npx` (offline dev machine, corporate proxy blocking
   the npm registry) gets an agent that boots fine but is silently missing
   tools, with no signal anywhere. Switch to `listToolsWithErrors()` and
   log:

   ```ts
   // src/mastra/mcp/index.ts (continued)
   const { tools: builtinMcpToolsResult, errors: builtinMcpErrors } =
     await mcpClient.listToolsWithErrors();
   for (const [serverName, error] of Object.entries(builtinMcpErrors)) {
     logger.warn('[mcp] builtin server failed to connect', { serverName, error });
   }
   export const builtinMcpTools = builtinMcpToolsResult;
   ```

   This keeps the top-level `await` (Mastra's own static-config examples
   all do this at module scope; removing it entirely would require
   restructuring `tools/base.ts` into the dynamic-function shape Part 2
   introduces anyway) but bounds it with the explicit 10s per-server
   `timeout` above instead of the 60s default, and never lets a broken
   built-in server fail silently.

3. **Register in `tools/base.ts` unchanged in shape**, just renaming the
   import (`mcpTools` → `builtinMcpTools`) to make room for Part 2's
   per-user tools, which must NOT go through this static map (see below).

### Part 2: end users add their own MCP servers

**Mechanism: `Agent.tools` as a per-request function, not `listToolsets()`
+ the `toolsets` call option.** `@mastra/mcp`'s own docs frame
`listToolsets()` as the multi-tenant answer ("Dynamic Configuration...
Multi-user, dynamic config (e.g., SaaS app)... Tools passed in `.generate()`
or `.stream()` options",
`node_modules/@mastra/mcp/dist/docs/references/docs-mcp-overview.md:150-212`).
That shape assumes the caller controls the `.generate()`/`.stream()` call
site directly. Here, Mastra's `channels` config owns that call
(`orchestrator.ts:82-98`); this template's code never calls `agent.stream()`
itself for Slack-originated turns, so there is no place to hand in a
`toolsets` option per request. The channels docs do not expose a `toolsets`
passthrough (`reference-agents-channels.md`, full `ChannelConfig` field
list quoted above, has no such field).

The mechanism that *does* fit is `Agent`'s dynamic `tools` field, confirmed
in `node_modules/@mastra/core/dist/docs/references/reference-agents-agent.md:442`:

> **tools** (`ToolsInput | ({ requestContext: RequestContext }) => ToolsInput | Promise<ToolsInput>`): Tools that the agent can access. Can be provided statically or resolved dynamically.

and demonstrated directly in
`node_modules/@mastra/core/dist/docs/references/docs-server-request-context.md:108-125`
(`tools: ({ requestContext }) => {}` alongside `instructions`, `model`,
`memory`). Channels already threads a populated `RequestContext` (carrying
`channel: ChannelContext` with `userId`, per Current State above) into
every agent invocation it makes, since `contextPrompt`/`channelContext`
already rely on exactly that today. So: change `orchestrator.ts:55`'s
static `tools: baseTools` into a dynamic function that composes the
always-on built-ins with that one user's MCP tools:

```ts
// src/mastra/agents/orchestrator.ts (sketch)
tools: async ({ requestContext }) => ({
  ...baseTools,
  ...(await userMcpTools({ requestContext })),
}),
```

`userMcpTools` (new, `src/mastra/mcp/user-servers.ts`) does the per-user
resolution:

```ts
// src/mastra/mcp/user-servers.ts (sketch)
import { MCPClient } from '@mastra/mcp';
import type { RequestContext } from '@mastra/core/request-context';
import { chat } from '../chat/instance';
import { channelContext } from '../lib/context';
import type { ToolsInput } from '@mastra/core/agent';

const clientCache = new Map<string, { client: MCPClient; configHash: string }>();

export async function userMcpTools({
  requestContext,
}: {
  requestContext?: RequestContext;
}): Promise<ToolsInput> {
  const { userId } = channelContext(requestContext);
  if (!userId) {
    return {};
  }
  const servers = await chat().getState().get<UserMcpServer[]>(userMcpKey(userId));
  if (!servers?.length) {
    return {};
  }
  const configHash = hashServers(servers);
  const cached = clientCache.get(userId);
  const client =
    cached?.configHash === configHash
      ? cached.client
      : await rebuildUserClient({ userId, servers, configHash });
  return await client.listTools();
}
```

Key decisions inside this design, each with a reason:

- **Cache `MCPClient` instances per user, keyed by a hash of their stored
  config, not per-request.** The dynamic SaaS example in
  `docs-mcp-overview.md:186-211` creates a fresh `MCPClient` and calls
  `disconnect()` at the end of every single request. Doing that here means
  every agent turn (not every conversation, every *turn*, since `tools` is
  evaluated per invocation) re-runs the MCP handshake: for an HTTP server
  that is at minimum an extra round trip before the model even starts;
  for a hypothetical stdio server it would mean spawning a new process
  every turn. Reconnecting only when the user's stored config actually
  changes (add/remove a server) keeps steady-state latency flat. This
  requires a unique `id` per client
  (`mcp:user:${userId}`) to satisfy `MCPClient`'s own multi-instance guard
  ("Creating multiple instances with identical configurations without an
  `id` will throw," `reference-tools-mcp-client.md:992`), trivially
  satisfied since every user's `id` differs.
- **User-supplied servers are HTTP/Streamable-HTTP/SSE (`url`) only, never
  `command`.** `MastraMCPServerDefinition`'s `command` field spawns an
  arbitrary host subprocess (`reference-tools-mcp-client.md:34-38`). Letting
  a Slack user choose that string would be direct remote code execution on
  the host process that also holds `SLACK_BOT_TOKEN`/`DATABASE_URL`/model
  keys, a non-starter under CLAUDE.md's "nothing else touches our OS"
  boundary, which exists precisely to keep untrusted execution inside E2B.
  Restrict the modal/command input (and the Zod schema that validates it)
  to `{ name, url, headers? }`; reject anything else at the boundary.
- **Auth is a header, not a query string or embedded credential.** The
  modal collects an optional bearer token and the tool sets it as
  `requestInit: { headers: { Authorization: \`Bearer ${token}\` } }`
  per the documented per-user auth pattern
  (`docs-mcp-overview.md:186-198`, `reference-tools-mcp-client.md:1048-1078`).
- **Namespacing is automatic.** `listTools()` prefixes every tool name with
  its server key (`serverName_toolName`,
  `reference-tools-mcp-client.md:166`), so a user's own server can never
  silently shadow a built-in tool name; no extra collision handling needed.
- **Security defaults are hard-coded per user server, not user-configurable.**
  Every user-added server is constructed with `forwardInstructions: false`
  (already the library default, never let a template user or a UX bug
  flip this for user-supplied servers) and `requireToolApproval: true`
  (see Security below). Neither is exposed as a modal field.

### App Home + modal UX

Fill `chat/content.ts`s `content.home` placeholder (`:70-73`) with a button:

```ts
// src/mastra/chat/content.ts (sketch addition to content.home.blocks)
Actions([
  Button({ id: 'mcp_manage', label: 'Manage MCP servers', value: '' }),
]),
```

wired in `registerEvents()`:

```ts
bot.onAction('mcp_manage', async (event) => {
  const servers = await userMcpServers({ userId: event.user.userId });
  await event.openModal(mcpManageModal(servers));
});

bot.onModalSubmit('mcp_add_server', async (event) => {
  const parsed = addServerFormSchema.safeParse(event.values);
  if (!parsed.success) {
    return { errors: /* ModalErrorsResponse, field-level messages */ };
  }
  const probe = new MCPClient({
    id: `mcp:probe:${crypto.randomUUID()}`,
    servers: { [parsed.data.name]: toServerDefinition(parsed.data) },
  });
  const { errors } = await probe.listToolsWithErrors();
  await probe.disconnect();
  if (errors[parsed.data.name]) {
    return { errors: { url: `Could not connect: ${errors[parsed.data.name]}` } };
  }
  await addUserMcpServer({ userId: event.user.userId, server: parsed.data });
});
```

using `Modal`/`TextInput`/`ModalSubmitHandler`/`ActionEvent.openModal`,
all confirmed exported from the pinned `chat@^4.32.0`
(`node_modules/chat/dist/index.d.ts:2` export list includes `Modal`,
`ModalComponent`, `TextInput`, `TextInputComponent`; `chat.onModalSubmit`
and `event.openModal` confirmed at
`node_modules/chat/dist/chat-Dm1vQU3i.d.ts:2853-2854,1885,2088`). Exact
`Modal`/`TextInput` prop shapes were not pinned down further here (no
inline example in the bundled reference doc); read
`node_modules/chat/dist/chat-Dm1vQU3i.d.ts` directly around those exports
before implementing.

**Alternative UX considered: a `!mcp` text command**, mirroring gorkie's
`!stop` (`/workspaces/gorkie/src/mastra/chat/commands/stop.ts`) via this
template's own future `chat/commands/` port. Rejected as the *add* path:
`!mcp add github https://mcp.example.com Bearer:sk-live-...` types the
secret into a normal chat message, which Slack stores in that DM/channel's
ordinary history and search index indefinitely: a materially worse
exposure than a modal submission, which is not rendered as a visible
message. Keep a lightweight `!mcp list` / `!mcp remove <name>` pair as text
commands (no secret in the argument, low-friction for the read/delete
path) alongside the modal for `add`, once this template has a
`chat/commands/` dispatcher (not yet ported from gorkie; note as a soft
dependency, not a blocker: the modal path works standalone).

### Storage

New type, `src/mastra/types/mcp.ts` (types live in `types/`, per
CODING_STANDARDS):

```ts
export type UserMcpServer = {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
  addedAt: string;
};
```

Persisted through the same generic KV the channels config already
requires: `PostgresStateAdapter.set(key, value, ttlMs)`
(`node_modules/@chat-adapter/state-pg/dist/index.js:163-176`), backed by
`chat_state_cache` (`CREATE TABLE IF NOT EXISTS chat_state_cache`,
`:339`, auto-migrated by the adapter, same table gorkie's
`allowed-users.ts` and this repo's per-thread `titled` flag already use).
Key: `mcp:user-servers:${userId}`, value: `UserMcpServer[]`. **No schema
migration**: this is the same pattern `plans/slack-code-mode.md`'s Risks
section already documents for ownership recording (`chat().getState().set`,
no new table).

**Open question, flagged not resolved:** `chat_state_cache.value` is a
plain JSON/text Postgres column with no application-level encryption.
Nothing in this template today stores long-lived third-party bearer tokens
in Postgres: `SLACK_BOT_TOKEN`/`DATABASE_URL`/model keys all live only in
`src/env.ts`-validated env vars on the host, never in the DB. Storing
user-supplied MCP bearer tokens here is a new category of secret-at-rest
for this template. Two options, neither implemented by this plan without a
maintainer decision: (a) accept it, document that anyone with DB access
(already a high-trust boundary: agent memory, channel state) can read
user MCP tokens, or (b) add application-layer encryption (e.g. AES-GCM
with a key from a new `MCP_SECRETS_KEY` env var) before `set()` and
decrypt after `get()`. Recommend (b) if any user-supplied server is
expected to carry a real production credential; (a) is acceptable for a
template whose Postgres is already a single-tenant, operator-controlled
database, but say so explicitly to the maintainer rather than deciding
silently.

### Security

MCP creds are secrets and MCP clients run **host-side**, same execution
context as `SLACK_BOT_TOKEN`/`DATABASE_URL`/model keys (`src/env.ts`).
This is consistent with CLAUDE.md ("Never put secrets... into the sandbox")
in the sense that MCP tool execution was never routed through E2B in the
first place: it is a normal Mastra tool call, exactly like `search_web`
or the built-in Slack tools, all of which already run on the host today.
The new risk this plan introduces is that the *server on the other end* of
a host-side tool call is now something a Slack end user chose, not the
template author. Concretely:

- **Malicious tool descriptions (prompt injection).** Every tool a user's
  MCP server advertises enters that user's tool list on every future turn
  in their conversations, with a `description` field the attacker fully
  controls. This is the same class of risk any MCP client accepts by
  design; the mitigation available here is `requireToolApproval`. Set
  `requireToolApproval: true` by default on every user-added server
  (`reference-tools-mcp-client.md:62-103`, integrates with Mastra's
  existing human-in-the-loop approval flow) so no user-added tool executes
  without an explicit approval step the first time, until this feature has
  real usage data. Do not expose this as a modal-configurable field; a
  compromised or careless user could otherwise turn it off for their own
  malicious server.
- **Server-advertised instructions.** Leave `forwardInstructions` at its
  library default (`false`) for every user server, permanently. The
  library's own docs are explicit about why: "server instructions are
  forwarded verbatim... into the agent's system prompt. A malicious or
  compromised MCP server can use them to inject instructions the agent
  will treat as trusted system guidance"
  (`reference-tools-mcp-client.md:160`). This is a strictly worse injection
  channel than tool descriptions (system-prompt-level trust vs. a single
  tool's metadata), so it gets no opt-out for user servers at all, not
  even a modal toggle.
- **Tool-annotation trust.** If `requireToolApproval` decisions ever key
  off `readOnlyHint`/`destructiveHint` annotations for convenience, the
  docs are explicit these are self-reported by the server and "clients
  MUST consider tool annotations to be untrusted unless they come from
  trusted servers" (`reference-tools-mcp-client.md:128`), do not use
  annotation hints to relax approval for user-added (untrusted-by-default)
  servers, only for the template author's own curated built-ins if ever
  needed.
- **Data exfiltration / tool-result injection.** A malicious server's tool
  *response* becomes model context on the next turn and can carry its own
  injected instructions, independent of the approval gate on the *call*.
  This is the same residual risk `fetch_url`/`search_web` already carry
  against arbitrary web content; this plan does not attempt content
  sanitization (unreliable in general) and relies on the approval gate
  plus the no-ambient-credentials invariant below to bound blast radius.
- **No ambient host credentials.** A per-user `MCPClient` must be built
  exclusively from that user's own stored `UserMcpServer` rows; it must
  never inherit `SLACK_BOT_TOKEN`, `DATABASE_URL`, or model API keys
  implicitly. Nothing in the design above passes them in, but call this
  out as an explicit invariant to verify in code review, since a future
  refactor that "simplifies" `userMcpTools`'s signature could accidentally
  thread broader context in.
- **Per-user isolation is structural, not a runtime check.** Because
  `tools` is evaluated fresh per request from `channelContext(requestContext).userId`,
  one user's registered server is mechanically unreachable from another
  user's request; there is no shared global toolset it could leak into.
  This must not regress if `userMcpTools` is ever memoized more broadly
  than per-`userId` (the cache above is explicitly keyed by `userId`).
- **Allowlist.** No allowlist by default (any HTTPS URL is accepted),
  flag this explicitly as a decision the maintainer may want to override,
  e.g. `MCP_USER_SERVER_ALLOWLIST` (new, optional, `src/env.ts`,
  comma-separated domain suffixes) checked in the modal's Zod
  validation/test-connect step before `addUserMcpServer` ever persists a
  row. Ship the plan with the allowlist check wired but the env var unset
  (= no restriction) by default, so a template operator opts into
  restriction rather than the plan silently deciding "wide open" is fine
  for every deployment.
- **E2B does not apply here and does not need to.** MCP tool calls are
  host tool calls, not sandboxed code, matching the rest of this
  template's non-Slack, non-canvas host tools. Restated because it's easy
  to assume "isolation" means E2B; here the isolation is per-user scoping
  plus approval-gating, not a sandbox boundary.

### Token cost: the scaling problem

Every configured MCP tool (built-in and per-user) adds one full JSON
schema to the tool list sent on **every** model call for that
conversation, whether or not the model ever calls it: the standard,
non-lazy tool-calling contract Mastra/the AI SDK use today. This is
already the stated motivation for `plans/slack-code-mode.md`'s tool
collapsing for this template's own Slack surface; it is a strictly worse
problem for MCP because server tool counts are open-ended and, once end
users can add their own, entirely outside the template author's control:
a single real-world MCP server (e.g. a project-management or CRM
integration) can expose 30-50 tools on its own.

**Unlimited user-registered MCP servers still require bounded discovery.**
The repo now uses `ToolSearchProcessor`, so this plan must register user MCP
tools with that deferred tool path instead of placing every schema in the
default tool list. The model discovers and activates matching schemas through
`search_tools`, keeping the steady-state prompt bounded.

`plans/slack-code-mode.md`'s `createCodeMode()` approach is a **different
shape and does not substitute** for user MCPs specifically: code-mode
collapses a *fixed, template-author-curated* tool family, decided at
`Agent` construction time, into one `execute_typescript`-style call and
one schema. User-added MCP servers are the opposite case by definition:
their membership is decided by the end user, at runtime, after the agent
is already running, so there is no static allow-list to collapse into a
code-mode tool without the allow-list itself becoming dynamic per user,
which reintroduces the exact scaling problem code-mode exists to avoid.

**Recommendation:** integrate end-user registration with the existing
deferred-tool path. Keep a server/tool-count guardrail as defense in depth:
cap registered servers per user (e.g. 1, enforced in
`addUserMcpServer`) and/or cap total tool count merged in
(`userMcpTools` counts `Object.keys(tools).length` after `listTools()`
and truncates/rejects past a `config.ts` constant, e.g.
`mcp.maxUserToolsPerUser = 20`). `plans/slack-code-mode.md` remains the
right tool for the template's own fixed Slack/canvas tool families; it is
a complementary plan, not an alternative to this one.

### Ergonomics summary (template goals)

- **One place to add a built-in server:** `src/mastra/mcp/index.ts`'s
  `builtinMcpServers` map, unchanged in kind from today, just no longer
  boot-blocking or silently-opaque on failure.
- **One place end users touch:** the App Home "Manage MCP servers" button,
  which is exactly the placeholder `TODO.md` already earmarked for this
  kind of feature.
- **One new file for the mechanism**, `src/mastra/mcp/user-servers.ts`,
  plus one changed line in `orchestrator.ts` (`tools: baseTools` →
  `tools: async ({ requestContext }) => ({ ...baseTools, ...(await
  userMcpTools({ requestContext })) })`). No other file needs to know this
  feature exists.
- **Opt-in/removable:** a template author who doesn't want end-user MCP
  registration leaves `orchestrator.ts`'s `tools` field static
  (`tools: baseTools`, today's code, unchanged) and never wires the App
  Home button/modal handlers; nothing else depends on
  `user-servers.ts` existing. Built-in Context7 is separately opt-in via
  `MCP_CONTEXT7_ENABLED`.
- **Does not add branchiness to `tools/base.ts`.** That file's map stays
  exactly as flat as it is today (`slackCode`'s Design section makes the
  same "flat map, no new decision axis" argument for the same file); this
  plan's dynamic composition happens once, in `orchestrator.ts`, not
  scattered across tool registration.

## Implementation steps

1. **`src/env.ts`**: add `MCP_CONTEXT7_ENABLED` (boolean-ish, default
   false) and optional `MCP_USER_SERVER_ALLOWLIST` (optional string,
   comma-separated domain suffixes) and, if the encryption-at-rest
   decision (Storage section) resolves to "encrypt," `MCP_SECRETS_KEY`
   (optional string). Confirm the exact boolean-env Zod pattern against
   this repo's existing `NODE_ENV`-style entries and the pinned `zod`
   version before writing.
2. **`src/mastra/types/mcp.ts`**: add `UserMcpServer` type per Storage.
3. **`src/mastra/mcp/index.ts`**: rewrite per Part 1, declarative
   `builtinMcpServers` map gated by `MCP_CONTEXT7_ENABLED`, bounded
   per-server `timeout`, `listToolsWithErrors()` with logged per-server
   errors, export `builtinMcpTools`.
4. **`src/mastra/tools/base.ts`**: rename the `mcpTools` import to
   `builtinMcpTools`; no structural change otherwise.
5. **`src/mastra/mcp/user-servers.ts`** (new): `userMcpTools`,
   `userMcpServers` (read), `addUserMcpServer`, `removeUserMcpServer`,
   the per-user `MCPClient` cache (`Map<userId, { client, configHash }>`),
   and the allowlist check against `env.MCP_USER_SERVER_ALLOWLIST` if set.
   Every constructed user `MCPClient` hard-codes
   `forwardInstructions: false` and `requireToolApproval: true`.
6. **`src/mastra/agents/orchestrator.ts`**: change `tools: baseTools`
   (`:55`) to the dynamic function shown in Design, importing
   `userMcpTools`.
7. **`src/mastra/chat/events.ts`**: add the `Actions([Button({ id:
   'mcp_manage', ... })])` block to `content.home` (replacing or
   supplementing the "More settings coming soon" context line at
   `:70-73`), and register `bot.onAction('mcp_manage', ...)` +
   `bot.onModalSubmit('mcp_add_server', ...)` +
   `bot.onModalSubmit('mcp_remove_server', ...)` (or a button-driven
   remove, no modal needed for delete) in `registerEvents()`.
8. **`src/mastra/chat/mcp-modal.ts`** (new, small): the `Modal`/`TextInput`
   view builders (`mcpManageModal(servers)`, `addServerModal()`), Zod
   schema for the add-server form (`private_metadata`/view-state parsing
   per CODING_STANDARDS' Slack modal conventions), and the test-connect
   probe (`new MCPClient({ ... }).listToolsWithErrors()` + immediate
   `disconnect()`) before persisting.
9. **`docs/adding-mcps.md`**: add an "End users: register your own MCP
   server" section describing the App Home flow, and update the built-in
   section to describe the new opt-in `MCP_CONTEXT7_ENABLED` gate.
10. **`.env.example`**: add the new env vars from step 1 with comments.
11. **`TODO.md`**: check off the "VERIFY" item (resolved: now opt-in) and
    the Roadmap "MCP support" line.
12. Run `bun run typecheck`, `bun run check`, `bun run check:spelling` per
    CLAUDE.md's Validation section. Ask the user to exercise the App Home
    flow and a real MCP registration in their own running bot instance
    (CLAUDE.md: never start/restart the bot yourself).

## Data / schema / config changes

- **Env vars** (`src/env.ts` + `.env.example`): `MCP_CONTEXT7_ENABLED`
  (bool, default false), `MCP_USER_SERVER_ALLOWLIST` (optional string),
  `MCP_SECRETS_KEY` (optional string, only if the encryption decision in
  Storage resolves to "encrypt", flag for maintainer approval per
  CLAUDE.md's "ask first: schema-shape changes" since it changes what a
  stored `UserMcpServer.headers` value looks like at rest).
- **No new Postgres migration.** Reuses `chat_state_cache`
  (`@chat-adapter/state-pg`, already auto-migrated), same mechanism
  `plans/slack-code-mode.md` documents for ownership recording and this
  repo already uses for the per-thread `titled` flag.
- **No new dependency.** `@mastra/mcp@^1.13.1` and `chat@^4.32.0`
  (both already pinned in `package.json`) cover everything used here:
  `MCPClient`, `listToolsWithErrors`, `requireToolApproval`,
  `Modal`/`TextInput`/`onModalSubmit`/`openModal`.
- **No Slack manifest scope changes.** `interactivity.is_enabled: true`
  is already set (`slack-manifest.json:65-67`); opening a modal via a
  button click needs no additional OAuth scope beyond what
  `chat:write`/the existing bot scopes already grant.
- **This does change what kind of data lives in Postgres** (third-party
  bearer tokens, potentially in plaintext, see Storage's open question).
  Flag this explicitly to the maintainer before shipping, per CLAUDE.md's
  "ask first: schema-shape changes": this is a schema-shape change in
  spirit even though no SQL migration is required.

## Risks & open questions

- **Secrets-at-rest for user MCP tokens.** Unresolved by this plan; see
  Storage. Needs an explicit maintainer decision (accept plaintext in
  `chat_state_cache`, or add `MCP_SECRETS_KEY`-based encryption) before
  shipping to a deployment where users might register a server with a
  real production credential.
- **`Modal`/`TextInput` exact prop shapes** were confirmed to exist as
  exports but not fully typed out here (the bundled `chat` reference docs
  don't include an inline modal-building example beyond the
  `editSubmissionModal(...)` call site in
  `node_modules/chat/resources/guides/triage-form-submissions-with-chat-sdk.md:138`,
  which references but doesn't define the modal builder). Read
  `node_modules/chat/dist/chat-Dm1vQU3i.d.ts` around the `Modal`/
  `TextInput` exports directly before implementing step 8.
- **Unlimited user MCPs still need explicit limits.** See Token cost. Route
  them through the existing deferred-tool path and keep the stated per-user
  cap as defense in depth.
- **`requireToolApproval: true` UX has not been tested in this template's
  Slack surface.** The human-in-the-loop approval flow it hooks into
  renders as "a separate card regardless of mode"
  (`reference-agents-channels.md:117`); confirm this reads well in
  Slack (not just documented) before relying on it as the primary
  mitigation for untrusted user servers.
- **Per-server connect timeout for built-ins** (`timeout: 10_000` in the
  Part 1 sketch) is a starting guess, not measured against a real
  `npx -y @upstash/context7-mcp` cold start on a template user's machine;
  verify empirically and adjust.
- **Allowlist is off by default.** A template operator who doesn't
  explicitly set `MCP_USER_SERVER_ALLOWLIST` accepts any HTTPS URL a
  Slack user supplies. This is a deliberate default (matches "wide open
  unless the operator opts into restriction") but is worth the maintainer
  re-confirming given the security profile described above.
- **`chat/commands/` does not exist in this template yet** (only in
  gorkie, and only `!stop` there). The `!mcp list`/`!mcp remove` text
  commands mentioned as a nice-to-have in Design have a soft dependency on
  that dispatcher being ported first; the modal-based `add`/manage flow
  does not depend on it and can ship alone.

## Effort & priority

**M.** No new dependency and no SQL migration keep it off L, but it
touches a genuinely new per-user-scoped `Agent.tools` dynamic-function
pattern (first use of that shape in this template), a new modal-based
settings surface (first use of `Modal`/`onModalSubmit` in this template
outside gorkie's simple `Button`/`Actions` onboarding), and an unresolved
secrets-at-rest decision that needs maintainer sign-off before shipping.
Priority: matches its position in `TODO.md`'s Roadmap section (not the
Active work stream). The end-user-registration half must use the existing
deferred-tool path; it is loosely
related to `plans/custom-instructions.md` (both add a first per-user
settings surface reachable from App Home; worth coordinating the App
Home UI layout, e.g. a single "Settings" entry point that fans out to
"Custom instructions" and "MCP servers," rather than two independent
buttons, if both land close together).
