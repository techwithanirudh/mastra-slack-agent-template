import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { resolveMemoryThread } from '../lib/memory';

// Blocking inside execute would hold the whole turn (and Slack's "Working..."
// status) open for the full duration. Instead this ends the turn now (paired
// with stopWhen in orchestrator.ts) and wakes the same thread later via a
// signal, the same wake-into-a-channel-thread path scheduled tasks use, so it
// renders in Slack, including tool cards, the same way a live turn would.
export const waitTool = createTool({
  id: 'wait',
  description:
    'Pause the conversation and automatically resume it later, without blocking. Use to space out polling or give a background job or external event time to progress. Call this last, say what you are waiting for, then stop; you will be woken up automatically when the wait is over. Max 300 seconds; for a longer or recurring wait, use create_scheduled_task instead.',
  inputSchema: z.object({
    seconds: z
      .number()
      .int()
      .min(1)
      .max(300)
      .describe('How many seconds to wait (1-300).'),
    reason: z
      .string()
      .min(1)
      .describe('What you are waiting for, and what to do once it resumes.'),
  }),
  execute: async ({ seconds, reason }, context) => {
    const ctx = channelContext(context?.requestContext);
    const resourceId = context.agent?.resourceId;
    const externalThreadId = ctx.threadId;
    if (!(externalThreadId && resourceId)) {
      throw new Error('No current Slack thread/resource to wait in.');
    }

    const resolvedAgent = context.mastra?.getAgentById(agentConfig.id);
    if (!resolvedAgent) {
      throw new Error(
        'Could not resolve this conversation to a memory thread yet. Send another message and try again.'
      );
    }
    const memoryThread = await resolveMemoryThread(
      resolvedAgent,
      externalThreadId
    );
    const threadId = memoryThread.id;
    const memoryResourceId = memoryThread.resourceId ?? resourceId;
    const { requestContext } = context;

    setTimeout(() => {
      const { accepted } = resolvedAgent.sendSignal(
        {
          type: 'notification',
          tagName: 'wait-resume',
          contents: `Your ${seconds}s wait is over (waiting for: ${reason}). Continue and respond in this same Slack conversation with the result.`,
        },
        {
          resourceId: memoryResourceId,
          threadId,
          ifActive: { behavior: 'persist' },
          ifIdle: {
            behavior: 'wake',
            streamOptions: { requestContext },
          },
        }
      );
      accepted.catch((error: unknown) =>
        logger.error('[wait] failed to resume after wait', {
          threadId,
          error,
        })
      );
    }, seconds * 1000);

    return {
      success: true,
      seconds,
      message: `Waiting ${seconds}s for ${reason}. This turn is ending now; I'll continue automatically once the wait is over.`,
    };
  },
});
