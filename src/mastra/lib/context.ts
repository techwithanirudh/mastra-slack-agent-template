import type { RequestContext } from '@mastra/core/request-context';
import type { ChannelContext, SlackAgentRequestContext } from '../types';

export function channelContext(
  requestContext?: RequestContext
): ChannelContext {
  return (
    (requestContext as SlackAgentRequestContext | undefined)?.get('channel') ??
    {}
  );
}
