# Messaging

This template responds in Slack through Mastra channels. It handles mentions,
DMs, Agent messages, and subscribed thread follow-ups.

## Ignore a message

Start any line with `##` when the agent should stay quiet:

```text
## notes for humans only
```

Leading bot mentions are ignored before this check, so this also stays quiet:

```text
@Agent ## do not answer this
```

The message is skipped before commands, tools, or model calls run.

## Stop a running response

Send `!stop` to abort the active response in the current Slack thread:

```text
!stop
```

If the bot needs to be mentioned in that surface, put the mention first:

```text
@your-bot !stop
```

Leading bot mentions are ignored before command parsing, so both forms run the
same command. When a response is active, the agent stops streaming and posts
`_Stopped._`. If nothing is active, Slack shows private feedback to the user
who sent the command.

## Steer a thread

When the agent is following a thread, every normal reply becomes new direction
for the same task. Use this to steer without starting over:

```text
Actually use TypeScript instead.
```

```text
Ignore the last approach and make the answer shorter.
```

```text
Use the file I uploaded above as the source of truth.
```

A top-level mention starts thread following, so later replies in that thread can
continue the work without another mention.

## Leave a thread

Ask the agent to leave when people want to keep talking without bot replies:

```text
leave this thread
```

The agent uses `leave_thread`, turns off automatic replies for that thread, and
confirms that it will stay quiet unless someone mentions it directly.

## Pull the agent back in

If the agent left the thread, or was not following it, mention it again in that
thread:

```text
@your-bot summarize the latest decision here
```

The handler refreshes recent thread context before answering, so the new mention
can steer from the current conversation instead of only the single message.

## DMs

DMs work like normal agent conversations. The suggested prompts in
`slack-manifest.json` are examples only; users can type any request.
