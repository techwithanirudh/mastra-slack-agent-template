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

// Static welcome shown on the App Home tab. Keep it generic: describe what the
// assistant does, not a specific identity. Replace with real settings controls
// once the template has any.
const HOME_VIEW = {
  type: 'home',
  blocks: [
    {
      type: 'header',
      text: { type: 'plain_text', text: '👋 Your AI assistant' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "Message me directly here, or @mention me in any channel, and I'll help you get things done.",
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*What I can do*\n• Search the web and Slack, with sources\n• Write and run code in a secure sandbox\n• Generate images and build files\n• Browse websites and capture screenshots\n• Create and manage recurring scheduled tasks\n• Read, create, and update Slack canvases',
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*How to start*\nOpen a direct message and just ask, or @mention me in a channel. In a thread, keep replying to steer me without starting over.',
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'More settings coming soon.' }],
    },
  ],
};

function publishHome(userId: string): Promise<void> {
  return slack
    .publishHomeView(userId, HOME_VIEW)
    .catch((error: unknown) =>
      logger.error('[events] publishHome failed', { error })
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

  bot.onAppHomeOpened((event) => publishHome(event.userId));
}
