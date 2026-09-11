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
  /**
   * A WEB PAGE, at a url.
   *
   * The one binding that is not a machine's face, so there is nothing to link,
   * nothing to start and nothing to mint: the url IS the binding, and it
   * survives a reload the way a shell name does.
   */
  | { kind: 'page'; url: string; }
  /** Split made, machine not chosen yet. */
  | { kind: 'empty' }
  /**
   * A machine is being STARTED for this pane, and does not exist yet.
   *
   * The pane is on screen from the click, because the wait is the thing worth
   * watching and it is the longest part: provisioning a cloud machine takes
   * tens of seconds, and a spinner on the button that caused it leaves the
   * workspace looking untouched for all of them. `want` is how the machine will
   * be shown the moment it answers.
   */
  | { kind: 'starting'; want: 'shell' | 'screen' }
  /** No machine came. The pane keeps the reason, and whether the reason was
   *  MONEY — because that one has a remedy the others do not, and a person out
   *  of credit still has a machine of their own to bring. */
  | { kind: 'failed'; why: string; unfunded?: boolean }
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
      return `${b.machine} · desk`;
    case 'page':
      return host(b.url) || 'New tab';
    case 'starting':
      return b.want === 'screen' ? 'Starting a desktop' : 'Starting a machine';
    case 'failed':
      return 'Could not start';
    default:
      return 'New shell';
  }
}

/**
 * What a saved pane becomes on the way back in.
 *
 * A launch does not survive the page that asked for it: the promise died with
 * the tab, so a restored `starting` would spin for a machine nobody is waiting
 * on, and a restored `failed` would state a reason about a moment that has
 * passed. Both come back as the pane that asks — by then the machine may well
 * have finished starting, and it is in the list.
 */
export function restore(b: Binding): Binding {
  return b.kind === 'starting' || b.kind === 'failed' ? { kind: 'empty' } : b;
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

/** The tmux session a machine's first pane opens.
 *
 *  It was `hanzo`, which put the company's name where the SHELL's goes and made
 *  a pane read `tabs · hanzo` — two nouns, neither of them obviously the machine
 *  or the session. Numbered from one, a pane says which box and which of its
 *  shells, and nothing has to be recognised.
 *
 *  Only NEW shells take this name: a pane that is already open was saved with
 *  its binding and comes back on the session it was on, so nothing running is
 *  left behind by the rename. */
export const DEFAULT_SHELL = 'shell-1';

const SAFE = /[^A-Za-z0-9_-]/g;

/** Reduce a name to what the machine will accept, so the two never disagree. */
export function safeName(raw: string): string {
  const n = raw.replace(SAFE, '').slice(0, 32);
  return n || DEFAULT_SHELL;
}

/** The next unused shell name for a machine, given what is already open on it. */
export function mintName(taken: readonly string[]): string {
  for (let i = 1; i <= taken.length + 1; i++) {
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

/**
 * What a typed address becomes, or null if it cannot become a page.
 *
 * Two jobs, and the second is the one that matters. A person types
 * `news.ycombinator.com` and means https, so a bare host gets a scheme. And a
 * typed string reaches an `iframe src`, where `javascript:` and `data:` are
 * script in THIS document rather than a page in the frame — so the scheme is
 * checked against http and https and nothing else is admitted. Refusing is the
 * answer: a browser pane that quietly loaded something else would be worse than
 * one that says it cannot.
 */
export function web(typed: string): string | null {
  const raw = typed.trim();
  if (!raw) return null;
  const guessed = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(guessed);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The host of a url, for a tab to name itself by. `www.` comes off because a
 *  tab strip is narrow and the four characters carry nothing. */
export function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Whether a pane is one of OURS, and so owes us a word that it came up.
 *
 * The readiness contract below is a conversation between this workspace and
 * pages we serve. A page on the open web is in no such conversation: it will
 * never post `hanzo-term`, so a rescue keyed on silence covers every browser
 * pane six seconds after it loads — offering to reconnect a site that is
 * already on screen and working.
 *
 * So silence means "did not come up" only for a pane that promised to speak.
 */
export function proves(b: Binding): boolean {
  return b.kind === 'shell' || b.kind === 'screen' || b.kind === 'gone';
}

/** Status → the colour of the dot. The ONE map: session statuses first, then a
 * machine's.
 *
 * `online | offline | draining` is exactly what the control plane sends
 * (agents.TargetOnline/Offline/Draining). `busy` was here once and is sent by
 * nothing; `draining` was missing and fell through to the offline grey, so a box
 * being deliberately drained read as dead.
 *
 * These are the design system's own state colours, read as custom properties.
 * The one exception is a machine on its way somewhere — design publishes no
 * warning rung, so the amber it was already drawing is stated here rather than
 * bent into a token that means something else. */
export const AMBER = '#f59e0b';

export const DOT: Record<string, string> = {
  running: 'var(--state-online)',
  paused: AMBER,
  done: 'var(--text-disabled)',
  error: 'var(--destructive)',
  online: 'var(--state-online)',
  draining: AMBER,
  offline: 'var(--text-disabled)',
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

/** Panes that should show the way out: waited past the deadline, never heard
 *  from, and OURS to hear from (see `proves`). A pane that has not waited yet is
 *  absent, not false — it is still loading, and nothing should be drawn over it. */
export function rescued(
  waited: Record<string, boolean>,
  alive: Record<string, boolean>,
  proving: Record<string, boolean>,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.keys(waited)
      .filter((id) => waited[id] && proving[id])
      .map((id) => [id, !alive[id]]),
  );
}

