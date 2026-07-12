import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { canvasIdSchema } from './utils';

export const lookupCanvasSectionsTool = createTool({
  id: 'lookup_canvas_sections',
  description:
    'Find Slack canvas sections by header type and/or contained text before editing.',
  inputSchema: z
    .object({
      canvasId: canvasIdSchema,
      sectionTypes: z
        .tuple([z.enum(['any_header', 'h1', 'h2', 'h3'])])
        .rest(z.enum(['any_header', 'h1', 'h2', 'h3']))
        .optional(),
      containsText: z.string().min(1).optional(),
    })
    .refine(({ sectionTypes, containsText }) => sectionTypes || containsText, {
      message: 'Provide sectionTypes, containsText, or both.',
    }),
  execute: async ({ canvasId, sectionTypes, containsText }) => {
    if (sectionTypes) {
      const response = await slack.webClient.canvases.sections.lookup({
        canvas_id: canvasId,
        criteria: {
          section_types: sectionTypes,
          ...(containsText ? { contains_text: containsText } : {}),
        },
      });
      return {
        success: true,
        canvasId,
        sections: response.sections ?? [],
        message: `Found ${response.sections?.length ?? 0} matching sections.`,
      };
    }
    if (!containsText) {
      throw new Error('Provide sectionTypes, containsText, or both.');
    }
    const response = await slack.webClient.canvases.sections.lookup({
      canvas_id: canvasId,
      criteria: { contains_text: containsText },
    });
    return {
      success: true,
      canvasId,
      sections: response.sections ?? [],
      message: `Found ${response.sections?.length ?? 0} matching sections.`,
    };
  },
});
