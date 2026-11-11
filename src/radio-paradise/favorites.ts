import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { rpTrackSchema, type RpTrack, zodMessage } from '../contracts.js';
import { clean, key } from '../shared/text.js';

const dataDirectory = '.data';
export const pendingTracksFile = `${dataDirectory}/radio-paradise-tracks.json`;
const currentFavoritesFile = `${dataDirectory}/rp-favorites-current.json`;
const syncedFavoritesFile = `${dataDirectory}/rp-favorites-snapshot.json`;

function parseCsvRow(row: string): string[] {
  const fields: string[] = []; let field = ''; let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"' && quoted && row[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(clean(field)); field = ''; }
    else field += char;
  }
  fields.push(clean(field));
  return fields;
}

function parseCsv(csv: string): RpTrack[] {
  const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(parseCsvRow);
  const headers = rows.shift()?.map(key) ?? [];
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const title = column('title', 'song', 'track', 'song title');
  const artist = column('artist', 'artist name');
  const rating = column('rating', 'your rating');
  if (title < 0 || artist < 0) throw new Error(`Unsupported RP CSV headers: ${headers.join(', ')}`);
  return rows.flatMap((row) => {
    const value = Number(row[rating]);
    const parsed = rpTrackSchema.safeParse({ title: row[title], artist: row[artist], ...(Number.isInteger(value) ? { rating: value } : {}) });
    return parsed.success ? [parsed.data] : [];
  });
}

function parseText(text: string): RpTrack[] {
  const tracks = text.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf(' - ');
    if (separator < 1) return [];
    const parsed = rpTrackSchema.safeParse({ title: clean(line.slice(0, separator)), artist: clean(line.slice(separator + 3)) });
    return parsed.success ? [parsed.data] : [];
  });
  if (!tracks.length) throw new Error('No `Title - Artist` entries found in RP favourites file.');
  return tracks;
}

function id(track: RpTrack): string { return `${key(track.artist)}::${key(track.title)}`; }

async function readTrackList(file: string): Promise<RpTrack[]> {
  const parsed = z.array(rpTrackSchema).safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success) throw new Error(`Local tracks contract violation: ${zodMessage(parsed.error)}`);
  return parsed.data;
}

async function readSnapshot(): Promise<RpTrack[]> {
  try { return await readTrackList(syncedFavoritesFile); }
  catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function extractNewFavorites(sourceFile: string, minRating: number): Promise<{ total: number; added: number }> {
  const source = await readFile(resolve(sourceFile), 'utf8');
  const tracks = sourceFile.toLowerCase().endsWith('.csv') ? parseCsv(source) : parseText(source);
  const accepted = tracks.filter((track) => track.rating === undefined || track.rating >= minRating);
  if (!accepted.length) throw new Error('No accepted tracks in RP favourites file.');
  const previous = await readSnapshot();
  const previousIds = new Set(previous.map(id));
  const added = accepted.filter((track) => !previousIds.has(id(track)));
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(currentFavoritesFile, `${JSON.stringify(accepted, null, 2)}\n`);
  await writeFile(pendingTracksFile, `${JSON.stringify(added, null, 2)}\n`);
  return { total: accepted.length, added: added.length };
}

export async function readPendingFavorites(): Promise<RpTrack[]> { return readTrackList(pendingTracksFile); }

/** Records the current favourites as synced, except `retry` tracks, which stay pending for the next run. */
export async function markFavoritesSynced(retry: RpTrack[] = []): Promise<void> {
  const skip = new Set(retry.map(id));
  const current = (await readTrackList(currentFavoritesFile)).filter((track) => !skip.has(id(track)));
  await writeFile(syncedFavoritesFile, `${JSON.stringify(current, null, 2)}\n`);
}
