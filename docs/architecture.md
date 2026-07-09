# Architecture

The framework boundaries follow Mastra's
[agent](https://mastra.ai/docs/agents/overview),
[channels](https://mastra.ai/docs/agents/channels), and
[workspace](https://mastra.ai/docs/workspace/overview) concepts. See
[Mastra references and best practices](mastra.md) before changing those
boundaries.

## Request path

1. Slack sends Socket Mode events to the Chat SDK adapter.
2. Mastra channels selects a handler from `src/mastra/chat/handlers.ts`.
3. `orchestrator` builds request-scoped instructions and invokes the configured
   OpenRouter model.
4. Tools run either on the host for trusted integrations or inside the
   thread's E2B sandbox for command and filesystem work.
5. Mastra channels streams text and tool updates back to Slack.
6. Postgres stores channel state and agent memory. Local DuckDB stores
   observability spans.

## Main modules

| Path | Responsibility |
|---|---|
| `src/env.ts` | Validates all host environment variables |
| `src/mastra/index.ts` | Creates Mastra and initializes channels |
| `src/mastra/agents/orchestrator.ts` | Configures the main Orchestrator agent |
| `src/mastra/providers.ts` | Defines OpenRouter model roles |
| `src/mastra/prompts/` | Composes system instructions |
| `src/mastra/chat/` | Slack adapter, handlers, events, and rendering |
| `src/mastra/tools/` | Custom Mastra tools and the tool registry |
| `src/mastra/mcp/` | External MCP client configuration |
| `src/mastra/workspace/` | E2B sandbox lifecycle, network, and filesystem |
| `workspace/skills/` | Skills visible to the agent at runtime |

## Trust boundaries

The Mastra agent runs on the host. User-directed commands and filesystem work
run only inside E2B. Host secrets are not copied into the sandbox.

Slack tools can target any channel, thread, DM, user, file, or message the bot
can access. The template does not add same-channel, public-only, requester, or
attribution gates. Slack remains the source of truth for membership and message
ownership.

## State

- Chat SDK channel state: Postgres through `@chat-adapter/state-pg`.
- Mastra memory: Postgres through `@mastra/pg`.
- Mastra observability: local DuckDB through `@mastra/duckdb`.
- Long conversations: thread-scoped
  [Observational Memory](https://mastra.ai/docs/memory/observational-memory).
- E2B sessions: one deterministic sandbox id per Slack thread.
- Scheduled tasks: implemented in `src/mastra/tools/scheduled-tasks/`.

## Extension order

Prefer the smallest extension that fits:

1. Add instructions for behavior only.
2. Add a local tool for one typed capability.
3. Add an MCP server for an existing external tool service.
4. Add a runtime skill for a repeatable multi-step process.
5. Change the workspace image only when the sandbox needs new system software.

This keeps deterministic application logic in code, typed model-facing actions
in tools, third-party tool protocols in MCP, and reusable procedures in skills.
