# Deferred tools / tool search

## Summary

Stop sending every tool's full JSON schema on every Slack turn. Split
`baseTools` into a small eager set (used almost every turn, or turn-ending)
and a larger deferred set that the orchestrator discovers on demand through
`@mastra/core`'s built-in `ToolSearchProcessor`, which already ships two
meta-tools, `search_tools` (keyword/BM25) and `load_tool` (exact select by
name), matching the maintainer's `select:<name1>,<name2>` + keyword-search
ask almost exactly, with zero new dependency. This is the lever that keeps
the prompt (and Studio token cost) from growing linearly as a template user
adds more MCP servers, scheduled-task admin tools, or niche Slack ops.

## Current state

**Tool inventory today** (`src/mastra/tools/base.ts:12-23`), all eager, all
sent on every single model call for every step of every turn:

```ts
export const baseTools = {
  ...slackTools,        // 13, src/mastra/tools/slack/index.ts:15-29
  ...scheduledTaskTools, // 5, src/mastra/tools/scheduled-tasks/index.ts:7-13
  ...canvasTools,        // 3, src/mastra/tools/canvas/index.ts
  skip: skipTool,
  search_web: searchWebTool,
  fetch_url: fetchUrlTool,
  grep: grepTool,
  wait: waitTool,
  generate_image: generateImageTool,
  ...mcpTools,           // 2 today (context7), src/mastra/mcp/index.ts:3-11
};
```

That is **29 tools** on the orchestrator today (13 + 5 + 3 + 6 + 2), on top
of the 3 subagent tools auto-exposed from `agents: { research, explore,
execute }` in `src/mastra/agents/orchestrator.ts:56-60` (out of scope here,
their own schemas are tiny: an id + a prompt string).

**`prompts/tools.ts` duplicates a lot of this by hand.** Separately from the
JSON schemas, `src/mastra/prompts/tools.ts` (130 lines) is a static prose
document describing tool usage (when to prefer `summarize_thread` over
`read_conversation_history`, the `edit_message`/`delete_message` ownership
note, the canvas append/prepend note, etc.), joined into the system prompt
on *every* request via `src/mastra/prompts/index.ts:16`
(`[corePrompt, personalityPrompt, slackPrompt, toolsPrompt].join('\n\n')`).
This means several tools already pay a **double** token cost every turn:
once as a JSON schema (auto-sent by the model provider call) and again as
hand-written prose in `toolsPrompt` (always sent, never deferred). Any
deferred-tools design has to shrink both, or it only gets half the win. See
Design.

**`config.ts` already flags this as a known cost.** `src/mastra/config.ts:9`
has the comment `// Reserve context for output and tool schemas.` next to
`maxTokens: { input: 200_000, output: 32_768 }` — the team already budgets
for schema bloat, just hasn't addressed the source of it.

