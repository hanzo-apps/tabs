import { test, expect } from '@playwright/test';
import { audit, PROSE_FLOOR, REACH, type Audit } from './audit';

// Every screen a visitor can reach without a machine linked. The terminal panes
// need a live machine and a signed-in identity, so they are not here; these two
// are what a stranger sees, and both were wrong until they were measured.
const SCREENS = [
  { path: '/', name: 'front page' },
  { path: '/app/', name: 'sign in' },
];

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test('fits its viewport, and every control is reachable and readable', async ({ page }, info) => {
      await page.goto(screen.path);
      // The measure depends on layout, so wait for it to settle rather than for
      // a network idle that a static export reaches before styles apply.
      await page.waitForLoadState('load');
      await expect(page.locator('body')).toBeVisible();

      const a: Audit = await page.evaluate(audit);
      const where = `${screen.name} at ${info.project.name}`;

      // SOFT, all four of them. A hard expect throws on the first failure, so a
      // short tap target would hide the contrast and the type size behind it and
      // the screen would take one CI run per defect to come clean. An audit is
      // worth having only if it reports everything it found.
      expect
        .soft(
          a.scrollWidth,
          `${where}: scrolls sideways — ${a.scrollWidth}px of content in ${a.innerWidth}px`,
        )
        .toBeLessThanOrEqual(a.innerWidth);

      expect
        .soft(
          a.shortTargets,
          `${where}: ${a.shortTargets.length} control(s) under ${REACH}px tall — ` +
            a.shortTargets.map((t) => `"${t.text}" ${t.w}x${t.h}`).join(', '),
        )
        .toEqual([]);

      expect
        .soft(
          a.contrastFailures,
          `${where}: ${a.contrastFailures.length} colour pair(s) below AA — ` +
            a.contrastFailures.map((c) => `"${c.text}" ${c.ratio}:1 needs ${c.need}:1`).join(', '),
        )
        .toEqual([]);

      expect
        .soft(
          a.smallProse,
          `${where}: prose under ${PROSE_FLOOR}px — ` +
            a.smallProse.map((s) => `"${s.text}" at ${s.px}px`).join(', '),
        )
        .toEqual([]);
    });
  });
}

// The three readings above answer "is anything wrong". This one answers "is the
// instrument still looking", which silence cannot distinguish from the first.
test('the audit sees the page it was pointed at', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  const a: Audit = await page.evaluate(audit);
  expect(a.innerWidth, 'no viewport width; the audit ran against nothing').toBeGreaterThan(0);
  const controls = await page.locator('a, button').count();
  expect(controls, 'the front page has links and buttons; finding none means the walk broke').toBeGreaterThan(3);
});
