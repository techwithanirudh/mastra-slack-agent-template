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
});
