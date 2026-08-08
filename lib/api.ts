/**
 * The control plane, read from the browser.
 *
 * Tabs has no backend of its own — deliberately. The machines are already
 * registered with api.hanzo.ai by `hanzo link`, and the terminals are already
 * served by those machines over their own tunnels. A server here would be a third
 * party to a conversation that has two, and one more thing to keep running.
 */

export const API = process.env.NEXT_PUBLIC_HANZO_API ?? 'https://api.hanzo.ai';

export interface Machine {
  id: string;
  label: string;
  host?: string;
  status: string;
  capacity?: string;
}

export interface Session {
  id: string;
  host?: string;
  status: string;
  terminal?: string;
  cwd?: string;
  agent?: string;
  updatedAt?: string;
}

async function read<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const machines = (token: string) =>
  read<{ targets: Machine[] }>('/v1/agents/targets', token).then((r) => r.targets ?? []);

export const sessions = (token: string) =>
  read<{ sessions: Session[] }>('/v1/agents/sessions?limit=200', token).then((r) => r.sessions ?? []);

/**
 * Cloud machines — the boxes we launch for you, rather than the ones you linked.
 *
 * A different plane, and deliberately not hidden behind the first one: visor
 * owns provisioning (launch, list, destroy, per-org billing over Hanzo's house
 * account), api.hanzo.ai owns the live agent registry. Proxying one through the
 * other would put Tabs in the middle of a conversation it is not part of, which
 * is the same reason this app has no backend.
 *
 * They MEET at the machine. A launched box runs `hanzo link` exactly as your
 * laptop does, so it registers itself and its terminal shows up in the registry
 * above with no special case anywhere — a cloud machine is not a new kind of
 * pane, it is a machine that happens to have been started by us.
 */
export const VISOR = process.env.NEXT_PUBLIC_HANZO_VISOR ?? 'https://visor.hanzo.ai';

/** What visor reports about a box. `state` is the provider's, `tag` carries kind. */
export interface CloudMachine {
  name: string;
  id: string;
  displayName?: string;
  provider?: string;
  region?: string;
  size?: string;
  state?: string;
  tag?: string;
}

async function visorCall<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${VISOR}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  const body = (await res.json()) as { status?: string; msg?: string; data?: T };
  // Visor answers 200 with {status:"error"} — the SDK contract is to branch on
  // the field, not the code, so a failed launch that read as success would look
  // like a machine that never appears.
  if (body.status === 'error') throw new Error(body.msg || 'visor refused the request');
  return (body.data ?? body) as T;
}

/** Boxes this org has running. `kind=tab` filters to the ones you can open. */
export const cloudMachines = (token: string, kind = 'tab') =>
  visorCall<CloudMachine[]>(`/v1/machines?kind=${encodeURIComponent(kind)}`, token).then(
    (m) => m ?? [],
  );

/**
 * Launch one.
 *
 * `kind: 'tab'` and not `'bot'`: a tab runs `hanzo link` and stops there, so you
 * get a shell without bootstrapping an agent runtime nobody asked for — and the
 * runtime is the expensive half. See visor service/analytics.go, where the kinds
 * nest: machine ⊂ tab ⊂ bot.
 */
export const launchCloudMachine = (token: string, name?: string) =>
  visorCall<CloudMachine>('/v1/machines/launch', token, {
    method: 'POST',
    body: JSON.stringify({ kind: 'tab', name: name || undefined }),
  });

/**
 * Dev sandboxes — the third kind of machine, and the ONE terminal contract.
 *
 * The builder's pods (hanzo.app, console.hanzo.ai) serve the same framed
 * terminal every other surface uses: cloud hosts the whole emulator page at
 * /v1/sandboxes/:id/terminal, and the URL's only credential is a single-use,
 * thirty-second ticket. So a sandbox joins this workspace with no new pane
 * kind — it is a machine whose terminal URL is MINTED per open instead of
 * published by `hanzo link`, and `?arg=` names the tmux session exactly as a
 * linked machine's ttyd does.
 */
export interface SandboxMachine {
  id: string;
  status: string;
  project?: string;
}

export const sandboxes = (token: string) =>
  read<{ sandboxes?: SandboxMachine[] }>('/v1/sandboxes?status=running', token).then((r) =>
    (r.sandboxes ?? []).filter((s) => s.status === 'running'),
  );

/** Mint the single-use ticket for a sandbox's terminal. Spent on first use. */
export const terminalTicket = async (token: string, id: string): Promise<string> => {
  const res = await fetch(`${API}/v1/sandboxes/${encodeURIComponent(id)}/terminal/ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`terminal ticket → ${res.status}`);
  const body = (await res.json()) as { ticket?: string };
  if (!body.ticket) throw new Error('terminal ticket → empty answer');
  return body.ticket;
};

/** The framed terminal's address — ticket in the URL, bearer never. */
export function sandboxTerminal(id: string, ticket: string, name: string): string {
  return (
    `${API}/v1/sandboxes/${encodeURIComponent(id)}/terminal` +
    `?ticket=${encodeURIComponent(ticket)}&arg=${encodeURIComponent(name)}`
  );
}
