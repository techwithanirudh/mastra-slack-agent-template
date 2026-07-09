# mastra-slack-agent-template TODO

Source of truth for outstanding template work.

## Setup

- [ ] Create a Slack app from `slack-manifest.json`.
- [ ] Configure required values from `.env.example`.
- [ ] Build the E2B image with `bun run build:template`.
- [ ] Use separate Postgres databases for development and production.

## Customize

- [ ] Investigate user-wide Observational Memory after the thread-scoped default
  has been tested in Slack.
- [ ] Decide whether `src/mastra/prompts/tools.ts` should remain.
- [ ] Fix live tool display in Slack Assistant DMs.
- [ ] Update the default identity and behavior in `src/mastra/prompts/`.
- [ ] Choose models and fallbacks in `src/mastra/providers.ts`.
- [ ] Review enabled Slack tools and OAuth scopes for the target workspace.
- [ ] Replace or extend the example MCP servers in `src/mastra/mcp/index.ts`.
- [ ] Revisit whether thread-scoped Observational Memory should stay the Slack
  default after Agent-view DM behavior has been live-tested.

## Verify

- [ ] Run `bun run typecheck`.
- [ ] Run `bun run check` and `bun run check:spelling`.
- [ ] Run `bun run build`.
- [ ] Test mentions, DMs, tools, files, and scheduled tasks in Slack.

## Recently completed

- Reworked the README capability overview, added a complete documentation
  index, removed the standalone Mastra guide, and renamed lifecycle logs to
  `agent`.
- Replaced generic Slack starter prompts with sourced research, sandbox file,
  Slack decision, and recurring schedule workflows.
- Removed an unused Agent-view context subscription unsupported by Chat SDK,
  documented local DuckDB observability, and clarified tool-display scope.
- Added public-channel auto-join to `upload_file`.
- Added public-channel auto-join to `post_message` and documented E2B setup,
  template builds, image customization, and alternative Mastra sandboxes.
- Switched Observational Memory back to thread scope, simplified AgentMail
  setup, renamed the image export to `images`, and documented portable AI SDK
  image providers.
- Confirmed tool-result image relocation is still required by the current
  Mastra OpenRouter text adapter, not only OpenCode.
- Removed unsupported saved-user instructions, tightened source attribution,
  reduced comment clutter, centralized sandbox Git identity, and documented
  AgentMail setup.
- Refined the template branding and README, documented GitHub setup, limited
  skill guidance to runtime skills, and moved image generation to the native
  OpenRouter AI SDK provider.
- Grounded the documentation in version-matched Mastra guidance, official
  references, and framework best practices.
- Prepared the reusable Agent baseline, documentation, optional integrations,
  and MIT license.
