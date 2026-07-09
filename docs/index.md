# Documentation

Use this page as the entry point for configuring and extending the template.

## Start here

| Guide | Covers |
|---|---|
| [Configuration](configuration.md) | Slack setup, environment variables, Postgres, observability, and validation |
| [Architecture](architecture.md) | Request flow, modules, state, and trust boundaries |
| [Sandboxes](sandbox.md) | E2B setup, template builds, software customization, and alternative workspace providers |
| [Models](configuring-models.md) | Model roles, OpenRouter, fallbacks, and image models |
| [Memory](memory.md) | Message history and thread-scoped Observational Memory |

## Extend the agent

| Guide | Covers |
|---|---|
| [Add tools](adding-tools.md) | Creating and registering typed Mastra tools |
| [Connect MCP servers](adding-mcps.md) | Adding external MCP capabilities |
| [Manage skills](adding-skills.md) | Adding, replacing, and removing runtime skills |
| [Tool display](tool-display.md) | Customizing or hiding Slack tool activity |

## Optional integrations

- [AgentMail](configuring-agentmail.md)
- [GitHub](configuring-github.md)

## Main customization points

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

## Mastra references

Mastra changes quickly. Check sources in this order:

1. Read the matching files in `node_modules/@mastra/*/dist/docs/`.
2. Check the installed source and type declarations.
3. Use the public documentation for concepts and newer features.

Do not copy an example written for another Mastra version without checking it
against the installed types.

- [Documentation index](https://mastra.ai/llms.txt)
- [Agents](https://mastra.ai/docs/agents/overview)
- [Channels](https://mastra.ai/docs/agents/channels)
- [Tools](https://mastra.ai/docs/agents/using-tools)
- [MCP](https://mastra.ai/docs/mcp/overview)
- [Workspaces](https://mastra.ai/docs/workspace/overview)
- [Memory](https://mastra.ai/docs/memory/overview)
- [Observational Memory](https://mastra.ai/docs/memory/observational-memory)
- [Observability](https://mastra.ai/docs/observability/overview)
- [Model catalog](https://mastra.ai/models)

## Project references

- [`AGENTS.md`](../AGENTS.md) defines repository boundaries and validation.
- [`CODING_STANDARDS.md`](../CODING_STANDARDS.md) defines coding conventions.
- [`TODO.md`](../TODO.md) tracks setup, customization, and verification work.
