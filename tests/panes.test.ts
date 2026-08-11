import {
  DEFAULT_SHELL,
  DOT,
  TERM_DEADLINE,
  TERM_READY,
  isTermReady,
  mintName,
  rescued,
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
describe('a terminal announces itself, and silence is the rescue', () => {
  it('recognises our terminal and nothing else', () => {
    expect(isTermReady({ source: TERM_READY, ready: true })).toBe(true);
    // Everything a hostile or unrelated frame might post.
    expect(isTermReady({ source: 'other-app' })).toBe(false);
    expect(isTermReady({ ready: true })).toBe(false);
    expect(isTermReady('hanzo-term')).toBe(false);
    expect(isTermReady(null)).toBe(false);
    expect(isTermReady(undefined)).toBe(false);
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
    expect(TERM_DEADLINE).toBeGreaterThanOrEqual(3000);
  });
});
