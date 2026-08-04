/**
 * What a pane SHOWS, kept apart from where it sits.
 *
 * A pane used to be identified by a session id, which braided two questions into
 * one value: *where is this on screen* and *what is running in it*. That braid is
 * why the workspace could not open anything — a split had to find an unused
 * session, so with one session there was nothing to split into and both buttons
 * sat disabled under a sentence explaining why. It is also why a layout collapsed
 * when a run finished: the pane's identity had ended.
 *
 * A pane id is minted here and means only "this box". What it shows is a
 * BINDING — a machine and a shell name — and the URL is derived from the two.
 *
 * ONE LINK SERVES MANY SHELLS. `hanzo link` runs ttyd with `--url-arg`, so the
 * query names a tmux session: `?arg=build` is a shell called build, and no arg is
 * the default. `tmux new -A` attaches or creates, which means opening a shell is
 * a URL and closing a pane loses nothing — reopen the same name and the
 * scrollback is still there. There is no spawn endpoint because none is needed.
 */

/** A shell: which machine, and which tmux session on it. */
export interface Shell {
  machine: string;
  /** `[A-Za-z0-9_-]{1,32}` — the machine sanitises it again, but a UI must never
   *  send a name it did not construct. */
  name: string;
}

export type Binding =
  | { kind: 'shell'; shell: Shell }
  /** Split made, machine not chosen yet. */
  | { kind: 'empty' }
  /** The machine went away. The pane STAYS, because tmux is still holding the
   *  session and the layout is the reader's, not a function of someone's uptime. */
  | { kind: 'gone'; shell: Shell };

/** The default tmux session a machine's first pane opens — matches the CLI's. */
export const DEFAULT_SHELL = 'hanzo';

const SAFE = /[^A-Za-z0-9_-]/g;

/** Reduce a name to what the machine will accept, so the two never disagree. */
export function safeName(raw: string): string {
  const n = raw.replace(SAFE, '').slice(0, 32);
  return n || DEFAULT_SHELL;
}

/** The next unused shell name for a machine, given what is already open on it. */
export function mintName(taken: readonly string[]): string {
  if (!taken.includes(DEFAULT_SHELL)) return DEFAULT_SHELL;
  for (let i = 2; i < 1000; i++) {
    const n = `shell-${i}`;
    if (!taken.includes(n)) return n;
  }
  return DEFAULT_SHELL;
}

/**
 * The URL a pane frames.
 *
 * Built with URLSearchParams and exactly one `arg`, never by concatenation:
 * `--url-arg` appends EVERY `arg=` in the query to the command's argv, so a
 * second one is a second argument to a shell running on someone's machine.
 */
export function shellUrl(base: string, name: string): string {
  try {
    const u = new URL(base);
    u.searchParams.set('arg', safeName(name));
    return u.toString();
  } catch {
    return base; // a base we cannot parse is one we must not decorate
  }
}

/** Status → dot. The ONE map: session statuses first, then a machine's, then the
 *  two `withCloud` mints below for a box that has not linked yet.
 *
 * `online | offline | draining` is exactly what the control plane sends
 * (agents.TargetOnline/Offline/Draining). `busy` was here once and is sent by
 * nothing; `draining` was missing and fell through to the offline grey, so a box
 * being deliberately drained read as dead. A booting box would read as dead the
 * same way, which is why `starting` and `linking` are amber here and not absent. */
export const DOT: Record<string, string> = {
  running: 'bg-emerald-500',
  paused: 'bg-amber-500',
  done: 'bg-muted-foreground/40',
  error: 'bg-destructive',
  online: 'bg-emerald-500',
  draining: 'bg-amber-500',
  offline: 'bg-muted-foreground/40',
  starting: 'bg-amber-500',
  linking: 'bg-amber-500',
};

/**
 * The terminal readiness contract — BOTH halves, in one place.
 *
 * `TERM_READY` is the `source` our terminal page posts to its parent once xterm
 * has opened (hanzo/cli `assets/term/client.js`). It lives here rather than in
 * the component because it is a wire value shared with another repository: one
 * side changing it silently is a workspace where every pane looks dead.
 *
 * The rule this enables is small and the reason for it is not. A parent cannot
 * tell a healthy cross-origin frame from a refused one — the browser substitutes
 * its own error document for a refusal, and BOTH throw on `contentDocument`. So
 * a terminal is present only when it SAYS so, and every way of failing (an OAuth
 * gate, a `frame-ancestors` refusal, a dead tunnel, an offline machine) collapses
 * to the same silence and the same answer.
 */
export const TERM_READY = 'hanzo-term';

/** How long a pane waits to hear from its terminal before offering the way out.
 *  Long enough that a rescue never flashes over a terminal that is merely still
 *  connecting, which would be its own defect. */
export const TERM_DEADLINE = 6000;

/** Whether a posted message is our terminal announcing itself. */
export function isTermReady(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === TERM_READY
  );
}

/** Panes that should show the way out: waited past the deadline, never heard from.
 *  A pane that has not waited yet is absent, not false — it is still loading, and
 *  nothing should be drawn over it. */
export function rescued(
  waited: Record<string, boolean>,
  alive: Record<string, boolean>,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.keys(waited)
      .filter((id) => waited[id])
      .map((id) => [id, !alive[id]]),
  );
}

/**
 * Cloud boxes, as ordinary machines.
 *
 * A launched box runs `hanzo link` exactly as a laptop does, so once it is up it
 * arrives through the SAME registry as everything else and needs nothing here. It
 * is only in the gap — launched, booting, not yet linked — that it exists to
 * visor and not to the registry, and a box you are waiting on has to be visible
 * or the launch button looks broken.
 *
 * So it is merged BY HOST and the registry wins: the moment the real machine
 * registers, its own entry replaces the placeholder and there is nothing left of
 * this. That direction matters — the registry knows whether a terminal is
 * actually being served, and visor only knows what the provider was told.
 */
export function withCloud<T extends { machine: string; status: string; base?: string }>(
  live: T[],
  cloud: { name: string; state?: string }[],
  make: (name: string, status: string) => T,
): T[] {
  const known = new Set(live.map((h) => h.machine));
  const booting = cloud
    .filter((m) => m.name && !known.has(m.name))
    // A destroyed box is not a pending one. Anything the provider calls off is
    // simply gone, and showing it would be a machine you can never open.
    .filter((m) => !/destroy|delete|terminat|archiv/i.test(m.state ?? ''))
    .map((m) => make(m.name, /active|running/i.test(m.state ?? '') ? 'linking' : 'starting'));
  return [...live, ...booting];
}

/** Whether a machine is one of the boxes above: on its way up, so it has no
 *  tunnel yet. The workspace has to let you open a pane on one anyway — the pane
 *  is where you watch it come up, and it turns into a terminal with nothing
 *  moving — so this is what tells it apart from a linked machine that simply
 *  serves no terminal, which there would be nothing to open. */
export const isPending = (status: string) => status === 'starting' || status === 'linking';
