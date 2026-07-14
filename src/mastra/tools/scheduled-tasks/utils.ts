import type { AgentSchedule } from '@mastra/core/schedules';
import { z } from 'zod';

export const scheduledTaskKind = 'scheduled-task';

export const taskCreatedInSchema = z.object({
  threadId: z.string().optional(),
});

export function formatTask({
  task,
  currentResourceId,
}: {
  task: AgentSchedule;
  currentResourceId?: string;
}): Record<string, unknown> {
  const createdIn = taskCreatedInSchema.safeParse(
    task.metadata?.createdIn
  ).data;
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    cron: task.cron,
    timezone: task.timezone,
    nextFireAt: new Date(task.nextFireAt).toISOString(),
    lastFireAt: task.lastFireAt
      ? new Date(task.lastFireAt).toISOString()
      : undefined,
    threadId: createdIn?.threadId ?? task.threadId,
    task: task.metadata?.task,
    createdBy: task.metadata?.createdBy,
    canManage: currentResourceId
      ? task.resourceId === currentResourceId
      : undefined,
  };
}
