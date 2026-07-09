This project is a customizable AI assistant for Slack. It uses
Bun, TypeScript, Mastra channels, Chat SDK's Slack adapter in Socket Mode, E2B
sandboxes, Postgres, and Mastra observability.

## CRITICAL: Load the `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work, and read the embedded docs/source in `node_modules/@mastra/*` rather than guessing. Mastra APIs change between versions; cached knowledge is usually wrong.

## Setup: use the `wizard` skill

If a person asks how to set up the project, load the `wizard` skill and generate a wizard tailored to their needs (services to configure, where state lives, optional integrations, whether to commit the script).

## Mental Model

One Mastra `Agent` (`orchestrator`) serves Slack through Mastra's built-in
`channels`. Channels owns Socket Mode, streaming, live tool widgets, typing
status, thread-history backfill, and `MastraStateAdapter`.

The agent brain runs on the host. Code execution runs in a per-thread **E2B** sandbox (isolated cloud Linux VM). Model keys, Slack tokens, and DB credentials live on the host and never enter the sandbox.

Storage is **Postgres** for agent memory and channel state. Long-term memory uses
thread-scoped **Observational Memory**.
Observability traces are stored in local DuckDB through
`MastraStorageExporter`.

## Boundaries

- Never run user/agent code on the host. E2B sandbox only; nothing else touches our OS.
- Never put secrets (model keys, Slack tokens, DB creds) into the sandbox.
- Never hand-roll what channels already does (streaming, history fetch, multi-user prefixes). Control it through `handlers`, `threadContext`, and subscription state.
- Never read `process.env` outside `src/env.ts`.
- Ask first: dependency changes, schema-shape changes, destructive git operations.
- Never start, restart, or kill `mastra dev`/`mastra start`/the built server on your own initiative. This is a live Slack bot; the user runs it themselves, and two instances racing for the same Slack Socket Mode connection causes real, confusing failures. If you must verify a code change actually works, ask the user to test it in their own running instance, or use `mastra api` against whatever they already have running instead of launching a new process.

## Coding Rules

Always read and follow [CODING_STANDARDS.md](./CODING_STANDARDS.md) before
writing or modifying code. It is the source of truth for coding rules.

- Inline over extract: no one-shot helpers or wrappers.
- Avoid one-use constants: inline single-use literals.
- Dict params: a function with more than one parameter takes a single options object.
- Small functions: prefer early returns over nesting.
- No type casts to silence TypeScript: validate with Zod at boundaries instead.
- No what-comments, no JSDoc. Comment only a non-obvious *why*.
- Types live in `src/mastra/types/`, not scattered across modules.
- Direct names: delete dead wrappers instead of renaming them.
- No em dashes anywhere (markdown, prose, comments, replies). Use a comma, colon, or period instead.

## Validation

After code changes:

1. `bun run typecheck`
2. `bun run check` (Biome/ultracite) and `bun run check:spelling`

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
- [Run and setup guide](./README.md)

<!-- BEGIN @agent-native/skills -->
When long-running or parallel work needs usage-limit checks, use the /stay-within-limits skill always.
<!-- END @agent-native/skills -->
