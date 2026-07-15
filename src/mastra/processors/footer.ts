import type {
  ProcessInputStepArgs,
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { Card, CardText } from 'chat';
import { slack } from '../chat/client';
import { agent as agentConfig } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';

const compactTokens = new Intl.NumberFormat('en', {
  compactDisplay: 'short',
  notation: 'compact',
});

export const footer = {
  id: 'footer',
  name: 'Completion Footer',
  description: 'Logs turn usage and posts the completion footer.',
  // processInputStep/processOutputStep bracket a single step's LLM call
  // (the model request/response, not the tool execution before the next
  // step). Accumulating just that gap gives genuine generation speed;
  // timing from the turn's first step to processOutputResult instead would
  // include every step's tool/sandbox/approval wall-clock time too, making
  // heavier turns falsely look slower than a quick reply with no tool calls.
  processInputStep(args: ProcessInputStepArgs) {
    args.state.stepStart = Date.now();
  },
  processOutputStep(args: ProcessOutputStepArgs) {
    const { stepStart } = args.state;
    if (typeof stepStart === 'number') {
      const { llmTimeMs } = args.state;
      args.state.llmTimeMs =
        (typeof llmTimeMs === 'number' ? llmTimeMs : 0) +
        (Date.now() - stepStart);
    }
    return args.messages;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const ctx = channelContext(args.requestContext);
    const { threadId } = ctx;

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
    const silentTools = new Set(['skip', 'react']);
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

    const { llmTimeMs } = args.state;
    if (typeof llmTimeMs === 'number') {
      const elapsedSec = llmTimeMs / 1000;
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
