import { createCanvasTool } from './create';
import { readCanvasTool } from './read';
import { updateCanvasTool } from './update';

export const canvasTools = {
  create_canvas: createCanvasTool,
  read_canvas: readCanvasTool,
  update_canvas: updateCanvasTool,
};
