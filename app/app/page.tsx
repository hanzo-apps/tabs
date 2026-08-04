'use client';

/**
 * The workspace.
 *
 * It reads the machine and session registries from api.hanzo.ai in the BROWSER,
 * with the caller's own token, and frames terminals the machines themselves
 * serve. No request passes through a server of ours, because there is no server
 * of ours — which is also why this page can be static.
 *
 * Sign-in is OIDC + PKCE against hanzo.id — the same identity as everything else
 * Hanzo. A static site cannot keep a secret, so PKCE is what replaces it, and the
 * token lives in this browser because there is nowhere else: inventing a session
 * store would mean inventing the server this product exists without.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { type Machine, type Session, machines, sessions } from '@/lib/api';
import { signIn, signOut, stored } from '@/lib/iam';
import { Workspace, type TerminalHost } from '@/components/workspace';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ m: Machine[]; s: Session[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(stored()?.access_token ?? null);
  }, []);

  const refresh = useCallback(async (t: string) => {
    try {
      const [m, s] = await Promise.all([machines(t), sessions(t)]);
      setData({ m, s });
      setError(null);
    } catch (e) {
      // A registry that cannot be read is reported as such. Rendering an empty
      // workspace would claim "no machines", which is a different and wrong thing.
      setError(e instanceof Error ? e.message : 'could not reach the registry');
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void refresh(token);
    // Machines heartbeat every 30s and the plane calls one stale after 90s, so
    // polling faster than the fact changes would only cost requests.
    const t = setInterval(() => void refresh(token), 30_000);
    return () => clearInterval(t);
  }, [token, refresh]);

  /** Machines that can serve shells, and the tunnel each one's terminals live on.
   *
   *  A terminal URL is a fact about the MACHINE — one link, one ttyd, one tunnel
   *  — so it is read from whichever of its sessions published one, rather than
   *  treated as a property of that session. The workspace then names a shell per
   *  pane with `?arg=`, so one link serves many. */
  const hosts = useMemo<TerminalHost[]>(() => {
    if (!data) return [];
    const base = new Map<string, string>();
    for (const s of data.s) {
      if (!s.terminal || !s.host) continue;
      if (s.status !== 'running' && s.status !== 'paused') continue;
      if (!base.has(s.host)) base.set(s.host, s.terminal);
    }
    const out = new Map<string, TerminalHost>();
    for (const m of data.m) {
      const key = m.host || m.label || m.id;
      out.set(key, { machine: key, base: base.get(key), status: m.status, label: m.capacity });
    }
    for (const [host, url] of base) {
      if (!out.has(host)) out.set(host, { machine: host, base: url, status: 'online' });
    }
    return [...out.values()];
  }, [data]);

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-xl font-semibold text-neutral-50">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Tabs reads your machines with your own Hanzo identity. It has no backend, so
          nothing about your session is stored anywhere but this browser.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            signIn(`${window.location.origin}/auth/callback`, '/app').catch((e) => {
              setError(e instanceof Error ? e.message : 'sign-in failed');
              setBusy(false);
            });
          }}
          className="mt-5 min-h-11 rounded-lg bg-neutral-50 text-sm font-medium text-neutral-950 hover:bg-white disabled:opacity-60"
        >
          {busy ? 'Taking you to hanzo.id…' : 'Continue with Hanzo'}
        </button>
        {error ? <p className="mt-3 text-xs text-amber-500">{error}</p> : null}
        <Link href="/" className="mt-6 text-xs text-neutral-600 hover:text-neutral-400">
          ← What is this?
        </Link>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col gap-2 p-2">
      <header className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
        <Link href="/" className="font-mono text-neutral-300 hover:text-neutral-50">
          Tabs
        </Link>
        {error ? <span className="truncate text-amber-500">{error}</span> : null}
        <button
          type="button"
          onClick={() => {
            signOut();
            setToken(null);
            setData(null);
          }}
          className="ml-auto shrink-0 rounded px-2 py-1 hover:bg-neutral-900 hover:text-neutral-300"
        >
          Disconnect
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {data ? (
          <Workspace hosts={hosts} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-600">
            {error ? 'The registry is unavailable.' : 'Reading your machines…'}
          </div>
        )}
      </div>
    </main>
  );
}
