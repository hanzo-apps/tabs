import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { API, createSandbox, machineName, sandboxTerminal } from '@/lib/api';

/**
 * A sandbox joins the workspace as a machine whose URL is MINTED, not
 * published — the one terminal contract every Hanzo surface frames
 * (/v1/sandboxes/:id/terminal, single-use thirty-second ticket). These pin the
 * two properties that would fail silently: the URL's only credential is the
 * ticket, and a pane never mints twice for one bind.
 */
describe('the framed terminal URL', () => {
  it('carries the ticket and the shell name, both encoded, and nothing else', () => {
    const u = new URL(sandboxTerminal('box 1/x', 'tk+&=', 'build'));
    expect(u.origin).toBe(new URL(API).origin);
    expect(u.pathname).toBe('/v1/sandboxes/box%201%2Fx/terminal');
    expect(u.searchParams.get('ticket')).toBe('tk+&=');
    expect(u.searchParams.get('arg')).toBe('build');
    expect([...u.searchParams.keys()].sort()).toEqual(['arg', 'ticket']);
  });

  it('never carries a bearer — the ticket IS the credential', () => {
    const u = sandboxTerminal('b', 't', 's');
    expect(u).not.toMatch(/token|bearer|authorization/i);
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
