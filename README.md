# Mastra Slack Agent Template

A customizable Slack assistant built with Mastra, Bun, and TypeScript. It runs
as a long-lived Socket Mode process, stores state in Postgres, and gives every
Slack thread an isolated E2B workspace for command and filesystem tools.

> Note: This template is community-maintained and is not an official Mastra
> product.

## Features

- Slack-native mentions, DMs, subscribed threads, streaming responses, file
  handling, workspace search, and full conversation context.
- One isolated E2B sandbox per Slack thread, with a persistent filesystem,
  shell commands, background processes, and browser automation.
- Focused research and code exploration subagents for longer tasks.
- Recurring scheduled tasks and one-time reminders delivered to Slack.
- Web research through Exa, AI image generation, and Slack file workflows.
- Optional dedicated GitHub and AgentMail access with host-side credential
  brokering.
- Runtime skills and MCP support for adding repeatable workflows and external
  services.
- Postgres-backed channel state, thread-scoped Observational Memory, and local
  DuckDB observability.
- Slack support today, with Chat SDK providing a path to Discord, Telegram, and
  other platforms.

## Quick start

1. Create a Slack app from [`slack-manifest.json`](./slack-manifest.json).
2. Install [Bun](https://bun.sh/) and run `bun install`.
3. Copy `.env.example` to `.env` and fill in every required value.
4. Build your E2B image once with `bun run build:template`.
5. Start development with `bun run dev`.

The bot uses Socket Mode, so local development does not need an HTTP tunnel.
The successful connection log is `[agent] online`.

```bash
git clone https://github.com/techwithanirudh/mastra-slack-agent-template.git
cd mastra-slack-agent-template
bun install
cp .env.example .env
bun run build:template
bun run dev
```

Do not run multiple local instances against the same Slack app token. Slack
Socket Mode connections will race and produce confusing behavior.

## Documentation

Use the [documentation index](docs/index.md) for setup, architecture, models,
sandboxes, memory, tools, MCP servers, skills, integrations, and tool display.

## Commands

```bash
bun run dev             # Mastra Studio and the Slack bot
bun run build           # Production build
bun run start           # Run the production build
bun run build:template  # Build the configured E2B image
bun run typecheck
bun run check
bun run check:spelling
```

## License

[MIT](./LICENSE)
