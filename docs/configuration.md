# Configuration Guide

Follow these steps once to run the agent in your Slack workspace.

## 1. Install the project

Install [Bun](https://bun.sh/), then prepare the environment file:

```bash
bun install
cp .env.example .env
```

## 2. Create the required services

You need accounts for:

- [Slack](https://api.slack.com/apps)
- [PostgreSQL](https://www.postgresql.org/)
- [OpenRouter](https://openrouter.ai/)
- [E2B](https://e2b.dev/)
- [Exa](https://exa.ai/)

Add their credentials to `.env`:

```dotenv
SLACK_APP_TOKEN="xapp-..."
SLACK_BOT_TOKEN="xoxb-..."
DATABASE_URL="postgresql://..."
OPENROUTER_API_KEY="sk-or-..."
E2B_API_KEY="..."
EXA_API_KEY="..."
```

`OPENROUTER_BASE_URL` and `NODE_ENV` already have useful defaults. AgentMail
and authenticated GitHub access are optional.

## 3. Create the Slack app

1. Open [Slack app management](https://api.slack.com/apps).
2. Choose **Create New App**, then **From a manifest**.
3. Paste [`slack-manifest.json`](../slack-manifest.json).
4. Install the app to your workspace.
5. Copy the Bot User OAuth Token into `SLACK_BOT_TOKEN`.
6. Create an app-level token with `connections:write` and copy it into
   `SLACK_APP_TOKEN`.

Update or reinstall the app after changing its manifest, scopes, or event
subscriptions.

## 4. Configure PostgreSQL

Set `DATABASE_URL` to an empty PostgreSQL database the agent can reach. Mastra
and Chat SDK create their tables automatically.

Use different databases for development and production so local tests do not
mix with production conversations, memory, or schedules.

## 5. Build the sandbox

Build the E2B image after adding `E2B_API_KEY`:

```bash
bun run build:template
```

Run this again only after changing the sandbox image. See
[Configure Sandboxes](sandbox.md) for image customization and other providers.

## 6. Start the agent

```bash
bun run dev
```

Mastra Studio runs at `http://localhost:4111`. The Slack connection is ready
when the terminal prints `[agent] online`.

Do NOT run two instances with the same Slack app token.

## Optional integrations

Add either credential only when you need the integration:

```dotenv
AGENTMAIL_API_KEY="..."
GITHUB_TOKEN="..."
```

- [Configure AgentMail](configuring-agentmail.md)
- [Configure GitHub](configuring-github.md)
- [Configure Models](configuring-models.md)

## Observability

Traces are written to `observability.duckdb` and shown in Mastra Studio.
Sensitive-data filtering is enabled. A replicated deployment should replace
the local DuckDB observability store with shared storage.

## Verify changes

```bash
bun run typecheck
bun run check
bun run check:spelling
```
