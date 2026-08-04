/**
 * Sign in with Hanzo IAM — OIDC authorization code with PKCE, and no library.
 *
 * A static site cannot keep a secret, so this is a PUBLIC client and PKCE is what
 * replaces the secret: the browser proves it started the exchange by presenting
 * the verifier whose hash it sent up front. Sixty lines of standard OIDC against
 * hanzo.id's own discovery document is less to own — and less to keep current —
 * than a dependency that wraps them.
 *
 * The token lives in this browser because there is nowhere else: Tabs has no
 * backend, and inventing a session store would mean inventing the server this
 * product exists without. That is the honest trade, and it is why the token is
 * short-lived and refreshable rather than long-lived.
 */

const ISSUER = 'https://hanzo.id';
export const AUTHORIZE = `${ISSUER}/v1/iam/oauth/authorize`;
export const TOKEN = `${ISSUER}/v1/iam/oauth/token`;

/** Public client, registered in hanzoai/universe `infra/k8s/iam/provision.yaml`. */
export const CLIENT_ID = 'hanzo-tabs';

const VERIFIER = 'hanzo.tabs.pkce';
const STATE = 'hanzo.tabs.state';
const TOKENS = 'hanzo.tabs.tokens';

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  /** Unix seconds. Absent when the server sent no expiry. */
  expires_at?: number;
}

const b64url = (b: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const random = (): string => {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
};

const s256 = async (v: string): Promise<string> =>
  b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));

export function stored(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS);
    if (!raw) return null;
    const t = JSON.parse(raw) as Tokens;
    // An expired access token is not a session. Treat it as absent so the caller
    // refreshes or signs in, rather than sending it and reading a 401 as an outage.
    if (t.expires_at && t.expires_at * 1000 < Date.now() + 30_000) return null;
    return t.access_token ? t : null;
  } catch {
    return null;
  }
}

function keep(t: Tokens) {
  try {
    localStorage.setItem(TOKENS, JSON.stringify(t));
  } catch {
    /* private mode: the session lasts this page, which is better than refusing */
  }
}

export function signOut() {
  for (const k of [TOKENS, VERIFIER, STATE]) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* nothing to remove */
    }
  }
}

/** Send the browser to hanzo.id. Returns only if the redirect does not happen. */
export async function signIn(redirectUri: string, returnTo = '/app') {
  const verifier = random();
  const state = random();
  try {
    localStorage.setItem(VERIFIER, verifier);
    localStorage.setItem(STATE, `${state}|${returnTo}`);
  } catch {
    throw new Error('this browser is blocking storage, so a sign-in cannot complete');
  }
  const u = new URL(AUTHORIZE);
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', await s256(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(u.toString());
}

/** Finish the exchange on the callback route. Returns where to go next. */
export async function complete(search: string, redirectUri: string): Promise<string> {
  const q = new URLSearchParams(search);
  const err = q.get('error');
  if (err) throw new Error(q.get('error_description') || err);

  const code = q.get('code');
  const state = q.get('state');
  const verifier = localStorage.getItem(VERIFIER);
  const expected = localStorage.getItem(STATE);
  if (!code || !verifier || !expected) throw new Error('this sign-in did not start here');

  const [want, returnTo = '/app'] = expected.split('|');
  // The state check is the whole defence against a code planted by someone else.
  if (state !== want) throw new Error('the sign-in state did not match');

  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`the token exchange failed (${res.status})`);

  const t = (await res.json()) as Tokens & { expires_in?: number };
  if (!t.access_token) throw new Error('the exchange returned no access token');
  keep({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_in ? Math.floor(Date.now() / 1000) + t.expires_in : undefined,
  });

  try {
    localStorage.removeItem(VERIFIER);
    localStorage.removeItem(STATE);
  } catch {
    /* best effort; they are single-use either way */
  }
  return returnTo;
}
