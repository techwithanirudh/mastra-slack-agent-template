# Mastra Slack Agent

A customizable Slack assistant built with Mastra, Bun, and TypeScript. It runs
as a long-lived Socket Mode process, stores state in Postgres, and gives every
Slack thread an isolated E2B workspace for command and filesystem tools.

> Note: This template is community-maintained and is not an official Mastra
> product.

## Features

- Slack Socket Mode with mentions, DMs, Agent messaging, streaming, and live
  tool activity.
- Mastra channels for message flow, history backfill, typing state, and tool
  display.
- Postgres-backed channel state and thread-scoped Observational Memory.
- Per-thread E2B sandboxes for command and filesystem work.
- Slack, web search, scheduled task, reminder, image generation, and file tools.
- OpenRouter text models and a native OpenRouter image-model provider.
- Optional AgentMail and GitHub integrations.
- Local DuckDB-backed Mastra observability.
- A small default skill set that is straightforward to replace.

## Quick start

1. Create a Slack app from [`slack-manifest.json`](./slack-manifest.json).
2. Install [Bun](https://bun.sh/) and run `bun install`.
3. Copy `.env.example` to `.env` and fill in every required value.
4. Build your E2B image once with `bun run build:template`.
5. Start development with `bun run dev`.

The bot uses Socket Mode, so local development does not need an HTTP tunnel.
The successful connection log is `[orchestrator] online`.

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

## Customize

Start with these guides:

- [Mastra references and best practices](docs/mastra.md)
- [Codebase architecture](docs/architecture.md)
- [Configuration and environment](docs/configuration.md)
- [Configure AgentMail](docs/configuring-agentmail.md)
- [Configure GitHub access](docs/configuring-github.md)
- [Configure models](docs/configuring-models.md)
- [Memory](docs/memory.md)
- [Configure sandboxes](docs/sandbox.md)
- [Add a tool](docs/adding-tools.md)
- [Connect an MCP server](docs/adding-mcps.md)
- [Add or remove skills](docs/adding-skills.md)
- [Customize or disable tool display](docs/tool-display.md)

The main customization points are:

| Goal | File |
|---|---|
| Change identity and behavior | `src/mastra/prompts/` |
| Change models | `src/mastra/providers.ts` |
| Register tools | `src/mastra/tools/base.ts` |
| Connect MCP servers | `src/mastra/mcp/index.ts` |
| Change Slack behavior | `src/mastra/chat/` |
| Change tool cards | `src/mastra/chat/tool-display/` |
| Change sandbox software | `src/mastra/workspace/build-template.ts` |
| Add runtime skills | `workspace/skills/` |

Storage uses plain `@mastra/pg` for agent memory and channel state.
Mastra observability is stored in a local DuckDB file.

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
