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

// Stricter shapes for the two responses whose nested fields the code relies on.
// A renamed field would otherwise parse fine and silently look like "no results".
const resourceRef = z.object({ id: z.string().min(1), type: z.string().min(1) }).passthrough();

/** GET /searchResults: one search result whose `tracks` relationship lists track ids in relevance order. */
export const searchResponseSchema = tidalDocumentSchema.extend({
  data: z.array(z.object({
    id: z.string().min(1),
    relationships: z.object({ tracks: z.object({ data: z.array(resourceRef) }).passthrough() }).passthrough(),
  }).passthrough()).min(1),
});

/** GET /playlists/{id}/relationships/items: item refs plus the cursor for the next page. */
export const playlistItemsResponseSchema = tidalDocumentSchema.extend({
  data: z.array(resourceRef),
  links: z.object({ meta: z.object({ nextCursor: z.string().optional() }).passthrough().optional() }).passthrough().optional(),
});

export type RpTrack = z.infer<typeof rpTrackSchema>;
export type TidalResource = z.infer<typeof tidalResourceSchema>;

export function zodMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`).join('; ');
}
