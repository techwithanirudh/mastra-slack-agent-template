import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { summarizer } from '../../agents/summarizer';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { input, summary, toolOutput } from '../../types/tools/index';
import { joinChannel } from './utils';

export const summarizeThreadTool = createTool({
  id: 'summarize_thread',
  description:
    'Summarize a conversation thread, defaulting to the current thread, without returning the full transcript to the main model context. Prefer this over read_conversation_history for long threads; read raw history only when exact wording matters.',
  inputSchema: input({
    threadId: z
      .string()
      .optional()
      .describe(
        'Thread to summarize (slack:C...:ts). Defaults to the current thread.'
      ),
    instructions: z
      .string()
      .optional()
      .describe('Optional focus or format for the summary.'),
  }),
  outputSchema: toolOutput({
    messageCount: z.number().int().min(1),
    summary: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(`Summarized ${output?.messageCount ?? 0} messages`),
    },
  },
  execute: async ({ threadId, instructions }, context) => {
    const ctx = channelContext(context?.requestContext);
    const target = threadId ?? ctx.threadId;
    if (!target) {
      throw new Error('No thread to summarize.');
    }

    const channelId = chatChannelId(slack.channelIdFromThreadId(target));
    await joinChannel(channelId);

    const result = await slack.fetchMessages(target, {
      limit: 100,
      direction: 'backward',
    });
    if (result.messages.length === 0) {
      throw new Error('No messages found in the thread.');
    }

    const lines = result.messages.map((message) => {
      const author = message.author.fullName || message.author.userName;
      return `${author}: ${message.text}`;
    });
    const transcript = lines.join('\n');

    const prompt = `${instructions ? `${instructions}\n\n` : ''}Summarize this thread clearly and concisely. Preserve decisions, open questions, and action items when present.\n\n${transcript}`;
    const { text } = await summarizer.generate(prompt);

    return {
      messageCount: result.messages.length,
      summary: text,
    };
  },
});
