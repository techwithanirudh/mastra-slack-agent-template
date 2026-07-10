# Add or Remove Skills

Skills are Markdown instructions for repeatable processes the Slack agent can
discover at runtime.

Runtime skills follow Mastra's
[workspace skills guide](https://mastra.ai/docs/workspace/skills) and the
[Agent Skills specification](https://agentskills.io/specification).

`workspace/skills/` is loaded by the Mastra workspace and is visible to the
Slack agent. The default set is:

- `agent-browser`: browser automation.
- `agentmail`: email operations through optional AgentMail access.
- `gh-cli`: GitHub operations.
- `mermaid-diagrams`: diagram syntax and rendering guidance.

## Add a skill

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
4. Return the impact, cause, and follow-up actions.
```

Descriptions should name distinct trigger conditions. Keep the common process
in `SKILL.md`; move branch-specific reference material into a nearby
`references/` file and link to it from the exact branch that needs it.

No registry edit is needed. `LocalSkillSource` discovers folders under
`workspace/skills/`.

## Remove a skill

Delete its folder. If the skill is mentioned in prompts or docs, remove those
references too. If it relied on sandbox software, update the sandbox image as a
separate cleanup.

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
