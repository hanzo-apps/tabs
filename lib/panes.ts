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
  /** The machine's SCREEN — its X display, as pixels. No name, because a
   *  machine has one display where it has as many shells as you ask for. */
  | { kind: 'screen'; machine: string }
  /** Split made, machine not chosen yet. */
  | { kind: 'empty' }
  /** The machine went away. The pane STAYS, because tmux is still holding the
   *  session and the layout is the reader's, not a function of someone's uptime. */
  | { kind: 'gone'; shell: Shell };

/** What a pane calls itself: the machine, then which of its faces this is.
 *  One function, so the header, the frame's title and the phone's pager cannot
 *  disagree about what a person is looking at. */
export function label(b: Binding): string {
  switch (b.kind) {
    case 'shell':
      return `${b.shell.machine} · ${b.shell.name}`;
    case 'gone':
      return `${b.shell.machine} · ${b.shell.name}`;
    case 'screen':
      return `${b.machine} · desktop`;
    default:
      return 'New shell';
  }
}

/** The machine a pane is bound to, whichever way it is looking at it. */
export function machineOf(b: Binding): string | null {
  switch (b.kind) {
    case 'shell':
    case 'gone':
      return b.shell.machine;
    case 'screen':
      return b.machine;
    default:
      return null;
  }
}

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

/** Status → dot. The ONE map: session statuses first, then a machine's.
 *
 * `online | offline | draining` is exactly what the control plane sends
 * (agents.TargetOnline/Offline/Draining). `busy` was here once and is sent by
 * nothing; `draining` was missing and fell through to the offline grey, so a box
 * being deliberately drained read as dead. */
export const DOT: Record<string, string> = {
  running: 'bg-emerald-500',
  paused: 'bg-amber-500',
  done: 'bg-muted-foreground/40',
  error: 'bg-destructive',
  online: 'bg-emerald-500',
  draining: 'bg-amber-500',
  offline: 'bg-muted-foreground/40',
};

/**
 * The readiness contract — BOTH halves, in one place.
 *
 * `READY` are the `source` values our framed pages post to their parent once
 * they are up: the terminal's when xterm has opened (hanzo/cli
 * `assets/term/client.js`, cloud `apps/sandbox/term/page.html`), the screen's
 * when noVNC has connected (cloud `apps/sandbox/screen/page.html`). They live
 * here rather than in the component because they are wire values shared with
 * another repository: one side changing one silently is a workspace where every
 * pane of that kind looks dead.
 *
 * Two names and one meaning, on purpose. Each page says WHAT it is, because
 * that costs nothing and a page that lied about itself would be worse; what a
 * parent asks is only whether the thing it framed came up, so the question has
 * one answer for both.
 *
 * The rule this enables is small and the reason for it is not. A parent cannot
 * tell a healthy cross-origin frame from a refused one — the browser substitutes
 * its own error document for a refusal, and BOTH throw on `contentDocument`. So
 * a terminal is present only when it SAYS so, and every way of failing (an OAuth
 * gate, a `frame-ancestors` refusal, a dead tunnel, an offline machine) collapses
 * to the same silence and the same answer.
 */
export const READY = ['hanzo-term', 'hanzo-screen'];

/** How long a pane waits to hear from what it framed before offering the way
 *  out. Long enough that a rescue never flashes over a terminal that is merely
 *  still connecting, which would be its own defect. */
export const DEADLINE = 6000;

/** Whether a posted message is one of our pages announcing itself. */
export function isReady(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    READY.includes((data as { source?: unknown }).source as string)
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

