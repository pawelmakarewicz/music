import type { RpTrack, TidalResource } from '../contracts.js';
import { similarity } from '../shared/text.js';
import { tidalGet } from './client.js';

export type Match = { track: RpTrack; tidal?: TidalResource; score: number; reason?: string };

export async function findTidalTrack(track: RpTrack, country: string): Promise<Match> {
  const query = encodeURIComponent(`${track.artist} ${track.title}`);
  const result = await tidalGet(`/searchResults/${query}?countryCode=${encodeURIComponent(country)}&include=tracks,tracks.artists`);
  const all = [result.data, ...(result.included ?? [])].flat().filter((item): item is TidalResource => item?.type === 'tracks');
  const artists = new Map((result.included ?? []).filter((x) => x.type === 'artists').map((x) => [x.id, x.attributes?.name ?? '']));
  const candidates = [...new Map(all.map((item) => [item.id, item])).values()];
  if (!candidates.length) return { track, score: 0, reason: 'No TIDAL track returned' };
  const scored = candidates.map((item) => {
    const titleScore = similarity(track.title, item.attributes?.title ?? '');
    const names = item.relationships?.artists?.data?.map((artist) => artists.get(artist.id) ?? '').join(' ') ?? '';
    return { item, score: 0.7 * titleScore + 0.3 * (names ? similarity(track.artist, names) : titleScore) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0]; const next = scored[1]?.score ?? 0;
  if (best.score < 0.78) return { track, score: best.score, reason: 'Best result is below confidence threshold' };
  if (best.score - next < 0.08) return { track, score: best.score, reason: 'Several similarly likely TIDAL results' };
  return { track, tidal: best.item, score: best.score };
}

export async function existingPlaylistTrackIds(playlistId: string, country: string): Promise<Set<string>> {
  const result = await tidalGet(`/playlists/${encodeURIComponent(playlistId)}/relationships/items?countryCode=${encodeURIComponent(country)}&include=items`);
  return new Set((result.included ?? []).filter((item) => item.type === 'tracks').map((item) => item.id));
}
