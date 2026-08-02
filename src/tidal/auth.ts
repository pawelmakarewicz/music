import axios from 'axios';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { env, requireEnv } from '../config/env.js';
import { zodMessage } from '../contracts.js';

const tokenFile = '.data/tidal-token.json';
const authorizeUrl = 'https://login.tidal.com/authorize';
const tokenUrl = 'https://auth.tidal.com/v1/oauth2/token';
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
  token_type: z.string().optional(),
}).passthrough();
type Token = z.infer<typeof tokenSchema> & { obtainedAt: number };

function base64Url(value: Buffer): string { return value.toString('base64url'); }

async function saveToken(token: z.infer<typeof tokenSchema>): Promise<Token> {
  const saved: Token = { ...token, obtainedAt: Date.now() };
  await mkdir('.data', { recursive: true });
  await writeFile(tokenFile, `${JSON.stringify(saved, null, 2)}\n`);
  return saved;
}

async function exchange(form: Record<string, string>): Promise<Token> {
  const response = await axios.post<unknown>(tokenUrl, new URLSearchParams(form), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const parsed = tokenSchema.safeParse(response.data);
  if (!parsed.success) throw new Error(`TIDAL token contract violation: ${zodMessage(parsed.error)}`);
  return saveToken(parsed.data);
}

async function readSavedToken(): Promise<Token | undefined> {
  try {
    const parsed = tokenSchema.extend({ obtainedAt: z.number().int().positive() }).safeParse(JSON.parse(await readFile(tokenFile, 'utf8')));
    if (!parsed.success) throw new Error(`Saved TIDAL token contract violation: ${zodMessage(parsed.error)}`);
    return parsed.data;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function expiresSoon(token: Token): boolean {
  return token.expires_in !== undefined && Date.now() >= token.obtainedAt + (token.expires_in - 60) * 1000;
}

export async function getAccessToken(): Promise<string> {
  if (env.TIDAL_ACCESS_TOKEN) return env.TIDAL_ACCESS_TOKEN;
  const token = await readSavedToken();
  if (!token) throw new Error('No TIDAL token. Run `npm run tidal:login`.');
  if (!expiresSoon(token)) return token.access_token;
  if (!token.refresh_token) throw new Error('TIDAL token expired and no refresh token was returned. Run `npm run tidal:login`.');
  const refreshed = await exchange({ grant_type: 'refresh_token', client_id: requireEnv('TIDAL_CLIENT_ID'), refresh_token: token.refresh_token });
  return refreshed.access_token;
}

export async function login(): Promise<void> {
  const clientId = requireEnv('TIDAL_CLIENT_ID');
  const redirectUri = requireEnv('TIDAL_REDIRECT_URI');
  const callback = new URL(redirectUri);
  if (callback.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(callback.hostname)) {
    throw new Error('TIDAL_REDIRECT_URI must be an http://127.0.0.1 or http://localhost callback for this CLI.');
  }
  const verifier = base64Url(randomBytes(64));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const state = base64Url(randomBytes(32));
  const auth = new URL(authorizeUrl);
  auth.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    scope: 'playlists.read playlists.write search.read', code_challenge_method: 'S256', code_challenge: challenge, state,
  }).toString();

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', redirectUri);
    if (requestUrl.pathname !== callback.pathname) { response.writeHead(404).end('Not found'); return; }
    if (requestUrl.searchParams.get('state') !== state || !requestUrl.searchParams.get('code')) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Authorization failed. You can close this tab.');
      return;
    }
    try {
      await exchange({
        grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri,
        code: requestUrl.searchParams.get('code')!, code_verifier: verifier,
      });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>TIDAL connected.</h1><p>You can close this tab.</p>');
      console.log('TIDAL connected. Token saved locally in .data/tidal-token.json.');
      server.close();
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Token exchange failed. Check the terminal.');
      console.error(error);
      server.close();
    }
  });
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(Number(callback.port || 80), callback.hostname, resolve));
  console.log(`Open this URL in your browser:\n${auth.toString()}\n\nWaiting for TIDAL callback at ${redirectUri}…`);
}
