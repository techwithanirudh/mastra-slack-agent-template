# Agent

A customizable AI assistant for Slack. The project uses Bun, TypeScript, Mastra
channels, Chat SDK, Postgres, OpenRouter, and isolated E2B sandboxes.

## What is included

- Slack Socket Mode with mentions, DMs, Assistant threads, streaming, and live
  tool activity.
- One main Mastra agent plus focused research and workspace exploration agents.
- Per-thread E2B sandboxes for command and filesystem tools.
- Postgres-backed channel state, memory, and observational memory.
- Slack, web search, scheduled task, reminder, image, and file tools.
- Optional AgentMail and GitHub credentials brokered into the sandbox without
  exposing host tokens.
- OpenRouter model configuration and Mastra Platform observability.
- A small default skill set that is straightforward to replace.

## Quick start

1. Create a Slack app from [`slack-manifest.yaml`](./slack-manifest.yaml).
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

## Customize

Start with these guides:

- [Mastra references and best practices](docs/mastra.md)
- [Codebase architecture](docs/architecture.md)
- [Configuration and environment](docs/configuration.md)
- [Configure models](docs/configuring-models.md)
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
