# Memory

The main Slack agent uses Mastra `Memory` with Observational Memory in
`src/mastra/agents/orchestrator.ts`.

Current settings:

| Setting | Value | Why |
|---|---|---|
| `lastMessages` | `20` | Keeps recent thread context available without loading the whole thread. |
| `observationalMemory.scope` | `thread` | Keeps long-term observations tied to one Slack thread. |
| `temporalMarkers` | `true` | Preserves time signals for observations and reflections. |
| `model` | `summarizer` | Uses the summarizer model role from `src/mastra/providers.ts`. |

Thread scope is intentional. Slack channels and threads can include multiple
people, so user-wide memory can accidentally carry details from one shared
conversation into another. Thread-scoped memory gives the bot continuity inside
the current work thread without creating a cross-channel profile.

Memory data is persisted through Mastra storage, configured in
`src/mastra/storage.ts`, which uses PostgreSQL via `DATABASE_URL`.

Useful Mastra docs:

| Topic | Link |
|---|---|
| Memory overview | https://mastra.ai/docs/memory/overview |
| Memory configuration | https://mastra.ai/docs/memory/configuration |
| Observational Memory | https://mastra.ai/docs/memory/observational-memory |
| PostgreSQL storage | https://mastra.ai/reference/storage/postgresql |

Before changing scope, retention, processors, or summarizer models, consider
who can read the Slack thread and where the resulting observations may be used.
For this template, prefer thread scope unless you have a clear product
requirement for broader memory.
