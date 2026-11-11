# Radio Paradise → TIDAL

Copies the songs you have rated on [Radio Paradise](https://radioparadise.com)
into one of your TIDAL playlists. One command downloads your ratings, picks out
the new ones, and adds them to the playlist.

```bash
npm run sync-all
```

## What it does

1. **Downloads** all your Radio Paradise ratings as a CSV with title, artist and
   rating. This is the same file you get from the ☁︎ Download button on your
   profile. No login is needed, only your profile number.
2. **Selects** songs rated at least `RP_MIN_RATING` (default 7) that have not
   been synced yet.
3. **Searches** TIDAL for each song and **adds** the matches to your playlist.

Good to know:
- **It never removes anything** from the playlist and never adds duplicates.
- **It skips uncertain matches.** A song TIDAL can't find, or one with several
  different close candidates (covers, other recordings of a classical piece),
  goes into the `notFound` section of `reports/sync-*.json` so you can add it
  by hand.
- It remembers what it has synced, so later runs only add new ratings.

## Setup (once, about 5 minutes)

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Setting | Where to find it |
|---|---|
| `RP_USER_ID` | Open your profile on radioparadise.com. It's the number in the URL: `…/account/profile/`**`1234567890`** |
| `RP_MIN_RATING` | Lowest rating to sync, from 1 to 10 |
| `TIDAL_CLIENT_ID` | See below |
| `TIDAL_PLAYLIST_ID` | Open the playlist on tidal.com and copy the part of the URL after `/playlist/`. Create the playlist first |
| `TIDAL_COUNTRY_CODE` | Your TIDAL account's country, e.g. `PL`, `DE`, `US` |

### TIDAL app (for `TIDAL_CLIENT_ID`)

TIDAL only lets registered apps change playlists. Registering is free:

1. Sign in at [developer.tidal.com](https://developer.tidal.com/) with your
   normal TIDAL account and create an app. Any name works.
2. Under **Settings → Edit**, set:
   - **Redirect URIs**: `http://127.0.0.1:8787/callback`
   - **Allowed scopes**: `playlists.read`, `playlists.write`, `search.read`
3. Under **Overview**, copy the **Client ID** into `.env`. You don't need the
   Client Secret.

### Sign in to TIDAL

```bash
npm run tidal:login
```

This prints a link. Open it, sign in to TIDAL and allow access. You should see
"TIDAL connected". You only do this once; access renews automatically after that.

## Commands

| Command | What it does |
|---|---|
| `npm run sync-all` | Everything: download → extract → sync |
| `npm run download` | Only download your ratings from Radio Paradise |
| `npm run extract` | Only pick out new songs from the downloaded file |
| `npm run sync` | Only search TIDAL for the picked songs and add them |
| `npm run tidal:login` | Sign in to TIDAL again |

## Where things are stored

Everything local lives in `.data/` and `reports/`. Both are in `.gitignore`.

- `.data/tidal-token.json`: your TIDAL access. **Don't share it.** To revoke it,
  delete the app on developer.tidal.com.
- `.data/rp_favorites.csv`: the latest Radio Paradise download.
- `.data/rp-favorites-snapshot.json`: what has already been synced. If you
  delete it, the next run checks every song again. It still won't add duplicates.
- `reports/sync-*.json`: a report for each run, with `added`, `alreadyPresent`,
  `notFound` and `errors`.

## Troubleshooting

- **"Something went wrong" on the TIDAL sign-in page**: the app's Redirect URI or
  scopes are missing, or the Redirect URI doesn't exactly match the one in `.env`.
- **`Missing RP_USER_ID` / `Missing TIDAL_…`**: that setting is empty in `.env`.
- **`Unexpected RP download`**: Radio Paradise changed its export format. The
  script stopped without adding anything.
- **Songs listed under `errors`** (a network failure, for example) aren't lost.
  They're retried on the next run.
