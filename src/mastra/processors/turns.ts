import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { Card, CardText } from 'chat';
import { summarizer } from '../agents/summarizer';
import { slack } from '../chat/client';
import { chat } from '../chat/instance';
import { agent as agentConfig } from '../config';
import { clip } from '../lib/clip';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

const compactTokens = new Intl.NumberFormat('en', {
  compactDisplay: 'short',
  notation: 'compact',
});

// Name a DM conversation in Slack's assistant History tab once, from the first
// exchange. Runs after the reply so the title reflects both sides. assistant_view
// gives DM threads a real thread_ts, so it doubles as the setTitle anchor.
async function maybeSetDmTitle(
  args: ProcessOutputResultArgs,
  ctx: ReturnType<typeof channelContext>
): Promise<void> {
  if (!(ctx.isDM && ctx.threadId && args.result.text.trim())) {
    return;
  }
  const { channel, threadTs } = slack.decodeThreadId(ctx.threadId);
  if (!threadTs) {
    return;
  }
  const state = chat().getState();
  const titledKey = `dm-titled:${channel}`;
  if (await state.get<boolean>(titledKey)) {
    return;
  }
  const userText = [...args.messages]
    .reverse()
    .find((message) => message.role === 'user')
    ?.content.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n');
  if (!userText) {
    return;
  }
  const { text } = await summarizer.generate(
    `Write a specific 3-6 word title for this Slack conversation. Return only the title, without quotes or trailing punctuation.\n\nUser: ${userText}\nAssistant: ${args.result.text.trim()}`
  );
  const title = text.trim().replace(/^["']|["']$/g, '');
  if (!title) {
    return;
  }
  await slack.setAssistantTitle(channel, threadTs, title);
  await state.set(titledKey, true);
}

export const turns = {
  id: 'turns',
  name: 'Turn Logging',
  processOutputStep(args: ProcessOutputStepArgs) {
    const { threadId } = channelContext(args.requestContext);
    for (const call of args.toolCalls ?? []) {
      logger.info('[tool] call', {
        threadId,
        tool: call.toolName,
        args: clip(call.args),
      });
    }
    args.state.startTime ??= Date.now();
    return args.messages;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const ctx = channelContext(args.requestContext);
    const { threadId } = ctx;

    for (const step of args.result.steps) {
      for (const { payload } of step.toolResults ?? []) {
        if (payload.isError) {
          logger.warn('[tool] error', {
            threadId,
            tool: payload.toolName,
            error: clip(payload.result),
          });
        } else {
          logger.info('[tool] result', {
            threadId,
            tool: payload.toolName,
            output: clip(payload.result),
          });
        }
      }
    }

    const { usage } = args.result;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const totalTokens = usage?.totalTokens ?? 0;

    logger.info('[turn] final finished', {
      threadId,
      finishReason: args.result.finishReason,
      steps: args.result.steps.length,
      inputTokens,
      outputTokens,
    });

    const hasTextResponse = args.result.text.trim().length > 0;
    if (hasTextResponse && ctx.platform === 'slack') {
      maybeSetDmTitle(args, ctx).catch((error: unknown) =>
        logger.warn('[chat] failed to set DM conversation title', {
          threadId,
          error,
        })
      );
    }

    const silentTools = new Set(['skip', 'add_reaction', 'remove_reaction']);
    const hasVisibleToolCall = args.result.steps.some((step) =>
      (step.toolResults ?? []).some(
        ({ payload }) => !silentTools.has(payload.toolName)
      )
    );
    const parts: string[] = [];

    if (args.result.steps.length >= agentConfig.maxSteps) {
      parts.push(`⚠️ hit ${agentConfig.maxSteps}-step cap`);
    } else if (
      args.result.finishReason &&
      !['stop', 'tool-calls'].includes(args.result.finishReason)
    ) {
      parts.push(`⚠️ ${args.result.finishReason}`);
    }

    if (totalTokens > 0) {
      parts.push(`${compactTokens.format(totalTokens)} tok`);
    }

    const { startTime } = args.state;
    if (typeof startTime === 'number') {
      const elapsedSec = (Date.now() - startTime) / 1000;
      if (elapsedSec > 0 && outputTokens > 0) {
        parts.push(`⚡ ${(outputTokens / elapsedSec).toFixed(1)} tok/s`);
      }
    }

    if (
      threadId &&
      ctx.platform === 'slack' &&
      (hasTextResponse || hasVisibleToolCall) &&
      parts.length > 0
    ) {
      await slack
        .postMessage(
          threadId,
          Card({
            children: [
              CardText(`_${parts.join(' · ')}_`, {
                style: 'muted',
              }),
            ],
          })
        )
        .catch((error: unknown) =>
          logger.warn('[chat] failed to post completion footer', {
            threadId,
            error,
          })
        );
    }

    return args.messages;
  },
};
