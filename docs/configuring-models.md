# Configure Models

Model configuration lives in `src/mastra/providers.ts`. The template keeps it
in one file so model ids, credentials, retry policy, and role assignments stay
easy to review.

Mastra model APIs change over time. Use the documentation embedded in the
installed `@mastra/core` package first, then check the
[Mastra model router](https://mastra.ai/models) for current provider and model
ids and [provider environment
variables](https://mastra.ai/models/environment-variables). The
[agents overview](https://mastra.ai/docs/agents/overview) documents the
`provider/model` format used by Mastra's model router.

## Model roles

| Export | Used by |
|---|---|
| `orchestrator` | Main Slack agent |
| `summarizer` | Thread summaries and observational memory |
| `scout` | Research helper agent |
| `explorer` | Workspace exploration helper agent |
| `images` | Direct image generation through the AI SDK |

These roles can use the same model or different models. A smaller model is
usually enough for summarization and research, while the orchestrator benefits
most from strong tool use and long-context performance.

## Change an OpenRouter model

The default text models use an OpenRouter-compatible configuration:

```ts
export const orchestrator: ModelWithRetries[] = [
  {
    model: openRouter('openrouter/minimax/minimax-m3'),
    maxRetries: 3,
  },
];
```

The `openrouter/` prefix selects the gateway. Everything after it is the model
slug OpenRouter expects. For example:

```ts
model: openRouter('openrouter/anthropic/claude-sonnet-4.6');
```

Before changing a model, verify that the slug exists:

```bash
node .agents/skills/mastra/scripts/provider-registry.mjs --provider openrouter
```

Do not guess model ids. Provider catalogs change frequently.

## Add fallback models

`ModelWithRetries[]` is ordered. Mastra tries later entries when an earlier
entry fails after its retry policy:

```ts
export const orchestrator: ModelWithRetries[] = [
  {
    model: openRouter('openrouter/anthropic/claude-sonnet-4.6'),
    maxRetries: 2,
  },
  {
    model: openRouter('openrouter/openai/gpt-5.4-mini'),
    maxRetries: 2,
  },
];
```

Use fallback models with compatible tool-calling and context capabilities.
Provider-specific settings belong on the entry that uses them.

Keep fallback chains short and intentional. Test each fallback independently,
because a valid model id does not guarantee compatible tools, context size, or
structured output behavior.

## Use another Mastra provider

Mastra's model router accepts `provider/model` strings and loads the matching
provider credential from the environment. For example:

```ts
export const orchestrator: ModelWithRetries[] = [
  {
    model: 'openai/gpt-5.5',
    maxRetries: 3,
  },
];
```

Then add the provider's required key to `src/env.ts` and `.env.example`, such as
`OPENAI_API_KEY`. The installed Mastra agent docs describe the supported
`provider/model` format and environment-variable lookup in
`node_modules/@mastra/core/dist/docs/references/docs-agents-overview.md`.

Keep provider credentials on the host. Never put them in E2B configuration,
skills, prompts, or committed files.

## Tune generation

Global token limits and step limits live in `src/mastra/config.ts`. Agent-level
generation settings live in `src/mastra/agents/agent.ts` and the helper-agent
files.

Mastra uses `maxOutputTokens`, not `maxTokens`, in model settings:

```ts
defaultOptions: {
  modelSettings: {
    maxOutputTokens: 16_384,
    temperature: 0.2,
  },
},
```

Settings can also be attached to one fallback entry with `modelSettings` or
`providerOptions`.

## Image models

`generate-image.ts` creates an OpenAI-compatible image client directly. Its
model id is the OpenRouter slug without the Mastra gateway prefix:

```ts
export const images = {
  id: 'google/gemini-3.1-flash-image',
  apiKey: env.OPENROUTER_API_KEY,
  url: env.OPENROUTER_BASE_URL,
};
```

Confirm that the replacement model supports image generation. A text-only model
will typecheck but fail when called.

## Validate changes

```bash
bun run typecheck
bun run check
bun run check:spelling
bun run build
```

Do not start a second bot instance just to validate model configuration. Test
live model behavior through the Slack instance you already control.
