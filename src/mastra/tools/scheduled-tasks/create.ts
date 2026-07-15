import { createTool } from '@mastra/core/tools';
import { computeNextFireAt, validateCron } from '@mastra/core/workflows';
import { z } from 'zod';
import { agent as agentConfig, scheduledTasks } from '../../config';
import { taskContext } from '../../lib/memory';
import { input, output, scheduledTaskSchema } from '../../types/tools/index';
import { schedules } from './queries';
import { formatTask, scheduledTaskKind } from './utils';

function assertMinimumInterval({
  cron,
  timezone,
}: {
  cron: string;
  timezone?: string;
}): void {
  validateCron(cron, timezone);
  let previous = computeNextFireAt(cron, { timezone });
  for (let index = 1; index < 5; index += 1) {
    let fire: number;
    try {
      fire = computeNextFireAt(cron, { timezone, after: previous });
    } catch {
      break;
    }
    const gap = fire - previous;
    if (gap < scheduledTasks.minInterval) {
      throw new Error(
        `That schedule fires every ${Math.round(gap / 60_000)} minutes. Minimum interval is ${scheduledTasks.minInterval / 60_000} minutes.`
      );
    }
    previous = fire;
  }
}

export const createScheduledTaskTool = createTool({
  id: 'create_scheduled_task',
  description:
    'Create a recurring scheduled task from a cron expression. Use for recurring tasks only, not one-time reminders. The task runs where it was scheduled: the current Slack thread or DM. A top-level channel message is treated as a thread rooted at that message. Include an IANA timezone when the schedule is time-of-day sensitive. The minimum interval is 5 minutes.',
  inputSchema: input({
    task: z
      .string()
      .min(1)
      .describe('The recurring task to perform when the schedule fires.'),
    cron: z
      .string()
      .min(1)
      .describe(
        'Cron expression for the recurring schedule. Minimum interval: 5 minutes.'
      ),
    timezone: z
      .string()
      .min(1)
      .optional()
      .describe('IANA timezone, such as America/New_York.'),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Short human-readable label for the task.'),
    maxRuns: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Optional number of times to run before deleting the task.'),
  }),
  outputSchema: output({ task: scheduledTaskSchema }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Created scheduled task ${output?.task.id ?? ''}`,
      }),
    },
  },
  execute: async (input, context) => {
    const service = schedules(context);
    const {
      threadId,
      resourceId: memoryResourceId,
      ctx,
    } = await taskContext({
      context,
      agentId: agentConfig.id,
      missing: 'No current Slack thread/resource to schedule into.',
    });

    assertMinimumInterval({ cron: input.cron, timezone: input.timezone });

    const created = await service.create({
      agentId: agentConfig.id,
      cron: input.cron,
      prompt: `Scheduled task due now. Task: ${input.task}\n\nRespond in this same Slack conversation with the result.`,
      ...(input.name ? { name: input.name } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      threadId,
      resourceId: memoryResourceId,
      tagName: 'scheduled-task',
      ifActive: { behavior: 'persist' },
      ifIdle: {
        behavior: 'wake',
        streamOptions: {
          requestContext: context.requestContext?.toJSON(),
        },
      },
      metadata: {
        kind: scheduledTaskKind,
        task: input.task,
        createdBy: ctx.userId,
        ...(input.maxRuns ? { maxRuns: input.maxRuns, runsCompleted: 0 } : {}),
        createdIn: {
          channelId: ctx.channelId,
          isDM: ctx.isDM,
          threadId: ctx.threadId,
        },
      },
    });

    return {
      task: formatTask({ task: created }),
    };
  },
});
