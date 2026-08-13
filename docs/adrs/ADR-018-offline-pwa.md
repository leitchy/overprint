# ADR-018: Offline Support via an Installable PWA

## Status

**Accepted** — implemented 2026-08 (v0.32.0). Realises product design principle #4
("offline-capable") and the first Phase 7 item.

## Context

Overprint is a static, backend-free, file-based SPA. Its users are orienteering course
setters who routinely work **in the field, offline** — walking a map area with a phone or
tablet, no signal — while actively editing a course. The app already had everything needed to
run without a server (all logic is client-side; maps and events are local files), but a plain
web page still needs the network to *load*. A closed tab or a dead connection meant a blank
screen.

We wanted:

1. The app shell (JS/CSS/HTML), the sample map/event, the PDF fonts, and the pdf.js worker to
   keep working with **no network at all**, once loaded.
2. An **installable** app (home-screen icon, standalone window) — on iOS, installation is also
   the only reliable way to stop Safari evicting cached data after ~7 days of non-use.
3. Updates that are **safe for a field tool**: a freshly-deployed version must never swap in
   mid-session and disrupt someone who is offline halfway through setting a course.

## Decision

Use **`vite-plugin-pwa`** (Workbox `generateSW`) with **`registerType: 'prompt'`**.

- **Precache the whole shell.** `globPatterns` covers `js,css,html,svg,png,ico,woff,woff2,ttf`
  plus `webmanifest` and — explicitly — the sample `overprint`/`ocd` files, so the very first
  offline use works with no prior network round-trip. (Runtime `CacheFirst` was rejected: it
  only populates *after* a successful online fetch, which is exactly the moment a field user
  doesn't have.) `navigateFallback: '/index.html'` serves the SPA offline.
- **Prompt, never auto-update.** A new SW is downloaded and precached but sits *waiting*; it
  activates on the next natural launch. We surface a low-pressure banner (`PwaBanner`) rather
  than forcing a reload. `applyUpdate()` **flushes the auto-save draft synchronously before
  reloading**, because the debounced autosave may not have fired and — per ADR-013 — the draft
  deliberately excludes the large map image, so a reload requires re-loading the map. When an
  event is open the banner says so; when nothing is loaded, reloading is offered freely.
- **Install + escape hatch.** We capture `beforeinstallprompt` and expose "Install App" in the
  File menu (Chromium). A "Check for Updates" item calls `registration.update()` — the escape
  hatch for standalone/iOS, where there is no URL bar to force a refresh. `navigator.storage
  .persist()` is requested on load to resist iOS eviction.
- **CDN headers.** `public/_headers` marks `sw.js`, `manifest.webmanifest`, and `index.html`
  as `no-cache` so a new deploy is picked up promptly and never pinned stale by Cloudflare.

State lives in `src/stores/pwa-store.ts` (registered via the non-React `registerSW` so the
banner and the menu items share one source of truth). UI: `src/components/ui/pwa-banner.tsx`.

## Testing

Two layers, because jsdom has no service worker or Cache Storage:

- **Unit** (`src/stores/pwa-store.test.ts`, Vitest): SW lifecycle callbacks → store state, the
  autosave-flush-before-reload ordering, and install-prompt capture. Mocks `virtual:pwa-register`.
- **E2E offline harness** (`tests/e2e/pwa-offline.spec.ts`, Playwright, `pnpm test:e2e`, own CI
  job): real Chromium against the built `dist` served over plain http (`scripts/serve-dist.mjs` —
  the self-signed `basicSsl` preview blocks SW registration). It loads, waits for the precache,
  reloads to gain SW control, then `context.setOffline(true)` and reloads with the network cut —
  asserting the shell renders, the sample event/map/fonts/pdf.js-worker resolve from cache, and
  clicking **Try a Sample** renders the OCAD map + 13-control course offline. Vitest is scoped to
  `src/**` so it never picks up the e2e spec. (Note: Playwright's `waitForFunction` does not await
  an async predicate's Promise — use `expect.poll` for async probes.)

## Consequences

- **Verified**: with the network cut, a cold reload renders the full app and loads the precached
  sample OCAD map + purple overprint entirely from Cache Storage (Playwright e2e, above).
- Precache is ~6.6 MB (pdf.js worker + Konva + fonts). Acceptable and intentional for a field
  tool; `maximumFileSizeToCacheInBytes` is raised to 5 MB for headroom.
- **Multi-tab (minor)**: `updateSW(true)` reloads the initiating tab; other open tabs keep the
  old controller until closed. Multiple tabs of a course-setter app are rare; not mitigated.
- **Pre-existing bug fixed in passing**: `_headers` previously sent
  `Permissions-Policy: geolocation=()`, which **disabled the shipped GPS control-placement
  feature in production**. Corrected to `geolocation=(self)`.
- Non-lossy update on reload still ultimately depends on the map image not being persisted;
  moving the embedded map to IndexedDB (lifting the localStorage ~5 MB cap) is future work that
  would make update-via-reload fully lossless.
