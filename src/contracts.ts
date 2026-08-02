import { z } from 'zod';

export const rpTrackSchema = z.object({
  title: z.string().min(1).max(220),
  artist: z.string().min(1).max(160),
  rating: z.number().int().min(1).max(10).optional(),
}).strict();

export const tidalResourceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  attributes: z.object({ title: z.string().optional(), name: z.string().optional() }).passthrough().optional(),
  relationships: z.object({
    artists: z.object({ data: z.array(z.object({ id: z.string().min(1) })) }).optional(),
  }).passthrough().optional(),
}).passthrough();

export const tidalDocumentSchema = z.object({
  data: z.union([tidalResourceSchema, z.array(tidalResourceSchema)]).optional(),
  included: z.array(tidalResourceSchema).optional(),
}).passthrough();

export type RpTrack = z.infer<typeof rpTrackSchema>;
export type TidalResource = z.infer<typeof tidalResourceSchema>;

export function zodMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`).join('; ');
}
