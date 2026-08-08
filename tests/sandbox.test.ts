import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { API, sandboxTerminal } from '@/lib/api';

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
