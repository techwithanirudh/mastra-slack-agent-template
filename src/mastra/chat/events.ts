import { logger } from '../lib/logger';
import { slack } from './client';
import { chat } from './instance';

const STARTERS = [
  {
    title: 'Research with sources',
    message:
      'Research the latest developments in AI agents. Compare at least three reliable sources and give me a concise briefing with links.',
  },
  {
    title: 'Build a useful file',
    message:
      'Create a polished weekly planner as an HTML file, verify it in the sandbox, and upload it here.',
  },
  {
    title: 'Find Slack decisions',
    message:
      'Search Slack for decisions made in the last seven days and summarize them with links to the original messages.',
  },
  {
    title: 'Schedule a check-in',
    message:
      'Ask me for my timezone, then schedule a weekday 9 AM reminder to review my priorities.',
  },
];

async function setStarters(channelId: string, threadTs: string): Promise<void> {
  await slack
    .setSuggestedPrompts(channelId, threadTs, STARTERS)
    .catch((error: unknown) =>
      logger.error('[events] setSuggestedPrompts failed', { error })
    );
}

export function registerEvents(): void {
  const bot = chat();

  bot.onAssistantThreadStarted((event) =>
    setStarters(event.channelId, event.threadTs)
  );

  bot.onAssistantContextChanged((event) =>
    setStarters(event.channelId, event.threadTs)
  );
}
