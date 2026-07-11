import type {
  OnDelegationCompleteHandler,
  OnDelegationStartHandler,
} from '@mastra/core/agent';
import type { ToolHooks } from '@mastra/core/tools';
import { clip } from '../clip';
import { logger } from '.';

export const logDelegationStart: OnDelegationStartHandler = (context) => {
  logger.info('[delegation] start', {
    threadId: context.threadId,
    target: context.primitiveId,
    type: context.primitiveType,
    toolCallId: context.toolCallId,
    iteration: context.iteration,
    prompt: clip(context.prompt),
  });
};

export const logDelegationComplete: OnDelegationCompleteHandler = (context) => {
  if (context.success) {
    logger.info('[delegation] complete', {
      target: context.primitiveId,
      type: context.primitiveType,
      toolCallId: context.toolCallId,
      iteration: context.iteration,
      durationMs: context.duration,
      inputTokens: context.result.usage?.inputTokens,
      outputTokens: context.result.usage?.outputTokens,
    });
    return;
  }
  logger.warn('[delegation] error', {
    target: context.primitiveId,
    type: context.primitiveType,
    toolCallId: context.toolCallId,
    iteration: context.iteration,
    durationMs: context.duration,
    error: clip(context.error),
  });
};

export const logTools: ToolHooks = {
  beforeToolCall: ({ toolName, input, metadata }) => {
    if (toolName.startsWith('agent-')) {
      return;
    }
    logger.info('[tool] call', {
      agent: metadata?.agentName,
      tool: toolName,
      args: clip(input),
    });
  },
  afterToolCall: ({ toolName, output, error, metadata }) => {
    if (toolName.startsWith('agent-')) {
      return;
    }
    if (error) {
      logger.warn('[tool] error', {
        agent: metadata?.agentName,
        tool: toolName,
        error: clip(error),
      });
      return;
    }
    logger.info('[tool] result', {
      agent: metadata?.agentName,
      tool: toolName,
      output: clip(output),
    });
  },
};
