import { env } from '@/env';
import { chatLogger } from '../lib/logger/chat';
import { SlackAgentAdapter } from './adapter';

export const slack = new SlackAgentAdapter({
  mode: 'socket',
  agentView: true,
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: chatLogger,
});
