import 'dotenv/config';
import { z } from 'zod';

const optionalNonEmpty = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  z.string().min(1).optional(),
);

export const env = z.object({
  RP_FAVORITES_FILE: z.string().min(1).default('rp_favorites.txt'),
  RP_MIN_RATING: z.coerce.number().int().min(1).max(10).default(7),
  TIDAL_CLIENT_ID: optionalNonEmpty,
  TIDAL_REDIRECT_URI: optionalNonEmpty,
  TIDAL_ACCESS_TOKEN: optionalNonEmpty,
  TIDAL_PLAYLIST_ID: z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? undefined : value,
    z.string().uuid().optional(),
  ),
  TIDAL_COUNTRY_CODE: z.string().regex(/^[A-Za-z]{2}$/).default('PL'),
}).parse({
  RP_FAVORITES_FILE: process.env.RP_FAVORITES_FILE,
  RP_MIN_RATING: process.env.RP_MIN_RATING,
  TIDAL_CLIENT_ID: process.env.TIDAL_CLIENT_ID,
  TIDAL_REDIRECT_URI: process.env.TIDAL_REDIRECT_URI,
  TIDAL_ACCESS_TOKEN: process.env.TIDAL_ACCESS_TOKEN,
  TIDAL_PLAYLIST_ID: process.env.TIDAL_PLAYLIST_ID,
  TIDAL_COUNTRY_CODE: process.env.TIDAL_COUNTRY_CODE,
});

export function requireEnv(name: 'TIDAL_CLIENT_ID' | 'TIDAL_REDIRECT_URI' | 'TIDAL_ACCESS_TOKEN' | 'TIDAL_PLAYLIST_ID'): string {
  const value = env[name];
  if (!value) throw new Error(`Missing ${name}; copy .env.example to .env and fill it in.`);
  return value;
}
