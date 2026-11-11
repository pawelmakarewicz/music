import axios from 'axios';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// The same request the "download" dialog on the RP profile page makes. It is
// keyed by the public profile id (radioparadise.com/account/profile/<id>) and
// needs no login.
const endpoint = 'https://api.radioparadise.com/siteapi.php';

/** Downloads every rated song (1–10) as CSV with a `rating` column; extract applies RP_MIN_RATING. */
export async function downloadFavorites(userId: string, file: string): Promise<number> {
  const response = await axios.get<string>(endpoint, {
    params: { file: 'music::download-favorites', lower_limit: 1, upper_limit: 10, user_id: userId, format: 'csv' },
    responseType: 'text',
  });
  const csv = response.data;
  const [header = '', ...rows] = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  if (!/title/i.test(header) || !/artist/i.test(header) || !/rating/i.test(header)) {
    throw new Error(`Unexpected RP download (header: ${header.slice(0, 120)}); has the site changed?`);
  }
  // An unknown id still returns a few songs, so an empty or tiny list is suspicious but not fatal.
  if (!rows.length) throw new Error(`RP returned no ratings for profile ${userId}; check RP_USER_ID.`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, csv);
  return rows.length;
}
