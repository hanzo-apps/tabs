import {
  DEADLINE,
  DEFAULT_SHELL,
  DOT,
  READY,
  isReady,
  label,
  machineOf,
  mintName,
  rescued,
  restore,
  safeName,
  shellUrl,
} from '@/lib/panes';

/**
 * A pane's URL is the whole "new shell" mechanism, so the rules about it are the
 * feature. `--url-arg` hands the query to a command running on someone's machine;
 * everything here is about that not being a way in.
 */
describe('a shell is named by the URL, and the name is bounded', () => {
  it('keeps a name the machine will accept', () => {
    expect(safeName('build')).toBe('build');
    expect(safeName('deploy-2')).toBe('deploy_2'.replace('_', '-'));
  });

  it('strips what tmux would read as syntax', () => {
    // `;` is tmux's command separator: `new -A -s x; whoami` is two commands.
    expect(safeName('x; whoami')).toBe('xwhoami');
    expect(safeName('a b c')).toBe('abc');
    expect(safeName('../../etc')).toBe('etc');
  });

  it('bounds the length and never yields nothing', () => {
    expect(safeName('a'.repeat(200))).toHaveLength(32);
    expect(safeName('')).toBe(DEFAULT_SHELL);
    expect(safeName('💀')).toBe(DEFAULT_SHELL);
  });

  it('sets exactly ONE arg — a second is a second argument to a real shell', () => {
    const u = new URL(shellUrl('https://x.share.hanzo.ai', 'build'));
    expect(u.searchParams.getAll('arg')).toEqual(['build']);
    // Even when the base already carries one.
    const v = new URL(shellUrl('https://x.share.hanzo.ai/?arg=evil', 'build'));
    expect(v.searchParams.getAll('arg')).toEqual(['build']);
  });

  it('sanitises through the URL too, not only at the edge', () => {
    const u = new URL(shellUrl('https://x.share.hanzo.ai', 'x; whoami'));
    expect(u.searchParams.get('arg')).toBe('xwhoami');
  });

  it('leaves a base it cannot parse alone rather than corrupting it', () => {
    expect(shellUrl('not a url', 'build')).toBe('not a url');
  });
});

describe('a machine’s next shell has a name nobody has to invent', () => {
  it('the first is the default', () => {
    expect(mintName([])).toBe(DEFAULT_SHELL);
  });

  it('then numbers, skipping what is open', () => {
    expect(mintName([DEFAULT_SHELL])).toBe('shell-2');
    expect(mintName([DEFAULT_SHELL, 'shell-2'])).toBe('shell-3');
    expect(mintName([DEFAULT_SHELL, 'shell-3'])).toBe('shell-2');
  });

  it('reuses the default once it is free — closing a pane frees its name', () => {
    // tmux new -A attaches, so reopening the name reopens the SAME shell.
    expect(mintName(['shell-2'])).toBe(DEFAULT_SHELL);
  });
});

/**
 * A terminal is present only when it SAYS so.
 *
 * This shipped wrong twice by inference. The guess was that a refused frame stays
 * at `about:blank` — same-origin, readable, empty — while a real load throws on
 * `contentDocument`. The common case is neither: the frame follows the tunnel to
 * its OAuth gate, the gate redirects to hanzo.id, hanzo.id answers
 * `frame-ancestors 'none'`, and the browser swaps in `chrome-error://chromewebdata/`
 * — which throws EXACTLY like a healthy cross-origin load. So every genuinely
 * blocked terminal read as fine, and the user got an opaque black rectangle with
 * the way out hidden underneath it.
 */
describe('a framed page announces itself, and silence is the rescue', () => {
  it('recognises our pages and nothing else', () => {
    // Both of them: a terminal and a screen fail the same way and are proved
    // the same way, so one predicate answers for both.
    for (const source of READY) expect(isReady({ source, ready: true })).toBe(true);
    expect(READY).toEqual(['hanzo-term', 'hanzo-screen']);
    // Everything a hostile or unrelated frame might post.
    expect(isReady({ source: 'other-app' })).toBe(false);
    expect(isReady({ ready: true })).toBe(false);
    expect(isReady('hanzo-term')).toBe(false);
    expect(isReady(null)).toBe(false);
    expect(isReady(undefined)).toBe(false);
  });

  it('leaves a pane alone until its terminal has had time to boot', () => {
    // Nothing waited yet: still connecting. Drawing a rescue here would flash it
    // over every pane on every load.
    expect(rescued({}, {})).toEqual({});
    expect(rescued({ p0: false }, {})).toEqual({});
  });

  it('rescues a pane that waited and never spoke', () => {
    expect(rescued({ p0: true }, {})).toEqual({ p0: true });
    expect(rescued({ p0: true }, { p0: true })).toEqual({ p0: false });
  });

  it('judges each pane on its own terminal', () => {
    // One machine gated, one fine — the gated pane alone gets the way out.
    expect(rescued({ p0: true, p1: true }, { p1: true })).toEqual({ p0: true, p1: false });
  });

  it('waits long enough that a slow connect is not called dead', () => {
    expect(DEADLINE).toBeGreaterThanOrEqual(3000);
  });
});

