import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input, output, scheduledTaskSchema } from '../../types/tools/index';
import {
  findOwnedTask,
  isAgentSchedule,
  schedules,
  taskScope,
} from './queries';
import { formatTask } from './utils';

export const pauseScheduledTaskTool = createTool({
  id: 'pause_scheduled_task',
  description:
    'Temporarily stop a recurring scheduled task without deleting it.',
  inputSchema: input({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  outputSchema: output({ task: scheduledTaskSchema }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Paused scheduled task ${output?.task.id ?? ''}`,
      }),
    },
  },
  execute: async ({ id }, context) => {
    const service = schedules(context);
    const scope = taskScope(context);
    await findOwnedTask({ service, id, resourceId: scope.resourceId });
    const result = await service.pause(id);
    if (!isAgentSchedule(result)) {
      throw new Error(`Scheduled task ${id} is not an agent schedule.`);
    }
    const updated = result;

    return {
      task: formatTask({ task: updated, currentResourceId: scope.resourceId }),
    };
  },
});
