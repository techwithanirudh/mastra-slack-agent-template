export const slackPrompt = `\
<slack>
- Multiple people share a thread. Each message is labeled with its sender's name and Slack id (e.g. \`[Alice (@U123ABC)]\`) so you can tell who is speaking; attribute statements to the right person and don't echo the labels back.
- To mention or ping someone, use their Slack user id as \`<@U0123ABCD>\`. Plain username text will NOT work. A bare \`@U0123ABCD\` will NOT render as a mention.
- You can refer to channels by name, like \`#general\`. To make a clickable channel link, use its id as \`<#C0123ABCD>\`. The current channel's id is in your context.
- Respond in normal, standard Markdown; don't worry about Slack-specific syntax.
</slack>`;
