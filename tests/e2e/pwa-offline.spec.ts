import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end proof that Overprint works with NO network once loaded.
 *
 * The service worker only takes control of a page on the navigation *after* it
 * activates (we register in `prompt` mode, so there is no clientsClaim). The
 * flow therefore is: load (installs + activates the SW, precaches everything) →
 * reload (page is now SW-controlled) → go offline → reload (served from cache).
 */

/** Count entries across all Cache Storage caches. */
async function precacheSize(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) return -1;
    let count = 0;
    for (const n of await caches.keys()) {
      count += (await (await caches.open(n)).keys()).length;
    }
    return count;
  });
}

test('app shell + sample map work fully offline', async ({ page, context }) => {
  // 1. First load — installs and activates the SW, precaches the shell.
  //    (expect.poll awaits the async probe on each tick; waitForFunction does not.)
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Try a Sample/i })).toBeVisible();
  await expect
    .poll(() => precacheSize(page), { timeout: 30_000, message: 'shell precached' })
    .toBeGreaterThan(40);

  // 2. Reload so the SW controls this page.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 15_000,
      message: 'page is SW-controlled',
    })
    .toBe(true);

  // 3. Cut the network entirely.
  await context.setOffline(true);

  // 4. Reload with no network — must be served from the SW cache.
  await page.reload();
  await expect(page.getByRole('button', { name: /Try a Sample/i })).toBeVisible();

  // Critical offline assets resolve from cache (samples, fonts, pdf.js worker).
  const assets = await page.evaluate(async () => {
    const keys = new Set<string>();
    for (const n of await caches.keys()) {
      for (const req of await (await caches.open(n)).keys()) {
        keys.add(new URL(req.url).pathname);
      }
    }
    const sample = await fetch('/samples/sample-event.overprint').then((r) => r.ok).catch(() => false);
    const map = await fetch('/samples/sample-map.ocd').then((r) => r.ok).catch(() => false);
    return {
      sampleOk: sample,
      mapOk: map,
      hasFont: [...keys].some((p) => p.endsWith('.ttf')),
      hasWorker: [...keys].some((p) => p.includes('pdf.worker')),
    };
  });
  expect(assets.sampleOk, 'sample event served offline').toBe(true);
  expect(assets.mapOk, 'sample OCAD map served offline').toBe(true);
  expect(assets.hasFont, 'PDF fonts precached').toBe(true);
  expect(assets.hasWorker, 'pdf.js worker precached').toBe(true);

  // 5. End-to-end: load the sample offline and confirm the map canvas renders.
  await page.getByRole('button', { name: /Try a Sample/i }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  // The loaded sample is a 13-control course — its description sheet proves the
  // OCAD map parsed and the course rendered, all with the network still cut.
  await expect(page.getByText(/13 controls/i)).toBeVisible({ timeout: 15_000 });
});

test('service worker and manifest are served with the app', async ({ page }) => {
  await page.goto('/');
  const swOk = await page.evaluate(() => fetch('/sw.js').then((r) => r.ok));
  const manifestOk = await page.evaluate(() =>
    fetch('/manifest.webmanifest').then((r) => r.ok),
  );
  expect(swOk).toBe(true);
  expect(manifestOk).toBe(true);
});
