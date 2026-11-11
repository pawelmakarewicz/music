import axios, { AxiosError } from 'axios';
import type { z } from 'zod';
import { tidalDocumentSchema, zodMessage } from '../contracts.js';
import { getAccessToken } from './auth.js';

const api = 'https://openapi.tidal.com/v2';
const jsonApi = 'application/vnd.api+json';

async function headers() {
  return { Authorization: `Bearer ${await getAccessToken()}`, Accept: jsonApi, 'Content-Type': jsonApi };
}

function apiError(error: unknown, operation: string): Error {
  if (error instanceof AxiosError) {
    const body = typeof error.response?.data === 'string' ? error.response.data : JSON.stringify(error.response?.data);
    return new Error(`${operation}: HTTP ${error.response?.status ?? 'network error'} ${body ?? error.message}`);
  }
  return error instanceof Error ? error : new Error(`${operation}: ${String(error)}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET with query params encoded by axios; retries politely on HTTP 429. */
export async function tidalGet<S extends z.ZodTypeAny = typeof tidalDocumentSchema>(path: string, params?: Record<string, string>, schema?: S): Promise<z.infer<S>> {
  try {
    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await axios.get<unknown>(path, { baseURL: api, headers: await headers(), params });
        break;
      } catch (error) {
        if (!(error instanceof AxiosError) || error.response?.status !== 429 || attempt >= 5) throw error;
        const retryAfter = Number(error.response.headers['retry-after']);
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
      }
    }
    const parsed = (schema ?? tidalDocumentSchema).safeParse(response.data);
    if (!parsed.success) throw new Error(`TIDAL response contract violation (the API may have changed): ${zodMessage(parsed.error)}`);
    return parsed.data;
  } catch (error) { throw apiError(error, `TIDAL GET ${path}`); }
}

export async function addTracks(playlistId: string, country: string, ids: string[]): Promise<void> {
  try {
    const response = await axios.post<unknown>(`/playlists/${encodeURIComponent(playlistId)}/relationships/items`,
      { data: ids.map((id) => ({ id, type: 'tracks' })) },
      { baseURL: api, headers: { ...(await headers()), 'Idempotency-Key': crypto.randomUUID() }, params: { countryCode: country } });
    const parsed = tidalDocumentSchema.safeParse(response.data);
    if (!parsed.success) throw new Error(`TIDAL add response contract violation: ${zodMessage(parsed.error)}`);
  } catch (error) { throw apiError(error, 'TIDAL add tracks'); }
}
