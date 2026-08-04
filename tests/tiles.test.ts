import {
  MAX_RATIO,
  MIN_RATIO,
  closePane,
  hasPane,
  geometry,
  neighbour,
  pageGeometry,
  pane,
  paneIds,
  retain,
  setRatio,
  splitPane,
  stableOrder,
  stackFor,
  type Tile,
} from '@/lib/tiles';

/**
 * The layout is a tree so that closing a pane has an exact answer.
 *
 * Every test here is about a rewrite, not a rectangle: no browser, no layout
 * engine, no pixels. If these hold, the renderer's only remaining job is to turn
 * the tree into flex boxes — and a bug there shows up as a wrong-looking split,
 * never as a pane that has silently lost its terminal.
 */
describe('a layout is a tree, and closing a pane proves it', () => {
  it('a split puts the new pane in the SECOND half, where it is drawn', () => {
    const t = splitPane(pane('a'), 'a', 'row', 'b');
    expect(paneIds(t)).toEqual(['a', 'b']);
    expect(t).toMatchObject({ kind: 'split', dir: 'row', ratio: 0.5 });
  });

  it("a closed pane's space goes to its sibling — not to arithmetic", () => {
    // a | (b / c) — closing b must leave a | c, with c holding the whole half.
    let t: Tile = splitPane(pane('a'), 'a', 'row', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    expect(paneIds(t)).toEqual(['a', 'b', 'c']);

    const after = closePane(t, 'b')!;
    expect(paneIds(after)).toEqual(['a', 'c']);
    // The inner split is GONE: c was promoted into its place, so the outer split
    // still divides exactly two things.
    expect(after).toMatchObject({
      kind: 'split',
      dir: 'row',
      a: { kind: 'pane', id: 'a' },
      b: { kind: 'pane', id: 'c' },
    });
  });

  it('closing the last pane is an empty layout, said out loud', () => {
    expect(closePane(pane('only'), 'only')).toBeNull();
  });

  it('closing a pane that is not there changes nothing', () => {
    const t = splitPane(pane('a'), 'a', 'row', 'b');
    expect(closePane(t, 'ghost')).toEqual(t);
  });

  it('splitting a target no pane shows changes nothing', () => {
    // A split has to name where it happens; inventing a location would put a
    // terminal somewhere nobody asked for.
    const t = pane('a');
    expect(splitPane(t, 'ghost', 'row', 'new')).toEqual(t);
  });
});

describe('sweep order falls out of the tree', () => {
  const built = (): Tile => {
    let t: Tile = splitPane(pane('a'), 'a', 'row', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    return splitPane(t, 'c', 'row', 'd');
  };

  it('reads left-to-right, top-to-bottom', () => {
    expect(paneIds(built())).toEqual(['a', 'b', 'c', 'd']);
  });

  it('steps forward and back, and wraps at both ends', () => {
    const t = built();
    expect(neighbour(t, 'a', 1)).toBe('b');
    expect(neighbour(t, 'd', 1)).toBe('a'); // wraps forward
    expect(neighbour(t, 'a', -1)).toBe('d'); // wraps back
    expect(neighbour(t, 'c', -1)).toBe('b');
  });

  it('a pane that is not in the layout lands somewhere real', () => {
    // The focused pane can vanish (its session ended) while a key is in flight;
    // answering with the first pane beats answering with nothing.
    expect(neighbour(built(), 'ghost', 1)).toBe('a');
  });
});

describe('a divider stops before it erases a pane', () => {
  it('clamps to a floor and a ceiling', () => {
    const t = splitPane(pane('a'), 'a', 'row', 'b');
    expect(setRatio(t, [], 0)).toMatchObject({ ratio: MIN_RATIO });
    expect(setRatio(t, [], 1)).toMatchObject({ ratio: MAX_RATIO });
    expect(setRatio(t, [], 0.42)).toMatchObject({ ratio: 0.42 });
  });

  it('a NaN drag does not destroy the layout', () => {
    // A pointer event during a re-layout can measure a zero-height container.
    const t = splitPane(pane('a'), 'a', 'row', 'b');
    expect(setRatio(t, [], NaN)).toMatchObject({ ratio: 0.5 });
  });

  it('resizes the split the path names, and leaves its siblings alone', () => {
    let t: Tile = splitPane(pane('a'), 'a', 'row', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    const after = setRatio(t, ['b'], 0.25) as Extract<Tile, { kind: 'split' }>;
    expect(after.ratio).toBe(0.5); // the outer split is untouched
    expect(after.b).toMatchObject({ kind: 'split', ratio: 0.25 });
  });

  it('a path that outruns the tree changes nothing', () => {
    const t = pane('a');
    expect(setRatio(t, ['a', 'b'], 0.3)).toEqual(t);
  });
});

describe('a saved layout is reconciled against what is actually live', () => {
  it('drops panes whose session has ended and keeps the rest', () => {
    let t: Tile = splitPane(pane('a'), 'a', 'row', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    const after = retain(t, new Set(['a', 'c']))!;
    expect(paneIds(after)).toEqual(['a', 'c']);
    expect(hasPane(after, 'b')).toBe(false);
  });

  it('a layout of only-dead panes is no layout at all', () => {
    const t = splitPane(pane('a'), 'a', 'row', 'b');
    expect(retain(t, new Set<string>())).toBeNull();
  });

  it('keeps the tree untouched when everything is still live', () => {
    const t = splitPane(pane('a'), 'a', 'row', 'b');
    expect(retain(t, new Set(['a', 'b']))).toEqual(t);
  });
});

describe('geometry is derived, so the panes can stay put in the DOM', () => {
  it('one pane fills the container', () => {
    const { rects, dividers } = geometry(pane('a'));
    expect(rects).toEqual([{ id: 'a', left: 0, top: 0, width: 100, height: 100 }]);
    expect(dividers).toEqual([]);
  });

  it('a row splits the width and leaves the height alone', () => {
    const { rects, dividers } = geometry(setRatio(splitPane(pane('a'), 'a', 'row', 'b'), [], 0.25));
    expect(rects).toEqual([
      { id: 'a', left: 0, top: 0, width: 25, height: 100 },
      { id: 'b', left: 25, top: 0, width: 75, height: 100 },
    ]);
    expect(dividers).toHaveLength(1);
    expect(dividers[0]).toMatchObject({ dir: 'row', left: 25, path: [] });
  });

  it('a col splits the height', () => {
    const { rects } = geometry(setRatio(splitPane(pane('a'), 'a', 'col', 'b'), [], 0.4));
    expect(rects).toEqual([
      { id: 'a', left: 0, top: 0, width: 100, height: 40 },
      { id: 'b', left: 0, top: 40, width: 100, height: 60 },
    ]);
  });

  it('every pane gets a box, and the boxes tile the container exactly', () => {
    let t: Tile = splitPane(pane('a'), 'a', 'row', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    t = splitPane(t, 'c', 'row', 'd');
    const { rects, dividers } = geometry(t);
    expect(rects.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    // No gaps and no overlap: the areas sum to the whole.
    const area = rects.reduce((s, r) => s + r.width * r.height, 0);
    expect(Math.round(area)).toBe(100 * 100);
    // One divider per split.
    expect(dividers).toHaveLength(3);
  });

  it('a divider names the split it resizes', () => {
    let t: Tile = splitPane(pane('a'), 'a', 'row', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    const { dividers } = geometry(t);
    const inner = dividers.find((d) => d.dir === 'col')!;
    // Dragging it must resize the INNER split, not the root.
    const after = setRatio(t, inner.path, 0.2) as Extract<Tile, { kind: 'split' }>;
    expect(after.ratio).toBe(0.5);
    expect(after.b).toMatchObject({ ratio: 0.2 });
  });
});

describe('the DOM order is this browser’s, not the server’s', () => {
  it('keeps what it had and appends what is new', () => {
    expect(stableOrder(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('IGNORES a reorder — which is the whole point', () => {
    // The control plane sorts sessions by recency, so this array really does
    // reorder in normal use. Following it would move an iframe among its
    // siblings and remount every terminal on the page.
    const prev = ['a', 'b', 'c'];
    expect(stableOrder(prev, ['c', 'b', 'a'])).toBe(prev);
    expect(stableOrder(prev, ['b', 'a', 'c'])).toBe(prev);
  });

  it('keeps a departed id in place rather than closing the gap', () => {
    // Removing it would shift every later sibling and remount their frames. The
    // renderer skips an id with no rect; the ORDER does not need to know.
    expect(stableOrder(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns the SAME array when nothing is new, so React sees no change', () => {
    const prev = ['a', 'b'];
    expect(stableOrder(prev, ['a', 'b'])).toBe(prev);
    expect(stableOrder(prev, [])).toBe(prev);
  });
});

describe('a phone pages instead of tiling side by side', () => {
  it('one pane is one page', () => {
    const g = pageGeometry(pane('a'), 2);
    expect(g.pages).toBe(1);
    expect(g.rects).toEqual([{ id: 'a', left: 0, top: 0, width: 100, height: 100 }]);
  });

  it('a ROW split becomes two pages — 390px cannot hold two terminals', () => {
    const g = pageGeometry(splitPane(pane('a'), 'a', 'row', 'b'), 2);
    expect(g.pages).toBe(2);
    expect(g.page).toEqual({ a: 0, b: 1 });
    expect(g.rects.find((r) => r.id === 'b')!.left).toBe(100); // the second page
    expect(g.rects.every((r) => r.width === 100)).toBe(true);  // each fills its page
  });

  it('a COL split STAYS stacked — height is what a phone has', () => {
    const g = pageGeometry(setRatio(splitPane(pane('a'), 'a', 'col', 'b'), [], 0.4), 2);
    expect(g.pages).toBe(1);
    expect(g.rects).toEqual([
      { id: 'a', left: 0, top: 0, width: 100, height: 40 },
      { id: 'b', left: 0, top: 40, width: 100, height: 60 },
    ]);
    expect(g.dividers).toHaveLength(1); // and it can still be dragged
  });

  it('a stack deeper than the page allows spills to the next page', () => {
    let t: Tile = splitPane(pane('a'), 'a', 'col', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    expect(pageGeometry(t, 3).pages).toBe(1);  // room for three
    expect(pageGeometry(t, 2).pages).toBe(2);  // room for two: the third spills
    expect(pageGeometry(t, 1).pages).toBe(3);  // room for one: all separate
  });

  it('every pane lands on exactly one page, and fills its page width', () => {
    let t: Tile = splitPane(pane('a'), 'a', 'row', 'b');
    t = splitPane(t, 'b', 'col', 'c');
    t = splitPane(t, 'c', 'row', 'd');
    const g = pageGeometry(t, 2);
    expect(Object.keys(g.page).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(g.rects).toHaveLength(4);
    for (const r of g.rects) {
      expect(r.width).toBe(100);
      expect(r.left % 100).toBe(0); // page-aligned
      expect(g.page[r.id]).toBe(r.left / 100);
    }
  });

  it('the stack count comes from the room, not from a number someone picked', () => {
    expect(stackFor(670)).toBe(2);  // 390x844 portrait
    expect(stackFor(254)).toBe(1);  // landscape: one, not three slivers
    expect(stackFor(900)).toBe(3);  // a tablet
    expect(stackFor(0)).toBe(1);    // never zero
  });
});
