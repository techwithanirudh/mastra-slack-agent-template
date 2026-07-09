# Configure AgentMail

AgentMail is optional. Without `AGENTMAIL_API_KEY`, email workflows are
unavailable while the rest of the agent continues to work.

## 1. Create an API key

Sign up or log in to the [AgentMail Console](https://console.agentmail.to/),
open **API Keys**, and create a key with a descriptive name and only the
permissions the agent needs. AgentMail keys start with `am_` and are shown only
once.

AgentMail documents key creation in its
[API key guide](https://docs.agentmail.to/knowledge-base/getting-api-key).

## 2. Configure the host

Add the real key to the host `.env`:

```bash
AGENTMAIL_API_KEY="am_..."
```

Restart the user-managed bot after changing `.env`. Do not add the key to the
E2B image, Slack, or committed files.

## 3. Verify

Ask the running agent to list its AgentMail inboxes. If none exist, ask it to
create a test inbox and send a test email.

The Python package is already installed in the E2B template. Rebuild the
template only when changing sandbox packages, not when rotating the API key.
