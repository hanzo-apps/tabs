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
 * Sandboxes — the machines we start for you, rather than the ones you linked.
 *
 * The builder's pods (hanzo.app, console.hanzo.ai) serve the same framed
 * terminal every other surface uses: cloud hosts the whole emulator page at
 * /v1/sandboxes/:id/terminal, and the URL's only credential is a single-use,
 * thirty-second ticket. So a sandbox joins this workspace with no new pane
 * kind — it is a machine whose terminal URL is MINTED per open instead of
 * published by `hanzo link`, and `?arg=` names the tmux session exactly as a
 * linked machine's ttyd does.
 *
 * It is the SAME plane as the registry above, which is why there is no second
 * base URL here. A cloud machine used to be a DigitalOcean droplet ordered
 * through visor: a second provisioning plane, a second failure mode, and a
 * minute of boot and `hanzo link` before it could serve a shell. A sandbox is a
 * pod, so the request that asks for one comes back when it is already running.
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

/** How a sandbox names itself in the workspace. Its project is what its DISK is
 *  keyed on, so it is the name that means the same box tomorrow. */
export const machineName = (s: SandboxMachine) => s.project || `box-${s.id.slice(0, 6)}`;

/** The project a first cloud machine takes; the ones after it count up. */
const PROJECT = 'tabs';

/**
 * Start one, and answer it once it is RUNNING.
 *
 * `class: 'dev'` is the machine you shell into — a toolchain, a home, and a disk
 * that outlives the lease — as against `exec`, which is the code interpreter's
 * scratch pod. A dev sandbox is named by its project, and the project is what
 * the disk is keyed on: one live sandbox per project is the server's rule, so
 * the name is picked against what is already live rather than made up. That is
 * what makes a second press a second machine instead of a second attempt at the
 * first one.
 *
 * The lease is the server's to set. Tabs has no opinion about how long a machine
 * should live, and a `ttlSec` here would be a second answer to drift from the one
 * in the class table.
 */
export const createSandbox = async (token: string): Promise<SandboxMachine> => {
  const taken = new Set((await sandboxes(token)).map(machineName));
  let project = PROJECT;
  for (let n = 2; taken.has(project); n++) project = `${PROJECT}-${n}`;
  const res = await fetch(`${API}/v1/sandboxes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ class: 'dev', project }),
    cache: 'no-store',
  });
  // Starting a machine fails for reasons a person can act on — an image that
  // will not pull, a project already held, an org at its ceiling — and the
  // server says which. A bare status code next to the button would name none of
  // them.
  if (!res.ok) {
    const why = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(why?.error || `new machine → ${res.status}`);
  }
  return (await res.json()) as SandboxMachine;
};

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