**This repo already uses a static, non-dynamic form of tool filtering.**
`src/mastra/agents/research.ts:28-40` sets
`defaultOptions.activeTools: ['skill', 'skill_search', 'skill_read',
'search_web', 'fetch_url', 'search_slack', 'read_conversation_history',
'list_threads', 'get_user', 'get_channel_info']` while still passing the
full `tools: baseTools`. `src/mastra/agents/explore.ts` does the same for
its own narrower set. This is a *fixed, hand-maintained allow-list*, not
search-driven discovery, and (per `TODO.md`'s own note, "Skill tools on
every tool-using agent") the **orchestrator has no such allow-list at all**
— it is the one agent facing every Slack message with the full 29-tool
schema list, every turn. It is therefore the highest-value, and simplest,
first target for this feature.

**Gorkie has no precedent.** `grep -rln "tool_search\|toolSearch\|ToolSearch\|deferred.*tool\|lazy.*tool" /workspaces/gorkie/src` returns nothing, and gorkie's own `src/mastra/mcp/index.ts` ships `servers: {}` (empty). This deviates from `TODO.md`'s "gorkie first" process the same way `plans/slack-code-mode.md` already documented deviating: the maintainer is originating this in the template directly, to backport later once proven.

**The relevant Mastra API is real, exported, and already in the pinned version.** Verified directly against `@mastra/core@1.50.0` (`package.json:12`), not the changelog alone:

- `node_modules/@mastra/core/dist/processors/index.js:1` and `index.cjs:180-182` export `ToolSearchProcessor` as a real runtime symbol from `@mastra/core/processors` — the exact same module `orchestrator.ts:5-6` already imports `TokenLimiterProcessor` and `ProviderHistoryCompat` from.
- `node_modules/@mastra/core/dist/processors/processors/tool-search.d.ts:15-125` is the full type surface (quoted in Design).
- `node_modules/@mastra/core/dist/docs/references/reference-processors-tool-search-processor.md` is the bundled doc, cross-checked against the same page live.
- `CHANGELOG.md:18836` (`## 1.2.0` section): "Added ToolSearchProcessor for dynamic tool discovery. ([#12290](https://github.com/mastra-ai/mastra/pull/12290))" — this is the exact PR the maintainer remembered. It has since been refined multiple times, all already inside 1.50.0:
  - `CHANGELOG.md:6269` (`## 1.38.0`-adjacent section): request-aware `filter` hook added (PR #16088).
  - `CHANGELOG.md:4952` (`## 1.42.0`): `search.autoLoad` and `storage: 'context'` added (PR #17691).
  - `CHANGELOG.md:11139`, `:8742`, `:11103`: three separate approval/resume/type-lookup bugfixes for dynamically-loaded tools (PRs #15782, #16365, #15452), meaning this isn't a brand-new feature with rough edges, it has iterated across several point releases.

## Design

### The crux, answered directly: yes, Mastra can add tools mid-run, and it is not the same mechanism as the AI SDK's `activeTools`

The maintainer's brief asked to verify this precisely, so tracing the actual
call path matters more than the docs' summary.

**AI SDK v6 (`ai@6.0.219`) `activeTools`/`prepareStep` only *narrows* a
pre-declared, fixed `ToolSet`.** `node_modules/ai/dist/index.d.ts:990-1003`
(`PrepareStepResult`) exposes `activeTools?: Array<keyof NoInfer<TOOLS>>`
where `TOOLS` is generic-bound to whatever was passed as `tools` to the
outer `generateText`/`streamText` call — there is no `tools` override field
on `PrepareStepResult` at the AI SDK layer, only `activeTools`,
`toolChoice`, `model`, `system`, `messages`, `experimental_context`,
`providerOptions`. Confirmed in the implementation,
`node_modules/ai/src/prompt/prepare-tools-and-tool-choice.ts:32-38`:

```ts
const filteredTools =
  activeTools != null
    ? Object.entries(tools).filter(([name]) => activeTools.includes(name as keyof TOOLS))
    : Object.entries(tools);
```

`tools` here is still the original object; `activeTools` can only pick a
subset of *already-known* keys. It genuinely does reduce token cost though:
`asSchema(tool.inputSchema).jsonSchema` (the expensive JSON Schema
conversion) is only computed for `filteredTools`, not the full set, and only
the filtered set is sent in the request payload
(`node_modules/ai/src/generate-text/generate-text.ts:724,730,752`: each
step recomputes `stepActiveTools` from `prepareStepResult?.activeTools ??
activeTools`). This is exactly the "register all, expose a subset per step"
mechanism the brief hypothesized, and it is real, but by itself it cannot
introduce a tool the model never had type-level knowledge of.

**Mastra's own agent loop sits one layer above this and genuinely can inject
new tools mid-run.** Reading `node_modules/@mastra/core/dist/chunk-EVJSSG7F.cjs`:

- Every `Processor` with a `processInputStep` method (`tool-search.d.ts:201-226`) can return `{ tools: {...} }` as part of its `ProcessInputStepResult`.
- `mapToProcessInputStepResult` (`chunk-EVJSSG7F.cjs:34720-34730`) explicitly special-cases this: `if ("tools" in result && result.tools) { stepResult.tools = result.tools; }` — a genuinely new `tools` object per step, not a subset of one declared upfront.
- `handlePrepareStep` (`chunk-EVJSSG7F.cjs:34815-34838`) runs this on every step of the agentic loop and feeds the result into Mastra's own `PrepareStepProcessor` (`chunk-EVJSSG7F.cjs:25607-25612`, registered at `chunk-EVJSSG7F.cjs:26983` whenever `options.prepareStep` is set), which is what ultimately becomes the `prepareStep` handed to the underlying AI SDK `streamText`/`generateText` call (`chunk-EVJSSG7F.cjs:49869`).

So Mastra reconstructs the effective tool set **fresh, per step**, from
whatever its processor pipeline returns that step, rather than being
constrained to `activeTools` over a fixed pool. This is exactly how
`ToolSearchProcessor.processInputStep` can return `{ tools: { search_tools,
load_tool, ...currentlyLoadedTools } }` and have a tool that did not exist
in step 1 become genuinely callable in step 2 of the *same* `.generate()`/
`.stream()` run (the docs' own words, "become immediately available on the
next turn," mean the next *step* of the same multi-step tool loop governed
by `stopWhen`, not a new top-level request). **Answer to the crux: Mastra
can mutate the toolset mid-run, the search result is callable in the same
run, and this is shipped, not something to build.**

### The two meta-tools already are the `select:` + keyword-search split the brief asked for

`ToolSearchProcessorOptions` (`tool-search.d.ts:15-81`, quoted trimmed):

```ts
export interface ToolSearchProcessorOptions {
  tools: Record<string, Tool<any, any>>;
  search?: {
    topK?: number;      // default 5
    minScore?: number;  // default 0
    autoLoad?: boolean;  // default false
  };
  storage?: 'in-memory' | 'context'; // default 'in-memory'
  ttl?: number; // default 3_600_000 (1h), 'in-memory' only
  filter?: (args: { toolName: string; tool: Tool<any, any>; requestContext?: RequestContext; phase: 'search' | 'load' | 'active' }) => boolean | Promise<boolean>;
}
```

With `search.autoLoad` left at its default `false`, the processor exposes
**two** meta-tools (`tool-search.d.ts:201-225`):

- `search_tools({ query: string })` — BM25 keyword search over each deferred
  tool's name + description, returns `{ results: [{ name, description,
  score }], message }`. This is the keyword-search half of the brief.
- `load_tool({ toolName?: string; toolNames?: string[] })` — exact,
  name-addressed activation, no fuzzy matching. This **is** the
  `select:<name1>,<name2>` exact-fetch form the brief asked for, verbatim,
  already built.

**Recommendation: do not build a custom single `tool_search` tool with a
hand-parsed `select:` prefix**, mirroring this coding session's own
`ToolSearch` harness tool. That would throw away the store backends
(`in-memory` TTL vs `context`), the `filter` hook, and three already-shipped
bugfixes around approval/resume for dynamically loaded tools (see Current
state). The two-meta-tool split is the idiomatic Mastra shape and is
functionally equivalent: `search_tools` for "what's out there," `load_tool`
for "I know the name, give it to me now."

`search.autoLoad: true` was considered and rejected for v1: it collapses
`search_tools` + `load_tool` into one call, saving one model turn, but it
also **removes `load_tool` entirely** — there is no exact-select affordance
left once `autoLoad` is on (`tool-search.d.ts:36-49`: "there is no separate
`load_tool` step and the `load_tool` meta-tool is not exposed"). Since the
brief specifically wants the exact-select form preserved, `autoLoad: false`
is the only choice that satisfies both halves of the ask. Revisit `autoLoad`
later purely as a latency optimization if the two-turn flow proves annoying
in practice.

### No separate "tool registry" data structure; the tool objects already are the registry

The brief suggested "a tool REGISTRY with per-tool metadata (name,
one-liner, keywords, group)." Reading `tool-search.d.ts:116-124`
(`private allTools`, `private toolDescriptions`, `private bm25Index`), the
processor builds its own BM25 index directly from the `Record<string,
Tool>` passed as `options.tools` — it indexes each tool's existing `id` and
`description`, nothing more. There is no separate `keywords`/`group` field
in `ToolSearchProcessorOptions`. Building a second registry layer on top
(a `{ name, oneLiner, keywords, group }[]` array feeding into
`ToolSearchProcessor`) would duplicate what tool descriptions already
express, and fails the CODING_STANDARDS.md "deletion test": if deleted, the
descriptions already on each `createTool({...})` call would still carry the
same information. **Recommendation: keep tool descriptions as the corpus.**
The one adjustment worth making is ensuring each deferred tool's
`description` is BM25-friendly (mentions the words a user/agent would
actually search on, e.g. `canvas`'s description should say "canvas",
"document", "markdown" since those are plausible query terms) — a
copy-editing pass, not new infrastructure. `search_slack`'s existing
description (`src/mastra/tools/slack/search-slack.ts:70-71`) is already a
good example of a rich, searchable description.

### Eager vs. deferred split

One flat decision per tool: *is this called on nearly every turn, or does it
end the turn (so latency to reach it must be zero)?* If yes, eager. Else,
deferred. Applying that to the current 29:

**Eager (stays in `tools:`, 8 tools):** `skip` (turn-ending, must be
instantly callable), `leave_thread`, `leave_channel` (turn-ending),
`post_message` (used most turns for explicit-destination replies),
`search_web`, `search_slack`, `read_conversation_history` (the "always try
multiple sources" lookup pattern in `prompts/tools.ts:18-24` depends on
these being immediately available, no search detour), `fetch_url`.

**Deferred (moves into `ToolSearchProcessor`'s `tools` option, 21 tools):**
`edit_message`, `delete_message`, `get_channel_info`, `get_user`,
`get_slack_file`, `list_threads`, `summarize_thread`, `upload_file` (7 more
Slack tools, all occasional/situational), `create_canvas`, `read_canvas`,
`update_canvas` (3), all 5 `scheduled-tasks` tools, `wait`, `generate_image`,
`grep`, and both `mcpTools` entries (context7's 2 tools).

That is roughly **21/29 (72%) of today's schemas removed from every turn's
baseline prompt**, with the deferred pool only growing as MCP servers are
added (see mcp/index.ts below) — this is the actual scaling story the
maintainer flagged ("what makes users add many MCPs scale"), not a one-time
saving.

### Rough token estimate

Reading two representative deferred tools for scale:
`search-slack.ts:68-84` (`searchSlackTool`, eager in this plan, kept for
comparison) has a ~90-word description plus a two-field input schema, which
alone is roughly 150-200 tokens once rendered as JSON Schema.
`edit-message.ts:7-23` (`editMessageTool`, deferred) has a shorter ~20-word
description but a `discriminatedUnion` with two 3-4 field branches, another
~120-150 tokens. Canvas and scheduled-task tools sit in the same 100-200
token band (see their `inputSchema` blocks). Conservatively averaging **125
tokens/tool** across the 21 deferred tools puts the always-on schema
reduction at roughly **2,600 tokens per model call**, on every step of every
turn, before counting the `prompts/tools.ts` prose duplication addressed
below. For a thread with even a modest 5-step tool loop, that is ~13,000
tokens *not* re-sent that otherwise would be. This compounds directly with
Studio trace cost (every step is a separate LLM call recorded in DuckDB) and
with `config.maxTokens.input: 200_000`'s own comment about reserving budget
for schemas.

### The `prompts/tools.ts` half of the win, which the built-in processor does not give you for free

`ToolSearchProcessor` removes JSON schemas for unloaded tools, but it does
**not** touch `prompts/tools.ts`, which is static text always joined into
the system prompt (`prompts/index.ts:16`) regardless of which tools are
currently loaded. Today several `<tool>` blocks in `prompts/tools.ts`
duplicate what a deferred tool's own `description` should say (e.g. the
`edit_message / delete_message` block at `prompts/tools.ts:78-81`, or the
`create_canvas / read_canvas / update_canvas` block at `:83-86`). Left
as-is, this plan would only get half its stated win: the JSON schema shrinks
but the equivalent prose stays paid on every turn. **This plan requires**
trimming those blocks down to a one-line index entry (tool name + a
half-sentence on when to search for it), and moving the detailed guidance
into each deferred tool's own `description` string so it only ships once
`load_tool` actually activates it. Concretely:

```
<tool>
<name>edit_message / delete_message</name>
<note>Deferred: call search_tools("edit or delete a slack message") to find these.</note>
</tool>
```

...replaces the current 4-line note, and the ownership caveat currently in
that note moves into `editMessageTool`'s/`deleteMessageTool`'s own
`description` field.

### Discovery has to be prompted, or the model never searches

Mastra does not auto-inject a name index of deferred tools anywhere in the
prompt; discovery is purely query-driven (`search_tools`) or exact-recall
(`load_tool`). If the model never knows a `create_canvas` tool exists, it
will never think to search for "canvas." This repo therefore needs one
short, static paragraph (added to `prompts/tools.ts`, not left to Mastra)
naming the deferred *categories* so the model knows to search, e.g.:

```
Additional tools exist for canvases, scheduled tasks, less-common Slack
lookups (channel/user info, file download, thread summaries), image
generation, sandbox grep, wait/poll, and any configured MCP servers. Call
search_tools with a few keywords, or load_tool with an exact name if you
already know it, before assuming a capability is unavailable.
```

This is the "compact catalog instead of full schemas" trade the brief asked
to quantify: this paragraph is roughly 60 tokens, replacing ~2,600 tokens of
schemas plus the several hundred tokens of now-trimmed `prompts/tools.ts`
prose, on every turn that doesn't need a deferred tool (the common case).

### `mcp/index.ts`: the actual long-term lever

`src/mastra/mcp/index.ts:3-11` spreads `mcpTools` (currently 2, from
context7) directly into `baseTools` eagerly. `TODO.md:171-172` already
tracks the roadmap item this plan should feed: "MCP support: firm up the
built-in MCP servers, then let end users add their own." `plans/mcp-support.md`
is currently a draft stub (`## Current state / TODO`) that itself flags
"the token-cost ceiling on 'unlimited user MCPs'" as an open problem. This
plan's contribution to that problem: **route `mcpTools` through the
deferred pool, not the eager one**, from day one. An MCP server can expose
an arbitrary, unbounded number of tools; only `ToolSearchProcessor` (or
code-mode-style bundling, which doesn't fit heterogeneous unrelated MCP
tools) keeps that from growing the baseline prompt linearly as a template
user adds servers. `mcp-support.md` should link back here once it moves
past its draft state, rather than re-solving the same problem.

### Storage backend choice: `'in-memory'` recommended over `'context'` for this repo, with the tradeoff spelled out

- **`'context'`** derives "loaded" state from whether a `search_tools`/
  `load_tool` result is still present in the conversation messages. This
  repo's orchestrator already runs `TokenLimiterProcessor` with `trimMode:
  'contiguous'` (`orchestrator.ts:46-49`) and `Memory` configured with
  `lastMessages: 20` (`orchestrator.ts:63`). A tool loaded early in a
  long-lived Slack thread (these persist for weeks) could silently fall out
  of the last-20-message window and "unload," forcing a re-search later
  with no explicit signal to the user.
- **`'in-memory'`** (default) with the default 1-hour TTL avoids that,
  since it tracks loaded state per real thread ID (Slack always supplies
  one here, so the "shared `'default'` entry for anonymous requests"
  caveat in the docs doesn't apply) independent of what's still in the
  message window. The real cost is restart: a `mastra dev`/production
  restart clears it, and the model just re-searches on its next need,
  which is cheap (one BM25 lookup) and not user-visible as an error.

**Recommendation: `storage: 'in-memory'` for v1**, since Slack threads here
outlive the 20-message context window far more often than they outlive an
hour of activity, and the failure mode (re-search after restart) is
strictly cheaper than the failure mode of `'context'` (silent, confusing
de-load mid-conversation). Revisit if long TTL turns out to leak memory in
practice; `getStateStats()`/`cleanupNow()` (`tool-search.d.ts:176-188`) exist
for exactly that kind of production check.

### Scope: orchestrator only for v1

`research.ts` and `explore.ts` already narrow `baseTools` via their own
static `activeTools` allow-lists (`research.ts:29-40`, similar in
`explore.ts`), and neither list includes any of the 21 tools proposed for
deferral here (no canvas, no scheduled tasks, no mcp tools, no
edit/delete). Applying `ToolSearchProcessor` there too is a smaller,
optional follow-up, not required for the stated goal: the orchestrator is
the only agent with no allow-list today and the one directly facing every
Slack message, so it is where the token win actually lives.

### Contrast with `plans/slack-code-mode.md`, and whether they compose

Both plans fight prompt bloat, but on different axes of the same
`baseTools` map, and they do not conflict:

| | Code mode (`slack-code-mode.md`) | Deferred tools (this plan) |
|---|---|---|
| Fights | round-trips for a *known, fixed, small* cluster of tightly-related mutating tools (post/edit/pin/canvas/topic/wait) | schema bloat for a *large, growing, mostly independent* long tail (scheduled tasks, occasional reads, MCP tools) |
| Mechanism | bundle N tools behind one `execute_typescript`-style tool, model writes one program instead of N turns | keep tools separate but load their schemas on demand via `search_tools`/`load_tool` |
| Wins when | tools are chained together often ("post an update, pin it, retitle") | tools are called independently, rarely, or their number is unbounded (user-added MCPs) |
| Tool-card cost | collapses to one generic "Slack Code" card, real UX regression | two extra generic meta-tool cards (`search_tools`/`load_tool`) appear only when a deferred tool is actually needed |

They compose without overlap: code-mode's own allow-list (`post_message`,
`edit_message`, `delete_message`, `create_canvas`, `read_canvas`,
`update_canvas`, `pin_message`, `set_channel_topic`, `wait`) is exactly the
"chained together often" set that should stay **out** of
`ToolSearchProcessor`'s deferred pool (hiding a frequently-chained tool
behind a search step adds friction for no savings, since it gets loaded on
nearly every relevant turn anyway). If both plans land, `base.ts` ends up
three-way split: `eagerTools` (turn-critical, ~5-8), `slackCode.tool`
(the bundled mutation surface), and `deferredTools` (the long tail, fed to
`ToolSearchProcessor`). `wait` is the one tool named in both plans' scope;
resolve by keeping it wherever `slack-code-mode.md` lands it (inside the
code-mode allow-list) and dropping it from this plan's deferred list if that
plan ships first, or vice versa if this one does — whichever lands first
should update the other plan's "Current state" section to avoid drift.

### Cross-cutting template goals

- **Ergonomics of extension**: one file change to add a new tool as
  eager-vs-deferred, `src/mastra/tools/base.ts`, which stays the single
  registration point (same principle `slack-code-mode.md` already commits
  to). A template user adding a new MCP server or tool just decides which
  of the two exported groups it belongs to; no new file, no second
  registration point.
- **Studio without burning tokens**: this is the direct token-cost lever;
  see the estimate above. `getStateStats()`/`cleanupNow()` give a cheap way
  to sanity-check in-memory growth from Studio traces without adding new
  observability plumbing.
- **Un-confusing**: the eager/deferred split is one binary question per
  tool, not a new branchy config surface. `prompts/tools.ts` gets *shorter*
  overall (long per-tool blocks collapse to index lines), which directly
  addresses the "avoid a billion statements" goal rather than adding to it.
- **Opt-in / removable**: a template user who doesn't want this can merge
  `deferredTools` back into `eagerTools` in `base.ts`, drop the
  `ToolSearchProcessor` import from `orchestrator.ts`'s `inputProcessors`,
  and revert the `prompts/tools.ts` trims (or leave them, since the fuller
  per-tool prose can live directly on the tool's `description` regardless).
  No schema or env change to unwind.

## Implementation steps

1. **`src/mastra/tools/base.ts`**: split the current single `baseTools`
   export into two: `eagerTools` (the 8 named above) and `deferredTools`
   (the 21 named above, including `...mcpTools`). Keep both exported from
   this one file; this is still "a single obvious registration point," just
   with two named groups instead of one flat spread.

   ```ts
   export const eagerTools = {
     skip: skipTool,
     leave_thread: slackTools.leave_thread,
     leave_channel: slackTools.leave_channel,
     post_message: slackTools.post_message,
     search_web: searchWebTool,
     search_slack: slackTools.search_slack,
     read_conversation_history: slackTools.read_conversation_history,
     fetch_url: fetchUrlTool,
   };

   export const deferredTools = {
     edit_message: slackTools.edit_message,
     delete_message: slackTools.delete_message,
     get_channel_info: slackTools.get_channel_info,
     get_user: slackTools.get_user,
     get_slack_file: slackTools.get_slack_file,
     list_threads: slackTools.list_threads,
     summarize_thread: slackTools.summarize_thread,
     upload_file: slackTools.upload_file,
     ...canvasTools,
     ...scheduledTaskTools,
     wait: waitTool,
     generate_image: generateImageTool,
     grep: grepTool,
     ...mcpTools,
   };
   ```

2. **`src/mastra/agents/orchestrator.ts`**: import `ToolSearchProcessor`
   from `@mastra/core/processors` (same module `TokenLimiterProcessor` and
   `ProviderHistoryCompat` already come from, `orchestrator.ts:3-6`), switch
   `tools: baseTools` to `tools: eagerTools`, and add the processor to
   `inputProcessors`, keeping `TokenLimiterProcessor` last per the docs'
   own guidance ("Place TokenLimiter last to ensure context fits"):

   ```ts
   inputProcessors: [
     new ToolSearchProcessor({
       tools: deferredTools,
       search: { topK: 5, minScore: 0.1 },
       storage: 'in-memory',
     }),
     new ProviderHistoryCompat({ additionalRules: [relocateToolResultImages] }),
     new TokenLimiterProcessor({
       limit: config.maxTokens.input,
       trimMode: 'contiguous',
     }),
   ],
   ```

3. **`src/mastra/config.ts`**: add a `toolSearch: { topK: 5, minScore: 0.1 }`
   block next to the existing `toolDisplay` config, and reference it from
   step 2 instead of inlining the literals, matching this file's existing
   role as the home for deployment-tunable magic numbers.

4. **`src/mastra/prompts/tools.ts`**: trim the `<tool>` blocks for every
   tool moving into `deferredTools` (edit/delete, canvas, and add a new
   short block for the deferred category as a whole) down to one-line index
   entries; move the detailed guidance those blocks currently carry into
   each tool's own `description` field in its own file (e.g.
   `edit-message.ts:9-10`, `canvas/create.ts`'s description). Add the
   "additional tools exist, call search_tools/load_tool" paragraph from
   Design.
5. **Manual relevance check**: once wired, run the orchestrator against a
   handful of realistic queries a Slack user might trigger ("pin this" ->
   should surface `update_canvas`/no false positive on `pin_message` since
   that doesn't exist yet, "schedule a daily standup reminder" ->
   `create_scheduled_task`, "what's in this file" -> `get_slack_file`) and
   confirm `search_tools` returns the right tool in its top-`topK`. Adjust
   `minScore`/tool descriptions if not. Cannot be fully verified statically;
   ask the user to exercise it in their own running Slack instance per
   CLAUDE.md's boundary on not starting a second `mastra dev`.
6. **`TODO.md`**: log this under Roadmap as in-progress/done and cross-link
   `plans/mcp-support.md` once that plan is no longer a draft stub, noting
   that new MCP servers should register into `deferredTools`, not
   `eagerTools`.
7. Run `bun run typecheck`, `bun run check`, `bun run check:spelling` per
   CLAUDE.md's Validation section.

## Data / schema / config changes

- **No new dependency.** `ToolSearchProcessor` ships inside the already-pinned
  `@mastra/core@1.50.0` (`package.json:12`), exported from
  `@mastra/core/processors`, the same subpath already imported in
  `orchestrator.ts:3-6`. Confirmed via `dist/processors/index.js`/`.cjs`
  runtime exports, not just `.d.ts`.
- **No env vars.** No `src/env.ts` or `.env.example` change.
- **No Postgres schema change.** Both storage backends (`'in-memory'` with
  TTL, or `'context'` derived from message history) are self-contained; the
  recommended `'in-memory'` option needs no persistence at all, and
  `'context'` reuses whatever message storage `Memory` already persists.
- **`src/mastra/config.ts`**: additive `toolSearch: { topK, minScore }`
  block, no shape change to existing config.

## Risks & open questions

- **Discovery depends on the model reading the short "additional tools
  exist" paragraph and choosing to search.** This is the single biggest
  risk to the feature actually working as intended; if skipped, deferred
  tools become invisible dead weight rather than a token saving. Step 4 is
  load-bearing, not optional polish.
- **`storage: 'in-memory'` vs `'context'` is a real tradeoff, not a clean
  win either way** (see Design); flagged for the maintainer to confirm
  after seeing real Slack usage patterns, since it depends on how often
  long-lived threads reactivate a deferred tool after a quiet period longer
  than the TTL.
- **BM25 relevance is unverified against this specific tool set** until the
  manual check in step 5 runs; tool descriptions may need copy-editing to
  surface the right result for common phrasings.
- **Two extra meta-tool cards appear in Slack** (`search_tools`,
  `load_tool`) whenever a deferred tool is used; minor UX surface, same
  category of cost `slack-code-mode.md` already accepts for its own
  collapse, smaller in magnitude here. `chat/tool-display/index.ts:8-10`
  already has a precedent for hiding a tool's card entirely (the `skip`
  early-return) if these prove noisy in practice; not applied by default in
  this plan since visibility into "the agent went looking for a capability"
  seems like useful transparency, not noise, until proven otherwise.
- **Overlap with `plans/slack-code-mode.md` on `wait`**, and more broadly on
  which plan's `base.ts` split lands "on top of" the other if both are
  implemented — see the composition note in Design; whichever plan is
  implemented second should reconcile the `base.ts` shape the first one
  left behind rather than reverting it.
- **`plans/mcp-support.md` is currently a draft stub** ("Current state:
  TODO"); this plan takes a position on where MCP tools should live
  (deferred, not eager) that `mcp-support.md` should adopt rather than
  re-litigate once it's fleshed out.

## Effort & priority

**S/M.** Zero new dependency, zero env/schema change, isolated to
`tools/base.ts`'s split, one `ToolSearchProcessor` wiring block in
`orchestrator.ts`, a `config.ts` addition, and a trim pass over
`prompts/tools.ts`. Most of the actual effort is judgment (which tools are
eager vs. deferred, description copy-editing for BM25) and the manual
relevance check in step 5, not new code. No hard dependency on other plans,
but pairs directly with `plans/mcp-support.md` (the long-term payoff target)
and should be sequenced against `plans/slack-code-mode.md` per the
composition note above to avoid both plans re-deciding where `wait` lives.
Given the maintainer explicitly called this out as "the main lever for
prompt size / token cost / Studio expense," recommend prioritizing above
its unordered position in `TODO.md`'s Roadmap section, alongside or just
after `slack-code-mode.md`.
