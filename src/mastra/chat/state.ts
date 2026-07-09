import type { Thread } from 'chat';
import type { ThreadState } from '../types';

// ChannelHandler fixes Thread state to Record<string, unknown>, so the cast stays here.
export async function threadState(
  thread: Thread | undefined
): Promise<ThreadState | null> {
  return ((await thread?.state) ?? null) as ThreadState | null;
}
