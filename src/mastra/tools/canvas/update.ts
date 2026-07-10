import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';

const operationByMode = {
  replace: 'replace',
  append: 'insert_at_end',
  prepend: 'insert_at_start',
} as const;

export const updateCanvasTool = createTool({
  id: 'update_canvas',
  description:
    'Change the markdown content of an existing Slack canvas by its canvas id. Defaults to replacing the whole canvas; use append or prepend to add content instead.',
  inputSchema: z.object({
    canvasId: z.string().min(1).describe('The canvas id.'),
    markdown: z.string().min(1).describe('Markdown content to apply.'),
    mode: z
      .enum(['replace', 'append', 'prepend'])
      .default('replace')
      .describe(
        'replace overwrites the whole canvas; append and prepend add content at the end or start.'
      ),
  }),
  execute: async ({ canvasId, markdown, mode }) => {
    await slack.webClient.canvases.edit({
      canvas_id: canvasId,
      changes: [
        {
          operation: operationByMode[mode],
          document_content: { type: 'markdown', markdown },
        },
      ],
    });
    return {
      success: true,
      canvasId,
      message: `Updated canvas ${canvasId} (${mode}).`,
    };
  },
});
