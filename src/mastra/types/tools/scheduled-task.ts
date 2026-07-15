import { z } from 'zod';

export const scheduledTaskSchema = z.strictObject({
  id: z.string(),
  name: z.string().optional(),
  status: z.enum(['active', 'paused']),
  cron: z.string(),
  timezone: z.string().optional(),
  nextFireAt: z.string(),
  lastFireAt: z.string().optional(),
  threadId: z.string().optional(),
  task: z.string().optional(),
  createdBy: z.string().optional(),
  canManage: z.boolean().optional(),
  maxRuns: z.number().int().min(1).optional(),
  runsCompleted: z.number().int().min(0).optional(),
});

export const scheduledTaskMetadataSchema = z.looseObject({
  kind: z.literal('scheduled-task'),
  task: z.string(),
  createdBy: z.string().optional(),
  maxRuns: z.number().int().min(1).optional(),
  runsCompleted: z.number().int().min(0).optional(),
  createdIn: z.object({
    channelId: z.string().optional(),
    isDM: z.boolean().optional(),
    threadId: z.string().optional(),
  }),
});
