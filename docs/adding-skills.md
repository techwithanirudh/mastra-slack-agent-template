# Add Or Remove Skills

Skills are Markdown instructions for repeatable processes. This repository has
two separate skill audiences.

Runtime skills follow Mastra's
[workspace skills guide](https://mastra.ai/docs/workspace/skills) and the
[Agent Skills specification](https://agentskills.io/specification).

## Runtime skills

`workspace/skills/` is loaded by the Mastra workspace and is visible to the
Slack agent. The default set is:

- `agent-browser`: browser automation
- `agentmail`: email operations through optional brokered credentials
- `gh-cli`: GitHub operations
- `mermaid-diagrams`: diagram syntax and rendering guidance

Create `workspace/skills/<name>/SKILL.md`:

```md
---
name: incident-summary
description: Summarize an incident from logs when the user asks for an incident report.
---

# Incident Summary

1. Gather the relevant logs.
2. Build a timestamped event sequence.
3. Separate observed facts from inference.
4. Return impact, cause, and follow-up actions.
```

Descriptions should name distinct trigger conditions. Keep the common process
in `SKILL.md`; move branch-specific reference material into a nearby
`references/` file and link it from the exact branch that needs it.

No registry edit is needed. `LocalSkillSource` discovers folders under
`workspace/skills/`.

## Development skills

`.agents/skills/` helps coding agents work on this repository. `.claude/skills/`
contains matching symlinks for Claude-compatible discovery. When adding a local
development skill:

1. Add `.agents/skills/<name>/SKILL.md`.
2. Add `.claude/skills/<name>` as a relative symlink to
   `../../.agents/skills/<name>`.
3. Add third-party source metadata to `skills-lock.json` when applicable.

## Remove a skill

Delete its folder and every matching symlink or lock entry. Search for prompt,
sandbox package, and documentation references:

```bash
rg -n "skill-name|package-name" .
```

If the runtime skill depends on sandbox software, also remove that package from
`src/mastra/workspace/build-template.ts` and rebuild the E2B image.

## Quality bar

- One clear purpose per skill.
- A description that states what the skill does and when it should activate.
- One source of truth for each instruction.
- Checkable completion criteria for ordered steps.
- No stale product names, accounts, or credentials.
- No instructions that merely repeat normal model behavior.

Keep `SKILL.md` focused and load detailed references only when the workflow
needs them. This follows Mastra's progressive skill-discovery model and keeps
the agent context smaller.
