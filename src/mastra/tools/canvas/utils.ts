import { z } from 'zod';
import type { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';

export const canvasIdSchema = z.string().min(1).describe('Slack canvas id.');

export function assertCanManageChannel({
  channelId,
  ctx,
}: {
  channelId: string;
  ctx: ReturnType<typeof channelContext>;
}): void {
  if (!ctx.channelId) {
    throw new Error('No current Slack channel to compare against.');
  }
  if (rawId(channelId) !== rawId(ctx.channelId)) {
    throw new Error(
      'Can only manage canvases for the current channel, not other channels.'
    );
  }
}
