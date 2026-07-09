# Mastra References And Best Practices

This template follows the APIs in its installed Mastra packages. Mastra changes
quickly, so use sources in this order when changing framework code:

1. Read the matching files in `node_modules/@mastra/*/dist/docs/`. These docs
   match the exact installed package versions.
2. Check the installed source and type declarations when the embedded docs do
   not answer the question.
3. Use the [Mastra documentation index](https://mastra.ai/llms.txt) and public
   docs for concepts and newer features.

Do not copy an example written for a different Mastra version without checking
it against the installed types.

## Core references

- [Agents overview](https://mastra.ai/docs/agents/overview)
- [Using tools](https://mastra.ai/docs/agents/using-tools)
- [`createTool` reference](https://mastra.ai/reference/tools/create-tool)
- [MCP overview](https://mastra.ai/docs/mcp/overview)
- [`MCPClient` reference](https://mastra.ai/reference/tools/mcp-client)
- [Channels guide](https://mastra.ai/docs/agents/channels)
- [Channels reference](https://mastra.ai/reference/agents/channels)
- [Workspaces overview](https://mastra.ai/docs/workspace/overview)
- [Workspace skills](https://mastra.ai/docs/workspace/skills)
- [Memory overview](https://mastra.ai/docs/memory/overview)
- [Observational Memory](https://mastra.ai/docs/memory/observational-memory)
- [PostgreSQL storage](https://mastra.ai/reference/storage/postgresql)
- [Observability overview](https://mastra.ai/docs/observability/overview)
- [Model catalog](https://mastra.ai/models)

## Project practices

- Use an agent for open-ended work that requires model decisions. Prefer a
  deterministic function or workflow when the steps are fixed.
- Define custom tools with `createTool()`, clear descriptions, and validated
  schemas. Keep tool results small and structured.
- Use MCP for external capabilities already exposed by an MCP server. Use a
  local tool for project-specific behavior that belongs in this codebase.
- Keep model ids, tool registration, storage, and observability configuration
  centralized so changes remain reviewable.
- Treat workspaces as enforcement boundaries. User-directed command execution
  belongs in E2B, while model, Slack, and database credentials stay on the host.
- Persist channel state and memory in Postgres. Use separate databases and
  Mastra Platform projects for development and production.
- Send only the new user message into Observational Memory flows. Do not replay
  a client-side transcript that Mastra already stores.
- Keep sensitive-data filtering enabled before exporting traces. Review trace
  payloads whenever new credentials, tools, or request context fields are added.
- Validate framework changes against the installed package docs, then run the
  repository checks before testing through the existing Slack instance.
