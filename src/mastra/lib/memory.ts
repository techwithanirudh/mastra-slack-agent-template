import type { Agent } from '@mastra/core/agent';
import type { ChannelContext, TaskToolContext } from '../types';
import { channelContext } from './context';

export async function memoryThread({
  agent,
  externalThreadId,
}: {
  agent: Agent;
  externalThreadId: string;
}): Promise<{ id: string; resourceId?: string; title?: string }> {
  const memory = await agent.getMemory();
  const found = await memory?.listThreads({
    filter: { metadata: { channel_externalThreadId: externalThreadId } },
    perPage: 1,
  });
  const thread = found?.threads[0];
  if (!thread) {
    throw new Error(
      'Could not resolve this conversation to a memory thread yet. Send another message and try again.'
    );
  }
  return thread;
}

export async function taskContext({
  context,
  agentId,
  missing,
}: {
  context: TaskToolContext;
  agentId: string;
  missing: string;
}): Promise<{
  resolvedAgent: Agent;
  threadId: string;
  resourceId: string;
  ctx: ChannelContext;
}> {
  const ctx = channelContext(context.requestContext);
  const resourceId = context.agent?.resourceId;
  const externalThreadId = ctx.threadId;
  if (!(externalThreadId && resourceId)) {
    throw new Error(missing);
  }
  const resolvedAgent = context.mastra?.getAgentById(agentId);
  if (!resolvedAgent) {
    throw new Error(
      'Could not resolve this conversation to a memory thread yet. Send another message and try again.'
    );
  }
  const thread = await memoryThread({
    agent: resolvedAgent,
    externalThreadId,
  });
  return {
    resolvedAgent,
    threadId: thread.id,
    resourceId: thread.resourceId ?? resourceId,
    ctx,
  };
}