/**
 * A pane shows a machine, one of two ways: its shell or its screen. Both are
 * bound to a machine and neither is a special case of the other — which is the
 * whole reason the binding says which it is instead of the URL implying it.
 */
describe('a pane bound to a screen is still bound to a machine', () => {
  it('names the machine whichever face it is showing', () => {
    expect(machineOf({ kind: 'shell', shell: { machine: 'desk', name: 'hanzo' } })).toBe('desk');
    expect(machineOf({ kind: 'screen', machine: 'desk' })).toBe('desk');
    expect(machineOf({ kind: 'gone', shell: { machine: 'desk', name: 'hanzo' } })).toBe('desk');
    // A split with nothing chosen yet is bound to nothing, and saying so is what
    // stops a mint being attempted for it.
    expect(machineOf({ kind: 'empty' })).toBeNull();
  });

  it('names the machine and which of its faces, so a pane needs no key', () => {
    // The shape: <machine> · <face>. Both halves are numbered, so neither has
    // to be recognised as the odd one — `tabs · hanzo` was two bare nouns and
    // told you neither which box nor which shell.
    expect(label({ kind: 'shell', shell: { machine: 'cloud-2', name: 'shell-1' } })).toBe(
      'cloud-2 · shell-1',
    );
    expect(label({ kind: 'screen', machine: 'desk-1' })).toBe('desk-1 · desk');
  });

  it('says what it is showing, so the header and the frame agree', () => {
    expect(label({ kind: 'shell', shell: { machine: 'cloud-2', name: 'build' } })).toBe(
      'cloud-2 · build',
    );
    expect(label({ kind: 'screen', machine: 'desk-1' })).toBe('desk-1 · desk');
    expect(label({ kind: 'empty' })).toBe('New shell');
  });
});

/**
 * A machine that does not exist yet still gets a pane.
 *
 * The pane is opened by the CLICK and settled by the ANSWER, because
 * provisioning a cloud machine is tens of seconds and waiting for it before
 * drawing anything leaves the workspace looking like the click missed. So a
 * binding has to be able to say "a machine is coming" and "none came".
 */
describe('a pane can be waiting for a machine', () => {
  it('is bound to no machine while one is being made', () => {
    // Load-bearing: the mint effect keys on machineOf, so a starting pane
    // naming a machine would send a ticket request for a box that is not there.
    expect(machineOf({ kind: 'starting', want: 'shell' })).toBeNull();
    expect(machineOf({ kind: 'starting', want: 'screen' })).toBeNull();
    expect(machineOf({ kind: 'failed', why: 'out of capacity' })).toBeNull();
  });

  it('says which kind of machine it is waiting for', () => {
    expect(label({ kind: 'starting', want: 'shell' })).toBe('Starting a machine');
    expect(label({ kind: 'starting', want: 'screen' })).toBe('Starting a desktop');
    expect(label({ kind: 'failed', why: 'out of capacity' })).toBe('Could not start');
  });

  it('comes back as the pane that asks, never as one still waiting', () => {
    // The promise died with the page, so nothing will ever settle a restored
    // `starting` — it would spin for a machine nobody is waiting on. And a
    // restored `failed` states a reason about a moment that has passed.
    expect(restore({ kind: 'starting', want: 'shell' })).toEqual({ kind: 'empty' });
    expect(restore({ kind: 'starting', want: 'screen' })).toEqual({ kind: 'empty' });
    expect(restore({ kind: 'failed', why: 'out of capacity' })).toEqual({ kind: 'empty' });
  });

  it('leaves a pane that is showing something alone', () => {
    const shell = { kind: 'shell', shell: { machine: 'desk', name: 'build' } } as const;
    const screen = { kind: 'screen', machine: 'desk' } as const;
    const gone = { kind: 'gone', shell: { machine: 'desk', name: 'build' } } as const;
    expect(restore(shell)).toBe(shell);
    expect(restore(screen)).toBe(screen);
    // A machine that went away is the ONE waiting state that survives a reload:
    // tmux is still holding that session, so the pane is still about something.
    expect(restore(gone)).toBe(gone);
  });
});
