import { DEFAULT_SHELL, mintName, safeName, shellUrl } from '@/lib/panes';

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
