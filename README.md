# Mastra Slack Agent Template

A customizable Slack agent built with Mastra, Bun, and TypeScript.

> Note: This template is community-maintained and is not an official Mastra
> product.

## Features

- Slack mentions, DMs, threads, streaming, files, and workspace search.
- Isolated E2B sandboxes with persistent files, shell access, and a browser.
- Web research, image generation, subagents, and scheduled tasks.
- Optional GitHub and AgentMail accounts.
- Skills and MCP support for adding new capabilities.
- PostgreSQL memory and local observability.

## Required services

| Service | Used for |
|---|---|
| Slack | Messages |
| PostgreSQL | State and memory |
| OpenRouter | AI models |
| E2B | Sandboxes |
| Exa | Web search |

The [configuration guide](docs/configuration.md) walks through creating each
service and adding its credentials.

## Quick start

```bash
git clone https://github.com/techwithanirudh/mastra-slack-agent-template.git
cd mastra-slack-agent-template
bun install
cp .env.example .env
bun run build:template
bun run dev
```

Follow the [setup guide](docs/configuration.md) to create the Slack app and add
service credentials. The agent is ready when the terminal prints
`[agent] online`.

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
