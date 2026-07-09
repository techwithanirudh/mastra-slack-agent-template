# Documentation

Start with [Setup](configuration.md). Use the other guides only when you need
to change that part of the agent.

## Setup and understand

- [Setup](configuration.md): run the agent in Slack.
- [Models](configuring-models.md): change text or image models.
- [Sandbox](sandbox.md): customize the E2B environment.
- [Memory](memory.md): understand conversation memory.

## Add capabilities

- [Tools](adding-tools.md): add a local capability.
- [MCP](adding-mcps.md): connect an MCP server.
- [Skills](adding-skills.md): add repeatable instructions.
- [Tool display](tool-display.md): change Slack tool cards.

## Optional accounts

- [AgentMail](configuring-agentmail.md)
- [GitHub](configuring-github.md)

## File map

| Change | File |
|---|---|
| Agent behavior | `src/mastra/prompts/` |
| Models | `src/mastra/providers.ts` |
| Tools | `src/mastra/tools/base.ts` |
| MCP servers | `src/mastra/mcp/index.ts` |
| Slack behavior | `src/mastra/chat/` |
| Sandbox image | `src/mastra/workspace/build-template.ts` |
| Skills | `workspace/skills/` |

Mastra changes quickly. For framework changes, check the installed
`node_modules/@mastra/*/dist/docs/` files before using the
[public documentation](https://mastra.ai/llms.txt).
