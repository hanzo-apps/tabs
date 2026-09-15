/**
 * The workspace, for whoever is hosting it.
 *
 * tabs.hanzo.ai is one host. The desktop shell is another, and hanzo.ai a
 * third — the same tiling of terminals, desktops and pages in each, because it
 * is the same component rather than three that look alike. That is the whole
 * reason this file exists: a second copy of a pane tree is a second set of
 * answers to what a split does, and they drift.
 *
 * WHAT A HOST SUPPLIES is the machines and a way to mint a pane's url. The
 * `Workspace` component holds no token and calls no server: `hosts` and `mint`
 * come in as props, so a host points them at whichever control plane its
 * identity belongs to. The functions in `lib/api` are the ones tabs.hanzo.ai
 * uses for that, offered here because another host most likely wants the same
 * ones — each taking its origin as a parameter.
 *
 * SOURCE IS PUBLISHED, not a build. Both hosts compile TypeScript already, so a
 * build step here would be a second toolchain producing something neither
 * needs, and one more thing to be stale.
 */
export { Workspace } from './components/workspace';

export {
  DEFAULT_SHELL,
  DEADLINE,
  DOT,
  READY,
  type Binding,
  type Shell,
  host,
  isReady,
  label,
  machineOf,
  mintName,
  proves,
  rescued,
  restore,
  safeName,
  shellUrl,
  web,
} from './lib/panes';

export {
  type Dir,
  type Geometry,
  type Path,
  type Tile,
  closePane,
  geometry,
  pageGeometry,
  pane,
  paneIds,
  setRatio,
  splitPane,
} from './lib/tiles';

export {
  API,
  type Class,
  type Door,
  type Machine,
  type SandboxMachine,
  type Session,
  Refusal,
  createSandbox,
  frameUrl,
  grant,
  machineName,
  machines,
  sandboxes,
  sessions,
  unfunded,
} from './lib/api';
