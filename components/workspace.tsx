'use client';

/**
 * The terminal workspace — split, resize, sweep, and open new shells.
 *
 * Arrangement lives in `lib/tiles` (a tree, pure) and what a pane SHOWS lives in
 * `lib/panes` (a binding, pure). This file turns those into boxes, and turns
 * pointers back into rewrites. It decides nothing about layout.
 *
 * FOUR THINGS ARE NOT OBVIOUS, AND ALL FOUR WERE LEARNED THE HARD WAY.
 *
 * 1. THE PANES ARE A FLAT LIST IN A FIXED ORDER. Nesting them the way the tree
 *    nests remounts every <iframe> on any split, and each terminal reconnects.
 *    The order comes from `stableOrder` — append-only — because it once came from
 *    the sessions array, which the control plane sorts by RECENCY: a session
 *    touching its cwd could reorder the array and remount the whole page.
 *
 * 2. A DRAG NEEDS A SHEET. The pointer leaves the divider and immediately crosses
 *    an iframe, which swallows the event; the drag dies a few pixels in. A
 *    transparent overlay for the duration keeps the events on this document.
 *
 * 3. A TERMINAL PROVES ITSELF; IT IS NOT INFERRED. The rescue must be ON TOP of
 *    the frame — measured at eight viewports, `elementFromPoint` returned the
 *    iframe every time, so a way out underneath is no way out. And WHETHER to
 *    show it comes from the terminal saying `hanzo-term: ready`, never from
 *    reading the frame's DOM: a gate redirect ending at hanzo.id's
 *    `frame-ancestors 'none'` leaves `chrome-error://chromewebdata/`, which
 *    throws on contentDocument exactly like a healthy cross-origin load. Silence
 *    is the rescue; every way a frame can fail is the same silence.
 *
 * 4. A PHONE PAGES, IT DOES NOT TILE. 390px cannot hold two terminals and stay
 *    legible, so `pageGeometry` turns side-by-side splits into swipeable pages
 *    and keeps stacked ones stacked. Same tree, same renderer.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, Columns2, Loader2, Minus, Monitor, Plus, Rows2, X } from 'lucide-react';

import {
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
  stableOrder,
  stackFor,
} from '@/lib/tiles';
import {
  DEADLINE,
  DOT,
  type Binding,
  isReady,
  label,
  machineOf,
  mintName,
  rescued,
  restore,
} from '@/lib/panes';

/** A machine that can serve shells: its name and the tunnel its terminals live on. */
export interface TerminalHost {
  machine: string;
  /** The share URL `hanzo link` published. Absent ⇒ nothing to frame. */
  base?: string;
  /** A sandbox's id. Its URLs are MINTED per open (single-use ticket) rather
   *  than published, so a sandbox host has this and no base. */
  sandbox?: string;
  /** Whether this machine has a DISPLAY to watch. It is the machine's own
   *  answer — a `desktop` sandbox runs an X server and a VNC server, the other
   *  classes have neither — and never inferred from a name. */
  screen?: boolean;
  status: string;
  label?: string;
}

const STORE_KEY = 'hanzo.tabs.layout.v1';

interface Saved {
  tree: Tile | null;
  bind: Record<string, Binding>;
  seq: number;
}

function load(): Saved | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const v = raw ? (JSON.parse(raw) as Saved) : null;
    return v && v.bind ? v : null;
  } catch {
    return null; // a corrupt layout is no layout, never a crash
  }
}

/**
 * How big the type is, in every terminal at once.
 *
 * It is kept APART from the layout, under its own key, because they are answers
 * to different questions: a layout is this workspace's arrangement and a person
 * rearranges it all day, while type size is how their eyes work and should
 * survive closing every pane they have.
 *
 * The terminal is a cross-origin frame, so this cannot be CSS — it is a message
 * the pane's own page applies to its live terminal, on the reverse leg of the
 * channel the readiness handshake already uses. Sending it on every change AND
 * on every pane that reports ready is what makes one setting reach panes that
 * open later, with nothing to remember.
 */
