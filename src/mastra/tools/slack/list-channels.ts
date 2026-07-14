import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import {
  input,
  optionalCursor,
  summary,
  toolOutput,
} from '../../types/tools/index';

const channelSchema = z.strictObject({
  channelId: z.string(),
  name: z.string().optional(),
  archived: z.boolean(),
  member: z.boolean(),
  private: z.boolean(),
  memberCount: z.number().optional(),
  purpose: z.string().optional(),
  topic: z.string().optional(),
});

const rawChannelSchema = z
  .looseObject({
    id: z.string(),
    name: z.string().optional(),
    is_archived: z.boolean().optional(),
    is_member: z.boolean().optional(),
    is_private: z.boolean().optional(),
    num_members: z.number().optional(),
    purpose: z.looseObject({ value: z.string().optional() }).optional(),
    topic: z.looseObject({ value: z.string().optional() }).optional(),
  })
  .transform((channel) => ({
    channelId: channel.id,
    name: channel.name,
    archived: channel.is_archived ?? false,
    member: channel.is_member ?? false,
    private: channel.is_private ?? false,
    memberCount: channel.num_members,
    purpose: channel.purpose?.value || undefined,
    topic: channel.topic?.value || undefined,
  }));

export const listChannelsTool = createTool({
  id: 'list_channels',
  description:
    'List or filter Slack channels visible to the bot. Search applies to channel names, topics, and purposes within each paginated Slack result page.',
  inputSchema: input({
    query: z.string().min(1).optional(),
    includeArchived: z.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: optionalCursor,
  }),
  outputSchema: toolOutput({
    channels: z.array(channelSchema),
    nextCursor: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) =>
        summary(`Found ${output?.channels.length ?? 0} channels`),
    },
  },
  execute: async ({ query, includeArchived, limit, cursor }) => {
    const response = await slack.webClient.conversations.list({
      cursor,
      exclude_archived: !includeArchived,
      limit,
      types: 'public_channel,private_channel',
    });
    const channels = (response.channels ?? []).map((channel) =>
      rawChannelSchema.parse(channel)
    );
    const normalizedQuery = query?.toLowerCase();
    return {
      channels: normalizedQuery
        ? channels.filter((channel) =>
            [channel.name, channel.topic, channel.purpose].some((value) =>
              value?.toLowerCase().includes(normalizedQuery)
            )
          )
        : channels,
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  },
});
