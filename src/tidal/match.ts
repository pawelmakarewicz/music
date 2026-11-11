import type { RpTrack, TidalResource } from '../contracts.js';
import { clean, similarity } from '../shared/text.js';
import { tidalGet } from './client.js';

export type Match = { track: RpTrack; tidal?: TidalResource; score: number; reason?: string };

export async function findTidalTrack(track: RpTrack, country: string): Promise<Match> {
  const result = await tidalGet('/searchResults', {
    'filter[query]': `${track.artist} ${track.title}`, countryCode: country, include: 'tracks,tracks.artists',
  });
  const searchResult = [result.data].flat()[0] as { relationships?: { tracks?: { data?: { id: string }[] } } } | undefined;
  // TIDAL's own relevance order; `included` is not guaranteed to follow it.
  const relevance = new Map((searchResult?.relationships?.tracks?.data ?? []).map((ref, index) => [ref.id, index]));
  const all = (result.included ?? []).filter((item): item is TidalResource => item?.type === 'tracks');
  const artists = new Map((result.included ?? []).filter((x) => x.type === 'artists').map((x) => [x.id, x.attributes?.name ?? '']));
  const candidates = [...new Map(all.map((item) => [item.id, item])).values()];
  if (!candidates.length) return { track, score: 0, reason: 'No TIDAL track returned' };
  const wantedTitle = clean(track.title).toLocaleLowerCase();
  const scored = candidates.map((item) => {
    const title = item.attributes?.title ?? '';
    const titleScore = similarity(track.title, title);
    const names = item.relationships?.artists?.data?.map((artist) => artists.get(artist.id) ?? '').join(' ') ?? '';
    return {
      item,
      score: 0.7 * titleScore + 0.3 * (names ? similarity(track.artist, names) : titleScore),
      // Prefer the title exactly as RP spells it, e.g. "Zombie" over "Zombie (Live)".
      literal: clean(title).toLocaleLowerCase() === wantedTitle ? 1 : 0,
      rank: relevance.get(item.id) ?? Number.MAX_SAFE_INTEGER,
    };
  }).sort((a, b) => b.score - a.score || b.literal - a.literal || a.rank - b.rank);
  const best = scored[0]; const next = scored[1]?.score ?? 0;
  if (best.score < 0.78) return { track, score: best.score, reason: 'Best result is below confidence threshold' };
  // Exact title+artist matches on several releases (album, compilation, remaster)
  // are the same song: take the best-ranked one instead of giving up.
  const exact = best.score > 0.999;
  if (!exact && best.score - next < 0.08) return { track, score: best.score, reason: 'Several similarly likely TIDAL results' };
  return { track, tidal: best.item, score: best.score };
}

export async function existingPlaylistTrackIds(playlistId: string, country: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await tidalGet(`/playlists/${encodeURIComponent(playlistId)}/relationships/items`, {
      countryCode: country, include: 'items', ...(cursor ? { 'page[cursor]': cursor } : {}),
    });
    for (const item of [result.data ?? []].flat()) if (item.type === 'tracks') ids.add(item.id);
    cursor = (result as { links?: { meta?: { nextCursor?: string } } }).links?.meta?.nextCursor;
  } while (cursor);
  return ids;
}