const SIZE_KEY = 'hanzo.tabs.size.v1';
const SIZE = { min: 8, max: 32, step: 1, default: 12 } as const;

function clampSize(n: number): number {
  return Math.min(SIZE.max, Math.max(SIZE.min, Math.round(n)));
}

function loadSize(): number {
  if (typeof window === 'undefined') return SIZE.default;
  const n = Number(window.localStorage.getItem(SIZE_KEY));
  return Number.isFinite(n) && n > 0 ? clampSize(n) : SIZE.default;
}

export function Workspace({
  hosts,
  mint,
  onLaunch,
  start,
  end,
}: {
  hosts: TerminalHost[];
  /** What sits at the ends of the action row — the brand, and the way out.
   *  They are the page's, not the workspace's, but they are three controls
   *  wide and a row of their own cost every pane 28px of terminal. A workspace
   *  is measured in rows you can read, so the row they belong in is this one. */
  start?: ReactNode;
  end?: ReactNode;
  /** A fresh URL for a pane, for whatever that pane shows. EVERY pane, not only
   *  a sandbox's: a machine you linked and a machine we started differ in who
   *  serves the page and what credential opens it, and in nothing a layout cares
   *  about. The caller owns the token; the workspace only ever holds the URL. */
  mint?: (host: TerminalHost, what: Binding) => Promise<string>;
  /** Start a cloud machine of one class, and answer the name it goes by here. */
  onLaunch?: (kind: 'dev' | 'desktop') => Promise<string>;
}) {
  // A machine with no `base` serves no terminal, and there is nothing to open on
  // one of those — except a sandbox, whose URL is minted on bind rather than
  // published.
  const live = useMemo(
    () => hosts.filter((h) => (h.base || h.sandbox) && h.status !== 'offline'),
    [hosts],
  );
  /** The live machines with a display. A linked machine has none to offer —
   *  what `hanzo link` publishes is a terminal — so this is the sandboxes that
   *  were started as desktops. */
  const watchable = useMemo(() => live.filter((h) => h.screen), [live]);

  const [tile, setTile] = useState<Tile | null>(null);
  const [bind, setBind] = useState<Record<string, Binding>>({});
  const seq = useRef(0);
  const [ready, setReady] = useState(false);

  // Restore, or open the first machine's default shell. A saved pane whose machine
  // is gone is KEPT and marked — tmux is still holding that session, and a layout
  // is the reader's, not a function of someone else's uptime.
  useEffect(() => {
    if (ready) return;
    const saved = load();
    if (saved?.tree) {
      seq.current = saved.seq ?? 0;
      const known = new Set(live.map((h) => h.machine));
      setBind(
        Object.fromEntries(
          Object.entries(saved.bind).map(([id, b]) => [
            id,
            b.kind === 'shell' && !known.has(b.shell.machine)
              ? ({ kind: 'gone', shell: b.shell } as Binding)
              : restore(b),
          ]),
        ),
      );
      setTile(saved.tree);
    } else if (live[0]) {
      const id = `p${seq.current++}`;
      setBind({ [id]: { kind: 'shell', shell: { machine: live[0].machine, name: mintName([]) } } });
      setTile(pane(id));
    }
    setReady(true);
  }, [live, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      if (tile) {
        window.localStorage.setItem(STORE_KEY, JSON.stringify({ tree: tile, bind, seq: seq.current }));
      } else {
        window.localStorage.removeItem(STORE_KEY);
      }
    } catch {
      /* private mode or quota — a layout that cannot be saved still works today */
    }
  }, [tile, bind, ready]);

  const ids = useMemo(() => (tile ? paneIds(tile) : []), [tile]);
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => setOrder((p) => stableOrder(p, ids)), [ids]);

  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!focus || !ids.includes(focus)) setFocus(ids[0] ?? null);
  }, [ids, focus]);

  const hostOf = useCallback((m: string) => hosts.find((h) => h.machine === m), [hosts]);

  /** Shell names already open on a machine, so a new one does not collide. */
  const takenOn = useCallback(
    (m: string) =>
      Object.values(bind)
        .filter(
          (b): b is Extract<Binding, { kind: 'shell' }> =>
            b.kind === 'shell' && b.shell.machine === m,
        )
        .map((b) => b.shell.name),
    [bind],
  );

  /** What a machine looks like in a pane, each way of looking at one. Two
   *  functions and not a flag, because only one of them has a name to mint. */
  const shellOn = useCallback(
    (machine: string): Binding => ({
      kind: 'shell',
      shell: { machine, name: mintName(takenOn(machine)) },
    }),
    [takenOn],
  );
  const screenOn = useCallback((machine: string): Binding => ({ kind: 'screen', machine }), []);

  /** Open a NEW pane showing `what`, beside `target` — or as the whole layout.
   *  Answers with the pane's id, so a caller still waiting on what goes in it
   *  can settle that one box later. */
  const open = useCallback((what: Binding, dir: Dir | null, target: string | null) => {
    const id = `p${seq.current++}`;
    setBind((b) => ({ ...b, [id]: what }));
    setTile((t) => (t && target && dir ? splitPane(t, target, dir, id) : (t ?? pane(id))));
    setFocus(id);
    return id;
  }, []);

  /** Put `what` in a pane that is still open. A pane closed while its machine
   *  was starting stays closed — an answer arriving late must not reopen a box
   *  someone shut. */
  const settle = useCallback((id: string, what: Binding) => {
    setBind((b) => (b[id] ? { ...b, [id]: what } : b));
  }, []);

  /** Start a machine and open it. The point of the button is what you get to
   *  look at: a machine that arrives with nothing framed on it is a row in a
   *  list, and you would have to go and ask for the thing you already asked for. */
  const launch = useCallback(
    (kind: 'dev' | 'desktop') => {
      if (!onLaunch) return;
      const want = kind === 'desktop' ? 'screen' : 'shell';
      // The pane opens on the CLICK, not on the answer. Provisioning is the
      // long part, so waiting for it before drawing anything is a workspace
      // that sits unchanged for the whole minute you are waiting.
      const id = open({ kind: 'starting', want }, focus ? 'row' : null, focus);
      onLaunch(kind)
        .then((machine) => settle(id, want === 'screen' ? screenOn(machine) : shellOn(machine)))
        .catch((e) =>
          settle(id, {
            kind: 'failed',
            why: e instanceof Error ? e.message : 'could not start a machine',
          }),
        );
    },
    [onLaunch, open, settle, focus, shellOn, screenOn],
  );

  const doClose = useCallback((id: string) => {
    setTile((t) => (t ? closePane(t, id) : null));
    setBind((b) => {
      const next = { ...b };
      delete next[id];
      return next;
    });
  }, []);

  // ---- geometry: desktop tiles, phone pages ------------------------------
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]!.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // The breakpoint is the ROOM, not the device: a phone in landscape and a narrow
  // desktop window have the same problem, and neither can hold two terminals.
  const paging = box.w > 0 && box.w < 640;
  const paged = useMemo(
    () => (tile && paging ? pageGeometry(tile, stackFor(box.h)) : null),
    [tile, paging, box.h],
  );
  const geo: Geometry = useMemo(
    () => paged ?? (tile ? geometry(tile) : { rects: [], dividers: [] }),
    [paged, tile],
  );
  const placed = useMemo(() => new Map(geo.rects.map((r) => [r.id, r])), [geo]);

  const pages = paged?.pages ?? 1;
  const [page, setPage] = useState(0);
  useEffect(() => setPage((p) => Math.min(p, pages - 1)), [pages]);
  useEffect(() => {
    // Following the focused pane keeps the strip and the view in agreement.
    if (paged && focus && paged.page[focus] !== undefined) setPage(paged.page[focus]!);
  }, [paged, focus]);

  // ---- dragging a divider -------------------------------------------------
  const [drag, setDrag] = useState<{ path: Path; dir: Dir } | null>(null);
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r || r.width === 0 || r.height === 0) return;
      // In the paged projection the track is `pages * 100%` wide and shifted, so a
      // horizontal drag is measured against ONE page, not the whole track.
      const frac =
        drag.dir === 'row'
          ? (e.clientX - r.left) / r.width
          : (e.clientY - r.top) / r.height;
      setTile((t) => (t ? setRatio(t, drag.path, frac) : t));
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag]);

  // Click-to-focus from INSIDE a frame: the click never reaches this document,
  // but the window losing focus does, and activeElement is then the iframe.
  useEffect(() => {
    const onBlur = () =>
      setTimeout(() => {
        const el = document.activeElement;
        if (el instanceof HTMLIFrameElement && el.dataset.pane) setFocus(el.dataset.pane);
      }, 0);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // A pane shows the rescue unless ITS OWN TERMINAL SAYS IT IS THERE.
  //
  // Inferring this from the DOM does not work, and shipped broken twice. The
  // guess was that a refusal stays at `about:blank` — same-origin, readable,
  // empty — while a real load throws on contentDocument. There is a third case
  // and it is the COMMON one: the frame follows the tunnel to its OAuth gate,
  // the gate redirects to hanzo.id, hanzo.id sends `frame-ancestors 'none'`, and
  // Chrome swaps in `chrome-error://chromewebdata/`. That throws exactly like a
  // successful load, so every genuinely-blocked terminal read as fine and the
  // user got an opaque black rectangle with no way out.
  //
  // So stop inferring. Our terminal page posts `hanzo-term: ready` when xterm has
  // booted (cli/assets/term/client.js), and that message is the only thing
  // treated as proof. Silence past the deadline is the rescue, whatever the
  // cause — gate, CSP, dead tunnel, offline machine. One signal, one meaning, and
  // no case analysis to get wrong the next time a browser invents a fourth way to
  // fail.
  const [alive, setAlive] = useState<Record<string, boolean>>({});
  const [waited, setWaited] = useState<Record<string, boolean>>({});
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({});

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!isReady(e.data)) return;
      // The sender identifies the pane: a message is trusted only when it comes
      // from the window of a frame this workspace actually rendered. The origin
      // is not pinned because every machine publishes on its own tunnel host.
      for (const [id, el] of Object.entries(frames.current)) {
        if (el && e.source === el.contentWindow) {
          setAlive((a) => (a[id] ? a : { ...a, [id]: true }));
          return;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The reader's type size, told to every terminal that is up.
  //
  // It runs on `alive` as well as on the size itself, so a pane that boots after
  // the setting was chosen is told as soon as it says it is ready — the same
  // signal, used for the same reason, rather than a second notion of when a
  // frame can be spoken to. A pane that never answers is never sent to, which is
  // right: there is nothing there to hear it.
  const [size, setSize] = useState(loadSize);
  useEffect(() => {
    window.localStorage.setItem(SIZE_KEY, String(size));
    for (const [id, el] of Object.entries(frames.current)) {
      if (alive[id]) el?.contentWindow?.postMessage({ source: 'hanzo-term', fontSize: size }, '*');
    }
  }, [size, alive]);

  const probe = useCallback((id: string, el: HTMLIFrameElement | null) => {
    frames.current[id] = el;
    if (!el) return;
    // Give the terminal a moment to boot before calling it absent — a rescue that
    // flashes over every pane on every load is its own defect.
    const t = setTimeout(() => setWaited((w) => (w[id] ? w : { ...w, [id]: true })), DEADLINE);
    return () => clearTimeout(t);
  }, []);

  const refused = useMemo(() => rescued(waited, alive), [waited, alive]);

  // A pick is "which machine", and what to MAKE of the one picked comes with
  // the question — so the same picker asks for a shell's machine and a
  // screen's, and neither knows about the other.
  const [picking, setPicking] = useState<null | {
    make: (m: string) => Binding;
    from: TerminalHost[];
    dir: Dir | null;
    target: string | null;
  }>(null);
  const rendered = useMemo(() => order.filter((id) => bind[id]), [order, bind]);

  // A PANE'S URL IS MINTED, NEVER DERIVED — for every machine, not only the
  // ones we start. Minted per PANE and kept until that pane reconnects, because
  // what the mint returns is spent: a sandbox's ticket by the frame's first
  // load, a tunnel's session by nothing, but both are asked for with a
  // credential this component deliberately does not hold. Re-deriving on render
  // would hand the iframe a dead one.
  //
  // In-flight ids are tracked outside state so a re-render mid-mint cannot start
  // a second mint for the same pane.
  const [minted, setMinted] = useState<Record<string, string>>({});
  const minting = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!mint) return;
    for (const id of rendered) {
      const b = bind[id];
      const m = b && (b.kind === 'shell' || b.kind === 'screen') ? machineOf(b) : null;
      if (!b || !m) continue;
      const h = hostOf(m);
      if (!h || minted[id] || minting.current.has(id)) continue;
      minting.current.add(id);
      mint(h, b)
        .then((src) => setMinted((m) => ({ ...m, [id]: src })))
        // A pane whose URL never arrived is offered the way out immediately,
        // rather than waiting out a deadline for a frame that was never made.
        .catch(() => setWaited((w) => ({ ...w, [id]: true })))
        .finally(() => minting.current.delete(id));
    }
  }, [rendered, bind, hostOf, mint, minted]);

  /** Reconnect a pane: forget the spent URL and the frame's history so the mint
   *  effect runs again with a fresh credential and the deadline re-arms. */
  const reconnect = useCallback((id: string) => {
    const drop = <T,>(o: Record<string, T>): Record<string, T> => {
      const { [id]: _gone, ...rest } = o;
      return rest;
    };
    setMinted(drop);
    setAlive(drop);
    setWaited(drop);
  }, []);

  if (live.length === 0 && !tile) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          No machine is serving terminals. Run <code className="text-foreground">hanzo link</code> on
          one and it appears here.
        </p>
        {/* The header is not rendered in this branch, and someone with no machine
            at all is exactly who has nowhere else to get one. */}
        {onLaunch ? (
          <div className="flex items-center gap-1.5 text-xs">
            <Act run={() => launch('dev')} icon={<Cloud className="h-3.5 w-3.5" />} label="New cloud machine" />
            <Act run={() => launch('desktop')} icon={<Monitor className="h-3.5 w-3.5" />} label="New desktop" />
          </div>
        ) : null}
      </div>
    );
  }

  /** Never make someone choose from a set of one. */
  const openHere = (make: (m: string) => Binding, from: TerminalHost[], dir: Dir | null, target: string | null) => {
    if (from.length === 1) open(make(from[0]!.machine), dir, target);
    else setPicking({ make, from, dir, target });
  };

  /** A shell goes on any live machine. */
  const openShell = (dir: Dir | null, target: string | null) => openHere(shellOn, live, dir, target);

  /** A screen goes only where there IS one — and where there is none, the
   *  button starts the machine that has one. One press, one meaning: show me a
   *  desktop. */
  const openScreen = (dir: Dir | null, target: string | null) =>
    watchable.length ? openHere(screenOn, watchable, dir, target) : launch('desktop');

  return (
    <div className="flex h-full w-full flex-col gap-1.5">
      {/* One row. Actions, not a status report. */}
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {start}
        <Act
          run={() => openShell(focus ? 'row' : null, focus)}
          icon={<Plus className="h-3.5 w-3.5" />}
          label="New shell"
        />
        {/* One button for the screen, whether or not a machine with one exists
            yet: with a desktop live it opens it, without one it starts it. The
            alternative — a disabled button beside a second button that makes it
            work — is two controls for one intention. */}
        {watchable.length || onLaunch ? (
          <Act
            run={() => openScreen(focus ? 'row' : null, focus)}
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="Desktop"
          />
        ) : null}
        {onLaunch ? (
          <Act
            run={() => launch('dev')}
            icon={<Cloud className="h-3.5 w-3.5" />}
            label="New cloud machine"
          />
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {/* Type size. Two buttons and the number they move — a stepper IS the
              setting, so there is no panel to open and nothing to find. It reads
              its own state, which a slider or a menu would each need a second
              affordance to do. */}
          <span className="mr-1 inline-flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => setSize((n) => clampSize(n - SIZE.step))}
              disabled={size <= SIZE.min}
              title="Smaller text"
              aria-label="Smaller text"
              className="inline-flex min-h-9 items-center px-2 text-foreground hover:bg-muted disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className="min-w-6 select-none text-center tabular-nums text-foreground"
              title="Terminal text size"
            >
              {size}
            </span>
            <button
              type="button"
              onClick={() => setSize((n) => clampSize(n + SIZE.step))}
              disabled={size >= SIZE.max}
              title="Larger text"
              aria-label="Larger text"
              className="inline-flex min-h-9 items-center px-2 text-foreground hover:bg-muted disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </span>
          <button
            type="button"
            onClick={() => focus && openShell('row', focus)}
            disabled={!focus}
            title="Split right"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Right</span>
          </button>
          <button
            type="button"
            onClick={() => focus && openShell('col', focus)}
            disabled={!focus}
            title="Split down"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Rows2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Down</span>
          </button>
          {end}
        </span>
      </div>

      {/* The phone's pager. One chip per PAGE, because pages are what you swipe. */}
      {paging && pages > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto">
          {Array.from({ length: pages }, (_, i) => {
            const first = geo.rects.find((r) => Math.round(r.left / 100) === i);
            const b = first ? bind[first.id] : undefined;
            const name = b ? label(b) : String(i + 1);
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setPage(i);
                  if (first) setFocus(first.id);
                }}
                className={`min-h-9 max-w-[10rem] shrink-0 truncate rounded-md px-2.5 text-xs ${
                  i === page ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        ref={boxRef}
        className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border bg-black"
      >
        <div
          className="absolute inset-0"
          style={
            paging
              ? {
                  width: `${pages * 100}%`,
                  transform: `translate3d(-${(page * 100) / pages}%,0,0)`,
                  transition: drag ? 'none' : 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
                }
              : undefined
          }
        >
          {rendered.map((id) => {
            const r = placed.get(id);
            if (!r) return null;
            const b = bind[id]!;
            const on = id === focus;
            const machine = machineOf(b);
            const host = machine ? hostOf(machine) : undefined;
            const title = label(b);
            // One source, whatever the machine. A pane that has no URL yet is a
            // mint still in flight or one that could not be made — a tunnel
            // publishes a terminal and nothing else, so a linked machine has no
            // screen and never gets one.
            const url = minted[id] ?? null;
            // Every rect is page-relative; the track is `pages * 100%` wide, so a
            // page occupies `100/pages` of it.
            const left = paging ? r.left / pages : r.left;
            const width = paging ? r.width / pages : r.width;

            return (
              <div
                key={id}
                onPointerDown={() => setFocus(id)}
                className="absolute flex flex-col overflow-hidden"
                style={{
                  left: `${left}%`,
                  top: `${r.top}%`,
                  width: `${width}%`,
                  height: `${r.height}%`,
                }}
              >
                {/* A pane's name bar. It is chrome around the only thing on the
                    page worth reading, so it is as short as a touch target
                    allows and no shorter — every pixel here is a row of
                    terminal, times the number of panes. */}
                <div
                  className={`flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs ${
                    on ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${
                      b.kind === 'gone' ? DOT.offline : (DOT[host?.status ?? 'offline'] ?? DOT.offline)
                    }`}
                  />
                  <span className="truncate">
                    {title}
                  </span>
                  <span className="ml-auto hidden items-center gap-1 sm:flex">
                    <button
                      type="button"
                      onClick={() => openShell('row', id)}
                      title="Split right"
                      className="inline-flex size-6 items-center justify-center rounded hover:bg-muted-foreground/20"
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openShell('col', id)}
                      title="Split down"
                      className="inline-flex size-6 items-center justify-center rounded hover:bg-muted-foreground/20"
                    >
                      <Rows2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  {/* ONE bare button per row below sm: globals.css gives each a 44px
                      ::after, so neighbours at a 24px pitch overlap and the LAST
                      wins — close was stealing taps from split. */}
                  <button
                    type="button"
                    onClick={() => doClose(id)}
                    aria-label="Close pane"
                    className="ml-auto inline-flex size-6 items-center justify-center rounded hover:bg-muted-foreground/20 sm:ml-0"
                  >
                    <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                </div>

                <div className="relative min-h-0 flex-1 bg-black">
                  {url ? (
                    <iframe
                      data-pane={id}
                      src={url}
                      title={title}
                      className="absolute inset-0 h-full w-full bg-black"
                      // Scripts (a terminal is one), and `allow-same-origin` gives
                      // the frame ITS OWN origin — which ttyd needs for its socket
                      // — never ours. What is withheld is top-navigation and popups.
                      sandbox="allow-scripts allow-same-origin allow-forms"
                      ref={(el) => probe(id, el)}
                      onLoad={(e) => probe(id, e.currentTarget)}
                      style={{ filter: on ? undefined : 'brightness(0.65)' }}
                    />
                  ) : null}

                  {b.kind === 'empty' ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-3">
                      <Picker
                        hosts={live}
                        onPick={(m) =>
                          setBind((s) => ({
                            ...s,
                            [id]: { kind: 'shell', shell: { machine: m, name: mintName(takenOn(m)) } },
                          }))
                        }
                        onCancel={() => doClose(id)}
                      />
                    </div>
                  ) : b.kind === 'starting' ? (
                    // The loader lives HERE, in the box the machine is for —
                    // not on the button that asked. It is what tells you the
                    // click landed, and it is where the terminal appears.
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <p className="max-w-xs text-xs text-muted-foreground">
                        Starting {b.want === 'screen' ? 'a desktop' : 'a machine'}. Its{' '}
                        {b.want === 'screen' ? 'screen' : 'terminal'} opens here.
                      </p>
                    </div>
                  ) : b.kind === 'failed' ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
                      <p className="max-w-xs text-xs text-muted-foreground">{b.why}</p>
                      <button
                        type="button"
                        onClick={() => doClose(id)}
                        className="min-h-9 rounded-md border border-border px-3 text-xs hover:bg-muted"
                      >
                        Close pane
                      </button>
                    </div>
                  ) : b.kind === 'gone' ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground">{b.shell.machine}</span> is offline. The{' '}
                        <span className="text-foreground">{b.shell.name}</span> shell is still there
                        — tmux is holding it.
                      </p>
                      <button
                        type="button"
                        onClick={() => doClose(id)}
                        className="min-h-9 rounded-md border border-border px-3 text-xs hover:bg-muted"
                      >
                        Close pane
                      </button>
                    </div>
                  ) : !url ? (
                    // No tunnel to frame — a box still coming up, or a link that
                    // stopped serving. Both mean wait, and NEITHER is the OAuth
                    // gate: without this the pane falls through to the rescue,
                    // which offers to sign you in to a terminal at `#`.
                    <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
                      <p className="max-w-xs text-xs text-muted-foreground">
                        Waiting for <span className="text-foreground">{machine}</span> to{' '}
                        {b.kind === 'screen' ? 'show its screen' : 'serve a terminal'}. It appears
                        here as soon as the machine is up.
                      </p>
                    </div>
                  ) : refused[id] ? (
                    // A frame that never said ready is a credential that no
                    // longer opens anything — a spent ticket, an aged session —
                    // and the URL cannot be reopened, only asked for again.
                    // NEVER a sign-in here: the mint IS the sign-in, and sending
                    // someone to a second one is what this stopped doing.
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-4 text-center">
                      <p className="max-w-xs text-xs text-muted-foreground">
                        {b.kind === 'screen' ? 'The desktop' : 'The terminal'} did not come up.
                        Reconnecting asks for a fresh credential and tries again.
                      </p>
                      <button
                        type="button"
                        onClick={() => reconnect(id)}
                        className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm text-foreground hover:bg-muted"
                      >
                        Reconnect
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {geo.dividers.map((d) => {
            const left = paging ? d.left / pages : d.left;
            const width = paging ? d.width / pages : d.width;
            return (
              <div
                key={d.path.join('') || 'root'}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setDrag({ path: d.path, dir: d.dir });
                }}
                role="separator"
                aria-orientation={d.dir === 'row' ? 'vertical' : 'horizontal'}
                className={`group absolute z-20 touch-none bg-transparent ${
                  d.dir === 'row'
                    ? 'w-3 -translate-x-1/2 cursor-col-resize'
                    : 'h-6 -translate-y-1/2 cursor-row-resize sm:h-3'
                }`}
                style={{
                  left: `${left}%`,
                  top: `${d.top}%`,
                  width: d.dir === 'row' ? undefined : `${width}%`,
                  height: d.dir === 'row' ? `${d.height}%` : undefined,
                }}
              >
                {/* A visible grabber: a touch divider you cannot see is one that
                    does not exist. What it LOOKS like and what it CATCHES are
                    separate — the hit area above stays a thumb wide, while the
                    mark is a hairline, because a seam between two terminals
                    should read as a seam and not as a third thing in the
                    window. It brightens on hover, where the pointer already
                    is. */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/20 transition-colors group-hover:bg-foreground/40 ${
                    d.dir === 'row' ? 'h-6 w-px' : 'h-px w-6'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {drag ? (
          <div
            className={`absolute inset-0 z-30 ${
              drag.dir === 'row' ? 'cursor-col-resize' : 'cursor-row-resize'
            }`}
          />
        ) : null}

        {picking ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
            <Picker
              hosts={picking.from}
              onPick={(m) => {
                open(picking.make(m), picking.dir, picking.target);
                setPicking(null);
              }}
              onCancel={() => setPicking(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One labelled button in the action row.
 *
 * It carries no busy state and no failure of its own, and that is the point: a
 * button that asks for a machine opens the pane the machine is for, so the wait
 * and the reason it failed both belong to that pane. Keeping a spinner here too
 * would say the same thing twice, in the one place you are not looking.
 */
function Act({ run, icon, label }: { run: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={run}
      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-foreground hover:bg-muted"
    >
      {icon} {label}
    </button>
  );
}

/** Where should this shell run? Only ever shown when there is a real choice. */
function Picker({
  hosts,
  onPick,
  onCancel,
}: {
  hosts: TerminalHost[];
  onPick: (machine: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="w-full max-w-xs rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-xs text-muted-foreground">Where should this shell run?</p>
      <ul className="flex flex-col gap-1">
        {hosts.map((h) => (
          <li key={h.machine}>
            <button
              type="button"
              onClick={() => onPick(h.machine)}
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted"
            >
              <span aria-hidden className={`size-1.5 rounded-full ${DOT[h.status] ?? DOT.offline}`} />
              <span className="truncate">{h.machine}</span>
              {h.label ? (
                <span className="ml-auto truncate text-xs text-muted-foreground">{h.label}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 min-h-9 w-full rounded-md text-xs text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}

export default Workspace;
