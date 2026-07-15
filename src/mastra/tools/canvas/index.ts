import { createCanvasTool, createChannelCanvasTool } from './create';
import { editCanvasTool } from './edit';
import { listCanvasesTool } from './list';
import { readCanvasTool } from './read';
import { lookupCanvasSectionsTool } from './sections';

export const canvasTools = {
  create_canvas: createCanvasTool,
  create_channel_canvas: createChannelCanvasTool,
  list_canvases: listCanvasesTool,
  read_canvas: readCanvasTool,
  edit_canvas: editCanvasTool,
  lookup_canvas_sections: lookupCanvasSectionsTool,
};
