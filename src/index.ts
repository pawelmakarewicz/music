import { mkdir, writeFile } from 'node:fs/promises';
import { env, requireEnv } from './config/env.js';
import { extractNewFavorites, markFavoritesSynced, readPendingFavorites } from './radio-paradise/favorites.js';
import { addTracks } from './tidal/client.js';
import { existingPlaylistTrackIds, findTidalTrack, type Match } from './tidal/match.js';
import type { RpTrack } from './contracts.js';
import { login } from './tidal/auth.js';

async function extract(input?: string) {
  const result = await extractNewFavorites(input ?? env.RP_FAVORITES_FILE, env.RP_MIN_RATING);
  console.log(`Found ${result.total} favourites; ${result.added} new since last successful sync.`);
}

async function sync() {
  const tracks = await readPendingFavorites();
  const country = env.TIDAL_COUNTRY_CODE.toUpperCase();
  const playlistId = requireEnv('TIDAL_PLAYLIST_ID');
  const present = await existingPlaylistTrackIds(playlistId, country);
  // Search a few tracks at a time so TIDAL does not rate-limit us; one failed
  // search is reported instead of aborting the whole sync.
  const matches: Match[] = new Array(tracks.length);
  const errors: { source: RpTrack; error: string }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < tracks.length) {
      const index = next++;
      try { matches[index] = await findTidalTrack(tracks[index], country); }
      catch (error) {
        errors.push({ source: tracks[index], error: error instanceof Error ? error.message : String(error) });
        matches[index] = { track: tracks[index], score: 0, reason: 'Search failed' };
      }
      if ((index + 1) % 25 === 0) console.log(`Searched ${index + 1}/${tracks.length}…`);
    }
  }));
  const resolved = matches.filter((match) => match.tidal);
  const toAdd = resolved.filter((match) => !present.has(match.tidal!.id));
  for (let index = 0; index < toAdd.length; index += 50) await addTracks(playlistId, country, toAdd.slice(index, index + 50).map((match) => match.tidal!.id));
  const report = {
    generatedAt: new Date().toISOString(), total: tracks.length,
    added: toAdd.map((match) => ({ source: match.track, tidalId: match.tidal!.id, score: match.score })),
    alreadyPresent: resolved.filter((match) => present.has(match.tidal!.id)).map((match) => match.track),
    notFound: matches.filter((match) => !match.tidal).map((match) => ({ source: match.track, score: match.score, reason: match.reason })),
    errors,
  };
  await mkdir('reports', { recursive: true });
  const reportFile = `reports/sync-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  await markFavoritesSynced(errors.map((entry) => entry.source));
  console.log(`Added ${toAdd.length}; already present ${report.alreadyPresent.length}; review ${report.notFound.length}; errors ${errors.length} → ${reportFile}`);
}

const [command, input] = process.argv.slice(2);
if (command === 'extract') await extract(input);
else if (command === 'sync') await sync();
else if (command === 'tidal:login') await login();
else console.error('Usage: npm run extract [-- path/to/favorites.txt] | npm run sync');
