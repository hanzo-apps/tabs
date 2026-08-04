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
 * 3. A REFUSED FRAME IS DETECTABLE, and the rescue must be ON TOP of it. The
 *    terminal's gate is hanzo.id, which sends `frame-ancestors 'none'`; the
 *    browser paints an opaque nothing. Putting the way out underneath — which is
 *    what shipped first — hid it completely: measured at eight viewports,
 *    `elementFromPoint` returned the iframe every time. A blocked frame never
 *    leaves `about:blank`, which is SAME-ORIGIN and therefore readable and empty;
 *    a frame that really loaded throws on that access. The throw is the good one.
 *
 * 4. A PHONE PAGES, IT DOES NOT TILE. 390px cannot hold two terminals and stay
 *    legible, so `pageGeometry` turns side-by-side splits into swipeable pages
 *    and keeps stacked ones stacked. Same tree, same renderer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Columns2, Plus, Rows2, X } from 'lucide-react';

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
import { DOT, type Binding, mintName, shellUrl } from '@/lib/panes';

/** A machine that can serve shells: its name and the tunnel its terminals live on. */
export interface TerminalHost {
  machine: string;
  /** The share URL `hanzo link` published. Absent ⇒ nothing to frame. */
  base?: string;
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

export function Workspace({ hosts }: { hosts: TerminalHost[] }) {
  const live = useMemo(() => hosts.filter((h) => h.base && h.status !== 'offline'), [hosts]);

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
          Object.entries(saved.bind).map(([id, b]) =>
            b.kind === 'shell' && !known.has(b.shell.machine)
              ? [id, { kind: 'gone', shell: b.shell } as Binding]
              : [id, b],
          ),
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

  /** Open a shell in a NEW pane beside `target` — or as the whole layout. */
  const open = useCallback(
    (machine: string, dir: Dir | null, target: string | null) => {
      const id = `p${seq.current++}`;
      const name = mintName(takenOn(machine));
      setBind((b) => ({ ...b, [id]: { kind: 'shell', shell: { machine, name } } }));
      setTile((t) => (t && target && dir ? splitPane(t, target, dir, id) : (t ?? pane(id))));
      setFocus(id);
    },
    [takenOn],
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

  const [refused, setRefused] = useState<Record<string, boolean>>({});
  const probe = useCallback((id: string, el: HTMLIFrameElement | null) => {
    if (!el) return;
    let blocked = false;
    try {
      const doc = el.contentDocument;
      blocked = !!doc && (doc.body?.childElementCount ?? 0) === 0;
    } catch {
      blocked = false; // the throw means it genuinely loaded
    }
    setRefused((r) => (r[id] === blocked ? r : { ...r, [id]: blocked }));
  }, []);

  const [picking, setPicking] = useState<null | { dir: Dir | null; target: string | null }>(null);
  const rendered = useMemo(() => order.filter((id) => bind[id]), [order, bind]);

  if (live.length === 0 && !tile) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed px-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          No machine is serving terminals. Run <code className="text-foreground">hanzo link</code> on
          one and it appears here.
        </p>
      </div>
    );
  }

  /** Never make someone choose from a set of one. */
  const openHere = (dir: Dir | null, target: string | null) => {
    if (live.length === 1) open(live[0]!.machine, dir, target);
    else setPicking({ dir, target });
  };

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {/* One row. Actions, not a status report. */}
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => openHere(focus ? 'row' : null, focus)}
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-foreground hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> New shell
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => focus && openHere('row', focus)}
            disabled={!focus}
            title="Split right"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Right</span>
          </button>
          <button
            type="button"
            onClick={() => focus && openHere('col', focus)}
            disabled={!focus}
            title="Split down"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Rows2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Down</span>
          </button>
        </span>
      </div>

      {/* The phone's pager. One chip per PAGE, because pages are what you swipe. */}
      {paging && pages > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto">
          {Array.from({ length: pages }, (_, i) => {
            const first = geo.rects.find((r) => Math.round(r.left / 100) === i);
            const b = first ? bind[first.id] : undefined;
            const label = b && b.kind !== 'empty' ? `${b.shell.machine}·${b.shell.name}` : `${i + 1}`;
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
                {label}
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
            const shell = b.kind === 'empty' ? null : b.shell;
            const host = shell ? hostOf(shell.machine) : undefined;
            const url = host?.base && shell ? shellUrl(host.base, shell.name) : null;
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
                <div
                  className={`flex h-9 shrink-0 items-center gap-1.5 px-2 text-xs ${
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
                    {shell ? `${shell.machine} · ${shell.name}` : 'New shell'}
                  </span>
                  <span className="ml-auto hidden items-center gap-1 sm:flex">
                    <button
                      type="button"
                      onClick={() => openHere('row', id)}
                      title="Split right"
                      className="inline-flex size-6 items-center justify-center rounded hover:bg-muted-foreground/20"
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openHere('col', id)}
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
                      title={shell ? `${shell.machine} · ${shell.name}` : 'terminal'}
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
                  ) : refused[id] ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-4 text-center">
                      <p className="max-w-xs text-xs text-muted-foreground">
                        This terminal needs a one-time sign-in on its own domain. The gate refuses
                        to be shown inside a frame, so it opens in a tab — once.
                      </p>
                      <a
                        href={url ?? '#'}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm text-foreground hover:bg-muted"
                      >
                        Sign in to this terminal ↗
                      </a>
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
                className={`absolute z-20 touch-none bg-transparent hover:bg-foreground/20 ${
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
                    does not exist. */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/25 ${
                    d.dir === 'row' ? 'h-8 w-[3px]' : 'h-[3px] w-8'
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
              hosts={live}
              onPick={(m) => {
                open(m, picking.dir, picking.target);
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
