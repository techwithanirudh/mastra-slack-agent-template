import type { RequestContext } from '@mastra/core/request-context';
import type { ChannelContext } from '../types';

export function channelContext(
  requestContext?: RequestContext
): ChannelContext {
  return requestContext?.get<'channel', ChannelContext>('channel') ?? {};
}
