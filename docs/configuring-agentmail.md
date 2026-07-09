# Configure AgentMail

AgentMail is optional. Without it, only email features are unavailable.

1. Create a key in the
   [AgentMail Console](https://console.agentmail.to/).
2. Add it to `.env`:

```dotenv
AGENTMAIL_API_KEY="am_..."
```

3. Restart the agent.
4. Ask the agent to list its inboxes or send a test email.

The AgentMail package is already in the E2B image. Changing the key does not
require `bun run build:template`.
