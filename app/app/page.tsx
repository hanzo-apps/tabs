'use client';

/**
 * The workspace.
 *
 * It reads the machine and session registries from api.hanzo.ai in the BROWSER,
 * with the caller's own token, and frames terminals the machines themselves
 * serve. No request passes through a server of ours, because there is no server
 * of ours — which is also why this page can be static.
 *
 * Sign-in is `@hanzo/iam` against hanzo.id — the same identity, and the same
 * client, as everything else Hanzo. The token lives in this browser because
 * there is nowhere else: inventing a session store would mean inventing the
 * server this product exists without.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import {
  type CloudMachine,
  type Machine,
  type SandboxMachine,
  type Session,
  cloudMachines,
  launchCloudMachine,
  machines,
  sandboxes,
  sandboxTerminal,
  sessions,
  terminalTicket,
} from '@/lib/api';
import { renew, session, signIn, signOut } from '@/lib/iam';
import { withCloud } from '@/lib/panes';
import { Workspace, type TerminalHost } from '@/components/workspace';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{
    m: Machine[];
    s: Session[];
    c: CloudMachine[];
    b: SandboxMachine[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The session this browser already holds, renewed if the access token has
  // aged out. Tabs is a window you leave open all day watching agents work, so
  // an hour-old token is the normal case on returning to the tab, not an edge
  // one — without the renew you would be signed out every time you came back.
  useEffect(() => {
    const s = session();
    if (s.authenticated) {
      setToken(s.accessToken);
      return;
    }
    void renew().then((r) => setToken(r.accessToken));
  }, []);

  const refresh = useCallback(async (t: string) => {
    try {
      // Two planes, and only one of them holds this page up. The registry is where
      // machines and terminals come from; visor only knows about the boxes we
      // launched, so provisioning being down has to cost you those and nothing
      // else. It is caught here rather than reported here because the launch
      // button is where a broken visor is worth saying out loud — a banner about
      // a plane you may not be using is noise on a workspace that still works.
      const [m, s, c, b] = await Promise.all([
        machines(t),
        sessions(t),
        cloudMachines(t).catch(() => []),
        // The builder's pods. A third plane with the same posture as visor:
        // its absence costs you those panes and nothing else.
        sandboxes(t).catch(() => []),
      ]);
      setData({ m, s, c, b });
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
    // Renewed on its own clock, well inside the access token's hour, so a
    // workspace left open keeps reading the registry instead of quietly failing
    // every poll until someone notices the panes have gone stale.
    const r = setInterval(() => void renew().then((s) => setToken(s.accessToken)), 10 * 60_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
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
    // The builder's sandboxes. A sandbox has no tunnel to publish — its
    // terminal URL is MINTED per open (single-use ticket), so the host carries
    // the sandbox id instead of a base and the workspace mints when a pane
    // binds. One live sandbox per project is the server's rule, so the project
    // name is a stable, unique machine name.
    for (const s of data.b) {
      const key = s.project || `box-${s.id.slice(0, 6)}`;
      if (!out.has(key)) out.set(key, { machine: key, sandbox: s.id, status: 'online' });
    }
    // A box we launched exists to visor before it exists to the registry. It is
    // merged in for that gap only, and stops being a special case the moment its
    // own `hanzo link` registers it above.
    return withCloud([...out.values()], data.c, (machine, status) => ({ machine, status }));
  }, [data]);

  /** A fresh framed-terminal URL for a sandbox pane — ticket minted here, where
   *  the token lives, so the workspace stays credential-free. */
  const mint = useCallback(
    async (sandbox: string, shell: string) => {
      if (!token) throw new Error('signed out');
      const ticket = await terminalTicket(token, sandbox);
      return sandboxTerminal(sandbox, ticket, shell);
    },
    [token],
  );

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
            signIn('/app').catch((e) => {
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
            void signOut();
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
          <Workspace
            hosts={hosts}
            mint={mint}
            onLaunch={() => launchCloudMachine(token).then(() => refresh(token))}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-600">
            {error ? 'The registry is unavailable.' : 'Reading your machines…'}
          </div>
        )}
      </div>

      {/* The assistant, bottom right — the SAME corner console.hanzo.ai and
          hanzo.app keep theirs in, so the three surfaces agree on where Hanzo
          lives. Tabs has no composer of its own (it is a terminal workspace,
          deliberately backendless), so this is the doorway, not the room. */}
      <a
        href="https://hanzo.chat"
        target="_blank"
        rel="noreferrer noopener"
        title="Ask Hanzo"
        aria-label="Ask Hanzo"
        className="fixed bottom-4 right-4 z-40 inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
        </svg>
      </a>
    </main>
  );
}
