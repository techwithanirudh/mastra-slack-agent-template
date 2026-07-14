import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../config';
import { taskContext } from '../lib/memory';
import { input, summary, toolOutput } from '../types/tools/index';
import { isAgentSchedule } from './scheduled-tasks/queries';

export const waitTool = createTool({
  id: 'wait',
  description:
    'Pause the conversation and automatically resume it later, without blocking. Use to space out polling or give a background job or external event time to progress. Call this last, say what you are waiting for, then stop; you will be woken up automatically when the wait is over. Calling it always ends your turn, the same as skip. Max 300 seconds; for a longer or recurring wait, use create_scheduled_task instead.',
  inputSchema: input({
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
  outputSchema: toolOutput({ seconds: z.number() }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(`Waiting ${output?.seconds ?? 0} seconds`),
    },
  },
  execute: async ({ seconds, reason }, context) => {
    const schedules = context.mastra?.schedules;
    if (!schedules) {
      throw new Error(
        'Could not resolve this conversation to a memory thread yet. Send another message and try again.'
      );
    }
    const { threadId, resourceId: memoryResourceId } = await taskContext({
      context,
      agentId: agentConfig.id,
      missing: 'No current Slack thread/resource to wait in.',
    });

    const previous = await schedules.list({ agentId: agentConfig.id });
    await Promise.all(
      previous
        .filter(
          (task) =>
            isAgentSchedule(task) &&
            task.metadata?.kind === 'wait' &&
            task.lastFireAt !== undefined
        )
        .map((task) => schedules.delete(task.id))
    );

    const fireAt = new Date(Date.now() + seconds * 1000);
    const cron = `${fireAt.getUTCSeconds()} ${fireAt.getUTCMinutes()} ${fireAt.getUTCHours()} ${fireAt.getUTCDate()} ${fireAt.getUTCMonth() + 1} *`;

    await schedules.create({
      agentId: agentConfig.id,
      cron,
      timezone: 'UTC',
      prompt: `Your ${seconds}s wait is over (waiting for: ${reason}). Continue and respond in this same Slack conversation with the result.`,
      threadId,
      resourceId: memoryResourceId,
      signalType: 'notification',
      tagName: 'wait-resume',
      ifActive: { behavior: 'persist' },
      ifIdle: {
        behavior: 'wake',
        streamOptions: { requestContext: context.requestContext?.toJSON() },
      },
      metadata: { kind: 'wait' },
    });

    return {
      seconds,
    };
  },
});
