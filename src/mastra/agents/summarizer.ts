import { Agent } from '@mastra/core/agent';
import { agent as config } from '../config';
import { summarizer as summarizerModel } from '../providers';

export const summarizer = new Agent({
  id: 'summarizer',
  name: 'Summarizer',
  description:
    'Summarizes a Slack conversation transcript concisely, preserving decisions, open questions, and action items.',
  instructions:
    'You summarize Slack threads. Be clear and concise. Preserve decisions, open questions, and action items when present. Output only the summary, no preamble.',
  model: summarizerModel,
  defaultOptions: {
    modelSettings: { maxOutputTokens: config.maxTokens.output },
  },
});
