import { z } from 'zod';

export function input<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject(shape);
}

export function output<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject(shape);
}

export const optionalCursor = z.string().min(1).optional();
export const optionalPage = z.number().int().min(1).optional();
