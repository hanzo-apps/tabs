// What a screen owes a reader, measured in the browser.
//
// This runs inside the page (page.evaluate), so it is written as one self-contained
// function per reading: nothing here can import, and a helper defined outside the
// returned closure would not survive serialisation.

export type Target = { text: string; w: number; h: number };
export type Contrast = { text: string; px: number; ratio: number; need: number; fg: string; bg: string };
export type Small = { text: string; px: number };

export type Audit = {
  scrollWidth: number;
  innerWidth: number;
  shortTargets: Target[];
  contrastFailures: Contrast[];
  smallProse: Small[];
};

/** The minimum a thumb can reliably land on, in CSS px. */
export const REACH = 44;

/** Below this, a run of prose is too small to read comfortably. Labels may be smaller. */
export const PROSE_FLOOR = 12;

/** How many words make a run of text prose rather than a label. */
const PROSE_WORDS = 8;

/**
 * audit is evaluated in the page and returns everything the assertions need in
 * one round trip.
 *
 * The contrast reading resolves each element's OWN painted background by walking
 * up until it finds one, rather than assuming the body's. Assuming the body's is
 * wrong in the one direction that matters: dark text on a light button reads as
 * 1:1 against a dark page and reports a failure that is not there. That false
 * positive is the reason this lives in a named function instead of being written
 * out at each call site.
 */
export function audit(): Audit {
  const luminance = (color: string) => {
    const parts = (color.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
    const [r, g, b] = parts.slice(0, 3).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const ratio = (fg: string, bg: string) => {
    const a = luminance(fg) + 0.05;
    const b = luminance(bg) + 0.05;
    return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
  };

  // The colour a pixel actually sits on: the nearest ancestor that paints one.
  const painted = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return 'rgb(255, 255, 255)';
  };

  const shortTargets: Target[] = [];
  const contrastFailures: Contrast[] = [];
  const smallProse: Small[] = [];

  for (const el of document.querySelectorAll('a, button, [role="button"], input, select, textarea')) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue; // not rendered; nothing to hit
    if (box.height < 44) {
      shortTargets.push({
        text: (el.textContent ?? '').trim().slice(0, 40) || el.tagName.toLowerCase(),
        w: Math.round(box.width),
        h: Math.round(box.height),
      });
    }
  }

  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue; // only the element that owns the text
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

    const px = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    // WCAG's "large text" threshold, where 3:1 is the bar instead of 4.5:1.
    const large = px >= 18.66 || (px >= 14 && bold);
    const need = large ? 3 : 4.5;
    const bg = painted(el);
    const got = ratio(style.color, bg);
    if (got < need) {
      contrastFailures.push({ text: text.slice(0, 40), px, ratio: got, need, fg: style.color, bg });
    }

    // A label may be small. A sentence may not.
    if (px < 12 && text.split(/\s+/).length >= 8) {
      smallProse.push({ text: text.slice(0, 40), px });
    }
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    shortTargets,
    contrastFailures,
    smallProse,
  };
}
