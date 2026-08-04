/**
 * Sign in with Hanzo IAM.
 *
 * The flow itself is `@hanzo/iam/browser` — the SDK every Hanzo app signs in
 * with. This module only *configures* it, so Tabs owns an issuer and a client
 * id and nothing else: no PKCE, no token store, no endpoint literals. Those are
 * the parts an app gets subtly wrong and then keeps wrong, and the parts that
 * have to change in lockstep with IAM.
 *
 * Endpoints come from OIDC discovery rather than being written down here, which
 * is why there is no path in this file to drift.
 *
 * Tabs is a PUBLIC client: a static site cannot keep a secret, so PKCE is what
 * replaces one — the browser proves it started the exchange by presenting the
 * verifier whose hash it sent up front. The registration must therefore carry no
 * client secret (`public: true` in provision.yaml); a stored secret the browser
 * cannot present is what makes the token endpoint demand client auth and fail
 * the exchange.
 */

import {
  configureIam,
  getIam,
  getSession,
  handleCallback,
  logout,
  startLogin,
} from '@hanzo/iam/browser';

/** The brand identity origin. One identity for everything Hanzo. */
export const ISSUER = 'https://hanzo.id';

/** `<org>-<app>`, registered in hanzoai/universe `infra/k8s/iam/provision.yaml`. */
export const CLIENT_ID = 'hanzo-tabs';

let ready = false;

/**
 * Configure the singleton, once, in the browser.
 *
 * Deferred rather than run at module scope because this is a statically exported
 * site: module scope also runs during the export build, where there is no
 * `window` and no storage to configure against.
 */
export function iam() {
  if (!ready) {
    configureIam({ issuer: ISSUER, clientId: CLIENT_ID, scope: 'openid profile email' });
    ready = true;
  }
}

/** Whether this browser holds a live session. */
export function session() {
  iam();
  return getSession();
}

/**
 * Renew the access token with the refresh grant, returning the live session.
 *
 * An access token lasts an hour and Tabs is a window you leave open all day
 * watching agents work, so without this a session ends mid-afternoon and drops
 * you at a sign-in screen with panes still on screen.
 *
 * The refresh grant, not OIDC's `prompt=none` iframe: hanzo.id sends
 * `frame-ancestors 'none'`, which is the right answer for a login page and makes
 * silent renew structurally unavailable no matter what this app's own CSP allows.
 * A public client's refresh token is the mechanism that works, and it needs no
 * third-party cookie to do it.
 *
 * Failure is not an error here — an expired or revoked refresh token means the
 * session is simply over, and the caller shows the sign-in screen.
 */
export async function renew() {
  iam();
  try {
    await getIam().refreshAccessToken();
  } catch {
    /* the session is over; getSession reports it and the caller signs in again */
  }
  return getSession();
}

/** Send the browser to hanzo.id. Returns only if the redirect does not happen. */
export async function signIn(returnTo = '/app') {
  iam();
  await startLogin({ redirect: returnTo });
}

/** Finish the exchange on the callback route. Returns where to go next. */
export async function complete(): Promise<string> {
  iam();
  const { redirect } = await handleCallback();
  return redirect || '/app';
}

/** RP-initiated logout, and the local session with it. */
export async function signOut() {
  iam();
  await logout();
}
