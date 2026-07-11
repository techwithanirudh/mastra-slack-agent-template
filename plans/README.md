# Plans

Detailed implementation plans, one per outstanding feature from the roadmap
brain-dump. Each plan is grounded in this repo's code and in the upstream
`techwithanirudh/gorkie` `dev` branch (checked out at `/workspaces/gorkie`),
which is usually ahead of the template. See `../TODO.md` for the porting
process and active work stream.

## Index

### Priority / platform
- [multi-platform.md](multi-platform.md) - Discord + Telegram via Chat SDK adapters (first priority)
- [mcp-support.md](mcp-support.md) - firm up built-in MCP servers, let end users add their own
- [generalize-gorkie.md](generalize-gorkie.md) - make gorkie->template porting mechanical

### Tooling surface
- [deferred-tools.md](deferred-tools.md) - lazy/deferred tool loading + tool search, to keep the prompt small
- [slack-code-mode.md](slack-code-mode.md) - least-privilege Slack code-mode tool (post/edit/pin/topic/canvas)
- [send-as-user.md](send-as-user.md) - send-as-user tools; reconsider `post_message`
- [message-ownership-scoping.md](message-ownership-scoping.md) - restrict edit/delete to the bot's own messages
- [wait-tool.md](wait-tool.md) - a `wait` tool for pausing/polling between steps
- [emoji-proxy.md](emoji-proxy.md) - emoji proxy

### Automation / signals
- [signal-subscriptions.md](signal-subscriptions.md) - subscribe to GitHub / AgentMail events; agent can listen
- [scheduled-tasks.md](scheduled-tasks.md) - fix broken scheduling; remove `schedule_reminder`, expose as Slack API option

### Agent capabilities
- [subagent-model-selection.md](subagent-model-selection.md) - let the orchestrator pick subagent models
- [subagent-rendering-limit.md](subagent-rendering-limit.md) - subagents over 60 steps stop rendering (bug)
- [response-processing-indication.md](response-processing-indication.md) - proper progress indication while processing
- [custom-instructions.md](custom-instructions.md) - persistent per-user persona/tone/addressing instructions
- [topic-summaries.md](topic-summaries.md) - topic summaries
- [cloak-browser.md](cloak-browser.md) - configure the agent browser with Cloak Browser

### Observability / UX
- [cost-tracking.md](cost-tracking.md) - Langfuse per-user cost tracking
- [usage-indicator-toggle.md](usage-indicator-toggle.md) - let users disable the usage footer
- [agent-view.md](agent-view.md) - agent_view vs assistant_view manifest decision
