import { test, expect } from '@playwright/test';

/**
 * Dark mode is screen-only theming. This verifies the toggle actually flips the
 * document + repaints chrome, and that the map-fade renders without breaking the
 * canvas. (Export-safety is asserted at the unit level in export-theme-safety.)
 */

test('theme toggle flips the document and repaints chrome dark', async ({ page }) => {
  await page.goto('/');
  // Default (no stored pref) resolves to light on the CI runner.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

  // Open Preferences (View menu) and choose Dark.
  await page.getByRole('button', { name: 'View', exact: false }).first().click();
  await page.getByRole('button', { name: /Preferences/i }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('dark');

  // The app shell background is now a dark surround (near-black), not light.
  const shellBg = await page.evaluate(() => {
    const el = document.querySelector('.bg-canvas-surround');
    return el ? getComputedStyle(el).backgroundColor : '';
  });
  // rgb(16, 18, 23) = #101217
  expect(shellBg.replace(/\s/g, '')).toBe('rgb(16,18,23)');
});

test('map fade renders a screen-only scrim over a loaded map', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try a Sample/i }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });

  // Drag the Map fade slider toward "darker".
  const slider = page.getByRole('slider', { name: /Map fade/i });
  await slider.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '0.6');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // The readout reflects the fade and the canvas keeps rendering (no crash from
  // mounting the extra screen-only scrim layer).
  await expect(page.getByText('+60%')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('landing empty state is dark when dark theme is stored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('overprint-theme', 'dark'));
  await page.goto('/');
  // No-flash script applied dark before React mounted.
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.getByRole('button', { name: /Try a Sample/i })).toBeVisible();
});
