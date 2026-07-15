import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { input, output } from '../../types/tools/index';
import { canvasIdSchema } from './utils';

export const lookupCanvasSectionsTool = createTool({
  id: 'lookup_canvas_sections',
  description:
    'Find Slack canvas sections by header type and/or contained text before editing.',
  inputSchema: input({
    canvasId: canvasIdSchema,
    sectionTypes: z
      .array(z.enum(['any_header', 'h1', 'h2', 'h3']))
      .min(1)
      .optional(),
    containsText: z.string().min(1).optional(),
  }).refine(({ sectionTypes, containsText }) => sectionTypes || containsText, {
    message: 'Provide sectionTypes, containsText, or both.',
  }),
  outputSchema: output({
    canvasId: z.string(),
    sections: z.array(z.unknown()),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Found ${output?.sections.length ?? 0} sections in canvas ${input?.canvasId ?? output?.canvasId ?? ''}`,
      }),
    },
  },
  execute: async ({ canvasId, sectionTypes, containsText }) => {
    if (sectionTypes?.length) {
      const response = await slack.webClient.canvases.sections.lookup({
        canvas_id: canvasId,
        criteria: {
          section_types: [sectionTypes[0], ...sectionTypes.slice(1)],
          ...(containsText ? { contains_text: containsText } : {}),
        },
      });
      return {
        canvasId,
        sections: response.sections ?? [],
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
      canvasId,
      sections: response.sections ?? [],
    };
  },
});
