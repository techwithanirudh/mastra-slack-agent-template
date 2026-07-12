import { createCanvasTool, createChannelCanvasTool } from './create';
import { deleteCanvasTool } from './delete';
import { editCanvasTool } from './edit';
import { readCanvasTool } from './read';
import { lookupCanvasSectionsTool } from './sections';

export const canvasTools = {
  create_canvas: createCanvasTool,
  create_channel_canvas: createChannelCanvasTool,
  read_canvas: readCanvasTool,
  edit_canvas: editCanvasTool,
  delete_canvas: deleteCanvasTool,
  lookup_canvas_sections: lookupCanvasSectionsTool,
};
