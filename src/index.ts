import { mkdir, writeFile } from 'node:fs/promises';
import { env, requireEnv } from './config/env.js';
import { extractNewFavorites, markFavoritesSynced, readPendingFavorites } from './radio-paradise/favorites.js';
import { addTracks } from './tidal/client.js';
import { existingPlaylistTrackIds, findTidalTrack } from './tidal/match.js';
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
  const matches = await Promise.all(tracks.map((track) => findTidalTrack(track, country)));
  const resolved = matches.filter((match) => match.tidal);
  const toAdd = resolved.filter((match) => !present.has(match.tidal!.id));
  for (let index = 0; index < toAdd.length; index += 50) await addTracks(playlistId, country, toAdd.slice(index, index + 50).map((match) => match.tidal!.id));
  const report = {
    generatedAt: new Date().toISOString(), total: tracks.length,
    added: toAdd.map((match) => ({ source: match.track, tidalId: match.tidal!.id, score: match.score })),
    alreadyPresent: resolved.filter((match) => present.has(match.tidal!.id)).map((match) => match.track),
    notFound: matches.filter((match) => !match.tidal).map((match) => ({ source: match.track, score: match.score, reason: match.reason })),
  };
  await mkdir('reports', { recursive: true });
  const reportFile = `reports/sync-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  await markFavoritesSynced();
  console.log(`Added ${toAdd.length}; already present ${report.alreadyPresent.length}; review ${report.notFound.length} → ${reportFile}`);
}

const [command, input] = process.argv.slice(2);
if (command === 'extract') await extract(input);
else if (command === 'sync') await sync();
else if (command === 'tidal:login') await login();
else console.error('Usage: npm run extract [-- path/to/favorites.txt] | npm run sync');
