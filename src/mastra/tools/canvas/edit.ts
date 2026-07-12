import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { canvasIdSchema } from './utils';

const markdownContentSchema = z.object({
  type: z.literal('markdown').default('markdown'),
  markdown: z.string().min(1).describe('Markdown canvas content.'),
});

const canvasChangeSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('insert_after'),
    section_id: z.string().min(1),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('insert_before'),
    section_id: z.string().min(1),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('insert_at_start'),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('insert_at_end'),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('replace'),
    section_id: z.string().min(1).optional(),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('delete'),
    section_id: z.string().min(1),
  }),
]);

export const editCanvasTool = createTool({
  id: 'edit_canvas',
  description:
    'Edit a Slack canvas by applying ordered markdown changes: insert, replace, or delete sections. Use lookup_canvas_sections to find section ids first.',
  inputSchema: z.object({
    canvasId: canvasIdSchema,
    changes: z.tuple([canvasChangeSchema]).rest(canvasChangeSchema),
  }),
  requireApproval: true,
  execute: async ({ canvasId, changes }) => {
    await slack.webClient.canvases.edit({
      canvas_id: canvasId,
      changes,
    });
    return {
      success: true,
      canvasId,
      message: `Edited canvas ${canvasId}.`,
    };
  },
});
