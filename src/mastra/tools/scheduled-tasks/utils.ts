import type { AgentSchedule } from '@mastra/core/schedules';
import { z } from 'zod';
import {
  scheduledTaskMetadataSchema,
  scheduledTaskSchema,
} from '../../types/tools/index';

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
}): z.infer<typeof scheduledTaskSchema> {
  const createdIn = taskCreatedInSchema.safeParse(
    task.metadata?.createdIn
  ).data;
  const metadata = scheduledTaskMetadataSchema.safeParse(task.metadata).data;
  return scheduledTaskSchema.parse({
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
    task: metadata?.task,
    createdBy: metadata?.createdBy,
    maxRuns: metadata?.maxRuns,
    runsCompleted: metadata?.runsCompleted,
    canManage: currentResourceId
      ? task.resourceId === currentResourceId
      : undefined,
  });
}
