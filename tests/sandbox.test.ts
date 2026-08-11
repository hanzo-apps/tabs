import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { API, createSandbox, frameUrl, machineName } from '@/lib/api';

/**
 * A sandbox joins the workspace as a machine whose URLs are MINTED, not
 * published — the one contract every Hanzo surface frames (a single-use
 * thirty-second ticket, and the page the mint names). These pin the properties
 * that would fail silently: the URL's only credential is the ticket, the door
 * asked for is the door opened, and a pane never mints twice for one bind.
 */
describe('the framed URL', () => {
  const mint = (url: string, ok = true) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = (async (u: string, init?: RequestInit) => {
      calls.push({ url: String(u), init });
      return { ok, status: ok ? 201 : 409, json: async () => ({ url }) };
    }) as unknown as typeof fetch;
    return calls;
  };

  it('asks the door it wants and frames the address that door answered', async () => {
    const calls = mint('/v1/sandboxes/box%201/terminal?ticket=tk%2B');
    const got = await frameUrl('bearer', 'box 1', 'terminal', 'build');
    expect(calls[0]!.url).toBe(`${API}/v1/sandboxes/box%201/terminal/ticket`);
    expect(calls[0]!.init!.method).toBe('POST');
    const u = new URL(got);
    expect(u.origin).toBe(new URL(API).origin);
    expect(u.pathname).toBe('/v1/sandboxes/box%201/terminal');
    expect(u.searchParams.get('ticket')).toBe('tk+');
    expect(u.searchParams.get('arg')).toBe('build');
    expect([...u.searchParams.keys()].sort()).toEqual(['arg', 'ticket']);
  });

  it('mints a SCREEN at the screen door, and gives it no shell name to attach to', async () => {
    // A machine has one display. An `arg` here would be a tmux session name sent
    // to something that has no tmux.
    const calls = mint('/v1/sandboxes/b/screen?ticket=tk');
    const got = await frameUrl('bearer', 'b', 'screen');
    expect(calls[0]!.url).toBe(`${API}/v1/sandboxes/b/screen/ticket`);
    expect(new URL(got).pathname).toBe('/v1/sandboxes/b/screen');
    expect([...new URL(got).searchParams.keys()]).toEqual(['ticket']);
  });

  it('never carries a bearer — the ticket IS the credential', async () => {
    mint('/v1/sandboxes/b/terminal?ticket=tk');
    const u = await frameUrl('a-real-looking-bearer-token', 'b', 'terminal', 's');
    expect(u).not.toMatch(/token|bearer|authorization/i);
  });

  it('refuses to frame anything when the mint refuses', async () => {
    mint('/v1/sandboxes/b/screen?ticket=tk', false);
    await expect(frameUrl('t', 'b', 'screen')).rejects.toThrow('screen ticket → 409');
  });
});

describe('the workspace mints once per pane', () => {
  const src = readFileSync(join(process.cwd(), 'components/workspace.tsx'), 'utf8');

  it('stores the minted URL as pane state, never re-derives it per render', () => {
    // A ticket is spent by the frame's first load; deriving the URL on render
    // would hand the iframe a dead credential on the next paint.
    expect(src).toContain('minted[id] ?? null');
    expect(src).toContain('minting.current.has(id)');
  });

  it('a screen is always minted, never derived from a published tunnel', () => {
    // `hanzo link` publishes a terminal and nothing else, so a screen has no
    // base to derive from. Deriving one would frame a terminal and call it a
    // desktop.
    expect(src).toContain("host?.base && b.kind === 'shell'");
  });

  it('reconnect forgets the spent URL AND the readiness history', () => {
    expect(src).toContain('setMinted(drop)');
    expect(src).toContain('setAlive(drop)');
    expect(src).toContain('setWaited(drop)');
  });

  it('a refused sandbox pane offers a re-mint, never the sign-in tab', () => {
    // The rescue branches on the host KIND first: a sandbox's dead URL cannot
    // be reopened in a tab, only re-minted.
    expect(src).toMatch(/refused\[id\] \? \(\s*host\?\.sandbox \?/);
    expect(src).toMatch(/refused\[id\] \?[\s\S]*?Reconnect/);
  });
});

describe('a sandbox is named by its project', () => {
  it('goes by the project, which is what its disk is keyed on', () => {
    expect(machineName({ id: 'abcdef123456', status: 'running', project: 'tabs' })).toBe('tabs');
  });

  it('falls back to its id, so a projectless box is still openable', () => {
    expect(machineName({ id: 'abcdef123456', status: 'running' })).toBe('box-abcdef');
  });
});

/**
 * Starting one. The server keeps ONE live sandbox per project and refuses the
 * rest, so the name is picked against what is already live — which is the whole
 * difference between a second machine and a second attempt at the first.
 */
describe('a new cloud machine', () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const answer = (live: unknown[], made: unknown, ok = true) => {
    calls.length = 0;
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const body = init?.method === 'POST' ? made : { sandboxes: live };
      return {
        ok: init?.method === 'POST' ? ok : true,
        status: ok ? 201 : 503,
        json: async () => body,
      };
    }) as unknown as typeof fetch;
  };

  it('asks for a dev sandbox — the machine you shell into, not a scratch pod', async () => {
    answer([], { id: 'b1', status: 'running', project: 'tabs' });
    await createSandbox('t');
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe(`${API}/v1/sandboxes`);
    expect(JSON.parse(String(post.init!.body))).toEqual({ class: 'dev', project: 'tabs' });
  });

  it('asks for a desktop under its OWN name — the project is what the disk is keyed on', async () => {
    // Borrowing the shell machines' project would be the same box's second
    // attempt (one live sandbox per project), not a second box.
    answer([{ id: 'b1', status: 'running', project: 'tabs' }], {
      id: 'b2',
      status: 'running',
      project: 'desk',
    });
    await createSandbox('t', 'desktop');
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ class: 'desktop', project: 'desk' });
  });

  it('counts past the boxes already live, so pressing twice makes two', async () => {
    answer(
      [
        { id: 'b1', status: 'running', project: 'tabs' },
        { id: 'b2', status: 'running', project: 'tabs-2' },
      ],
      { id: 'b3', status: 'running', project: 'tabs-3' },
    );
    await createSandbox('t');
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(JSON.parse(String(post.init!.body)).project).toBe('tabs-3');
  });

  it("carries the server's reason, because a bare status code names none of them", async () => {
    answer([], { error: 'start sandbox: pod not running after 2m0s' }, false);
    await expect(createSandbox('t')).rejects.toThrow('pod not running after 2m0s');
  });

  it('never sends the bearer to anything but the API', async () => {
    answer([], { id: 'b1', status: 'running', project: 'tabs' });
    await createSandbox('t');
    for (const c of calls) expect(c.url.startsWith(API)).toBe(true);
  });
});
