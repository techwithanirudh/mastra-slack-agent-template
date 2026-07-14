import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  input,
  scheduledTaskSchema,
  summary,
  toolOutput,
} from '../../types/tools/index';
import {
  findOwnedTask,
  isAgentSchedule,
  schedules,
  taskScope,
} from './queries';
import { formatTask } from './utils';

export const resumeScheduledTaskTool = createTool({
  id: 'resume_scheduled_task',
  description: 'Restart a paused recurring scheduled task.',
  inputSchema: input({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  outputSchema: toolOutput({ task: scheduledTaskSchema }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(`Resumed scheduled task ${output?.task.id ?? ''}`),
    },
  },
  execute: async ({ id }, context) => {
    const service = schedules(context);
    const scope = taskScope(context);
    await findOwnedTask({ service, id, resourceId: scope.resourceId });
    const result = await service.resume(id);
    if (!isAgentSchedule(result)) {
      throw new Error(`Scheduled task ${id} is not an agent schedule.`);
    }
    const updated = result;

    return {
      task: formatTask({ task: updated, currentResourceId: scope.resourceId }),
    };
  },
});
