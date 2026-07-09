# Configuration

## Required services

- Slack app with Socket Mode enabled
- PostgreSQL
- OpenRouter
- E2B
- Exa
- Mastra Platform

Create the Slack app from `slack-manifest.yaml`, then copy `.env.example` to
`.env`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SLACK_BOT_TOKEN` | yes | Slack bot token |
| `SLACK_APP_TOKEN` | yes | Socket Mode app token |
| `DATABASE_URL` | yes | Memory and channel state |
| `OPENROUTER_API_KEY` | yes | All model calls |
| `OPENROUTER_BASE_URL` | no | Alternate OpenRouter-compatible endpoint |
| `E2B_API_KEY` | yes | Isolated code sandboxes |
| `EXA_API_KEY` | yes | Web search and page fetch |
| `MASTRA_PLATFORM_ACCESS_TOKEN` | yes | Trace export |
| `MASTRA_PROJECT_ID` | yes | Trace destination |
| `AGENTMAIL_API_KEY` | no | Broker AgentMail access into E2B |
| `GITHUB_TOKEN` | no | Broker GitHub access into E2B |

Use different `DATABASE_URL`, `MASTRA_PROJECT_ID`, and
`MASTRA_PLATFORM_ACCESS_TOKEN` values for development and production.
See Mastra's [PostgreSQL storage
reference](https://mastra.ai/reference/storage/postgresql) and
[observability overview](https://mastra.ai/docs/observability/overview) before
changing pool, schema, exporter, sampling, or retention settings.

## Models

See [Configure Models](configuring-models.md) for model roles, OpenRouter ids,
fallbacks, other Mastra providers, generation settings, and image models.

## Optional features

The bot runs without either optional credential:

| Feature | Enable with | Behavior when absent |
|---|---|---|
| AgentMail | `AGENTMAIL_API_KEY` | Email workflows are unavailable; Slack, tools, memory, and sandbox execution continue normally |
| GitHub operations | `GITHUB_TOKEN` | Public Git and HTTPS access still work; authenticated `gh` operations are unavailable |

Optional credentials stay on the host. E2B receives placeholder values, and
network rules inject the real authorization header only for the matching
service.

## E2B image

The configured image name is in `src/mastra/config.ts`. Its build recipe is
`src/mastra/workspace/build-template.ts`.

After changing either file, build a new image:

```bash
bun run build:template
```

Do not put model, Slack, database, or E2B credentials in that image.

Mastra observability applies sensitive-data filtering by default. Keep it
enabled, and inspect exported spans after adding new tools or request-context
fields.
