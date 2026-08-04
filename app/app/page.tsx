'use client';

/**
 * The workspace.
 *
 * It reads the machine and session registries from api.hanzo.ai in the BROWSER,
 * with the caller's own token, and frames terminals the machines themselves
 * serve. No request passes through a server of ours, because there is no server
 * of ours — which is also why this page can be static.
 *
 * A token is asked for once and kept in this browser. That is the honest shape
 * for an app with no backend: there is nowhere else to put it, and inventing a
 * session store here would mean inventing a server to hold it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { type Machine, type Session, machines, sessions } from '@/lib/api';
import { Workspace, type TerminalHost } from '@/components/workspace';

const TOKEN_KEY = 'hanzo.tabs.token';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [data, setData] = useState<{ m: Machine[]; s: Session[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setToken(window.localStorage.getItem(TOKEN_KEY));
    } catch {
      /* private mode: the app still works, it just asks every visit */
    }
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
        <h1 className="text-xl font-semibold text-neutral-50">Connect Tabs</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Tabs has no backend, so it reads your machines directly with your own token. Paste one
          from{' '}
          <code className="rounded bg-neutral-900 px-1 py-0.5 text-xs text-neutral-200">
            hanzo auth token
          </code>
          . It stays in this browser.
        </p>
        <form
          className="mt-5 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = entry.trim();
            if (!t) return;
            try {
              window.localStorage.setItem(TOKEN_KEY, t);
            } catch {
              /* keep going: it works for this visit either way */
            }
            setToken(t);
          }}
        >
          <input
            type="password"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="eyJ…"
            autoComplete="off"
            className="min-h-11 rounded-lg border border-neutral-800 bg-neutral-950 px-3 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-600"
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-neutral-50 text-sm font-medium text-neutral-950 hover:bg-white"
          >
            Connect
          </button>
        </form>
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
            try {
              window.localStorage.removeItem(TOKEN_KEY);
            } catch {
              /* nothing to remove */
            }
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
