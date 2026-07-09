# Add or Remove Skills

Skills are Markdown instructions for repeatable tasks. The agent loads them
from `workspace/skills/`.

## Add a skill

Create `workspace/skills/<name>/SKILL.md`:

```md
---
name: incident-summary
description: Summarize an incident from logs.
---

# Incident Summary

1. Gather the relevant logs.
2. Build a timeline.
3. Separate facts from assumptions.
4. Return the impact, cause, and follow-up actions.
```

No registry change is needed.

Keep each skill focused on one task. Put long reference material in files next
to `SKILL.md` and link to it.

## Remove a skill

Delete its folder. If it required sandbox software, remove that software from
`src/mastra/workspace/build-template.ts` and run:

```bash
bun run build:template
```

See Mastra's [workspace skills guide](https://mastra.ai/docs/workspace/skills)
for the full format.
