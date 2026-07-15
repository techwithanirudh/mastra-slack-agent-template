import type { Message } from 'chat';
import { slack } from './client';

async function addReaction({
  name,
  target,
}: {
  name: string;
  target: { channel: string; timestamp: string };
}): Promise<void> {
  await slack.webClient.reactions
    .add({ ...target, name })
    .catch(() => undefined);
}

export async function withStatus({
  message,
  run,
}: {
  message: Message;
  run: () => Promise<void>;
}): Promise<void> {
  const { channel } = slack.decodeThreadId(message.threadId);
  const target = { channel, timestamp: message.id };
  await addReaction({ name: 'hourglass_flowing_sand', target });
  try {
    await run();
    await addReaction({ name: 'white_check_mark', target });
  } catch (error) {
    await addReaction({ name: 'x', target });
    throw error;
  } finally {
    await slack.webClient.reactions
      .remove({ ...target, name: 'hourglass_flowing_sand' })
      .catch(() => undefined);
  }
}
