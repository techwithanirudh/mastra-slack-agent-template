# Configuration

Copy `.env.example` to `.env`, create the Slack app from
`slack-manifest.json`, and fill in the service credentials for your local or
production environment.

## Required Services

The bot needs these services to answer Slack messages:

| Service | Used for | Configure with |
|---|---|---|
| Slack app | Socket Mode events, messages, tool cards, DMs, and Agent messaging | `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `slack-manifest.json` |
| PostgreSQL | Mastra storage, agent memory, Slack channel state, subscriptions, and scheduled tasks | `DATABASE_URL` |
| OpenRouter | Text model calls and the default image model | `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` |
| E2B | Per-thread cloud sandboxes for command and filesystem tools | `E2B_API_KEY` |
| Exa | Web search and page fetch tools | `EXA_API_KEY` |

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | no | Runtime environment label. Defaults to `development`. |
| `SLACK_APP_TOKEN` | yes | Slack app-level token for Socket Mode. It starts with `xapp-` and needs `connections:write`. |
| `SLACK_BOT_TOKEN` | yes | Slack bot token used to read events and post messages. It starts with `xoxb-`. |
| `DATABASE_URL` | yes | PostgreSQL connection string for Mastra storage and Slack channel state. |
| `OPENROUTER_API_KEY` | yes | OpenRouter key for all default model calls. |
| `OPENROUTER_BASE_URL` | no | OpenRouter-compatible API base URL. Defaults to `https://openrouter.ai/api/v1`. |
| `E2B_API_KEY` | yes | E2B key used to create isolated code sandboxes. |
| `EXA_API_KEY` | yes | Exa key used by web search and page content tools. |
| `AGENTMAIL_API_KEY` | no | Enables AgentMail-backed email tools. |
| `GITHUB_TOKEN` | no | Enables authenticated GitHub CLI/API operations inside brokered sandbox requests. |

Use separate `DATABASE_URL` values for development and production. Do not share
one production database with a local bot unless you intend to mix channel state,
thread memory, and schedules.

## Slack

Create the Slack app from `slack-manifest.json`. The manifest enables Socket
Mode, Agent messaging, DM events, message scopes, and bot token scopes used by
the template.

Token placement:

| Token | Where it comes from | Env var |
|---|---|---|
| App-level token | Slack app settings, Basic Information, App-Level Tokens | `SLACK_APP_TOKEN` |
| Bot User OAuth Token | Slack app settings, OAuth & Permissions | `SLACK_BOT_TOKEN` |

After changing scopes, event subscriptions, Agent view settings, or suggested
prompts in `slack-manifest.json`, reinstall or update the Slack app so the
workspace receives the new manifest settings.

Do not run two bot processes against the same `SLACK_APP_TOKEN`. Socket Mode
connections will race and events can be handled by the wrong process.

## Database

`DATABASE_URL` must point to PostgreSQL. It is used in two places:

| File | Purpose |
|---|---|
| `src/mastra/index.ts` | Mastra `PostgresStore` for memory and Mastra-managed data. |
| `src/mastra/agents/orchestrator.ts` | Chat SDK Postgres state for Slack channel state, subscriptions, and thread state. |

See Mastra's [PostgreSQL storage
reference](https://mastra.ai/reference/storage/postgresql) before changing the
store provider, schema, pool, retention, or migration behavior.

## Models

See [Configure Models](configuring-models.md) for model roles, OpenRouter slugs,
fallbacks, other Mastra providers, generation settings, and image models.

Model secrets stay on the host. Never put model API keys into the E2B image,
sandbox environment, prompts, skills, or Slack messages.

## Observability

`src/mastra/index.ts` registers one `Observability` entrypoint with a
`MastraStorageExporter`. Its composite storage override writes traces to
`observability.duckdb` in the process working directory, where they are
available to Mastra Studio.

DuckDB is appropriate for one long-lived bot process. The file is local to that
instance, so replicated or ephemeral deployments should route the observability
domain to shared Postgres or a dedicated analytics store instead.

Mastra observability supports `mastra.observability.flush()`, which flushes all
registered observability instances. This is mainly useful in serverless or
short-lived runtimes. The Slack bot is normally long-lived, so shutdown handles
most flushing needs.

Mastra applies sensitive-data filtering by default. Keep it enabled, and inspect
stored spans after adding tools, request-context fields, or prompt inputs.

See Mastra's [observability
overview](https://mastra.ai/docs/observability/overview) before changing
exporters, sampling, scoring, retention, or trace metadata.

## Memory

See [Memory](memory.md) for the current thread-scoped Observational Memory
configuration and the reasoning behind that default.

Memory is stored in PostgreSQL through Mastra storage. Changing the memory scope
changes what past observations can influence future Slack replies, so review the
privacy and multi-user implications before changing it.

## Optional Features

The bot runs without either optional integration credential:

| Feature | Enable with | Behavior when absent |
|---|---|---|
| AgentMail | `AGENTMAIL_API_KEY` | Email workflows are unavailable. Slack, tools, memory, and sandbox execution continue normally. |
| GitHub operations | `GITHUB_TOKEN` | Public Git and HTTPS access still work. Authenticated `gh` operations are unavailable. |

See [Configure GitHub Access](configuring-github.md) for a dedicated account,
least-privilege token permissions, and verification.
See [Configure AgentMail](configuring-agentmail.md) for API key setup and
verification.

Keep optional credentials in the host `.env`. Never commit them or paste them
into Slack.

## E2B Image

The configured image name is in `src/mastra/config.ts`. Its build recipe is
`src/mastra/workspace/build-template.ts`.

After changing either file, build a new image:

```bash
bun run build:template
```

Do not put model, Slack, database, or E2B credentials in the image. The host
owns secrets. The sandbox gets only the brokered access it needs for a tool
call.

## Validation

After configuration or code changes, run:

```bash
bun run typecheck
bun run check
bun run check:spelling
```

Do not start a second Slack bot process just to validate configuration. Test
with the running instance you already control.
