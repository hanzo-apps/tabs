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
