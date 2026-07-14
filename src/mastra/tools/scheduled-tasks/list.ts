import type { AgentSchedule } from '@mastra/core/schedules';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent } from '../../config';
import {
  input,
  scheduledTaskSchema,
  summary,
  toolOutput,
} from '../../types/tools/index';
import { canViewTask, isAgentSchedule, schedules, taskScope } from './queries';
import { formatTask, scheduledTaskKind } from './utils';

export const listScheduledTasksTool = createTool({
  id: 'list_scheduled_tasks',
  description:
    'List recurring scheduled tasks. Use before pausing, resuming, or deleting one if the target id is unclear.',
  inputSchema: input({}),
  outputSchema: toolOutput({ tasks: z.array(scheduledTaskSchema) }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(`Found ${output?.tasks.length ?? 0} scheduled tasks`),
    },
  },
  execute: async (_input, context) => {
    const scope = taskScope(context);
    const tasks = await schedules(context).list({ agentId: agent.id });
    const visible = tasks.filter(
      (task): task is AgentSchedule =>
        isAgentSchedule(task) &&
        task.metadata?.kind === scheduledTaskKind &&
        canViewTask({ task, ...scope })
    );

    return {
      tasks: visible.map((task) =>
        formatTask({ task, currentResourceId: scope.resourceId })
      ),
    };
  },
});
