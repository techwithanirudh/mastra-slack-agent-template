import { createPostgresState } from '@chat-adapter/state-pg';
import { z } from 'zod';
import { env } from '@/env';

const state = createPostgresState({ url: env.DATABASE_URL });

try {
  await state.connect();
  const result = await state.getClient().query(
    `SELECT thread_id
     FROM chat_state_subscriptions
     WHERE key_prefix = $1 AND thread_id ~ $2
     ORDER BY thread_id`,
    ['chat-sdk', '^slack:D[A-Z0-9]+:$']
  );
  const threadIds = z
    .array(z.object({ thread_id: z.string() }))
    .parse(result.rows)
    .map(({ thread_id }) => thread_id);

  if (threadIds.length === 0) {
    console.log('No legacy DM subscriptions found.');
  } else if (process.argv.includes('--apply')) {
    const deleted = await state.getClient().query(
      `DELETE FROM chat_state_subscriptions
       WHERE key_prefix = $1 AND thread_id = ANY($2::text[])
       RETURNING thread_id`,
      ['chat-sdk', threadIds]
    );
    console.log(`Removed ${deleted.rowCount ?? 0} legacy DM subscriptions.`);
  } else {
    console.log(`Found ${threadIds.length} legacy DM subscriptions:`);
    console.log(threadIds.join('\n'));
    console.log('\nDry run only. Re-run with --apply to remove them.');
  }
} finally {
  await state.disconnect();
}
