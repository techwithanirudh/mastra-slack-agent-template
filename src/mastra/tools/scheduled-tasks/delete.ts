import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input, summary, toolOutput } from '../../types/tools/index';
import { findOwnedTask, schedules, taskScope } from './queries';

export const deleteScheduledTaskTool = createTool({
  id: 'delete_scheduled_task',
  description: 'Permanently cancel a recurring scheduled task.',
  inputSchema: input({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  outputSchema: toolOutput({ id: z.string() }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(`Deleted scheduled task ${output?.id ?? ''}`),
    },
  },
  execute: async ({ id }, context) => {
    const service = schedules(context);
    const scope = taskScope(context);
    await findOwnedTask({ service, id, resourceId: scope.resourceId });
    await service.delete(id);

    return {
      id,
    };
  },
});
