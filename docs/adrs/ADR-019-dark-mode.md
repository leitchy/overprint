# ADR-019: Dark Mode (screen-only, semantic-token theming)

## Status

**Accepted** — implemented 2026-08 (v0.33.0). Phase 7 #2.

## Context

The app was light-only: ~715 hard-coded gray/violet Tailwind utility classes across ~39 files, no
theming infrastructure. We wanted **system / light / dark** so course setters can work comfortably at
night / in a dark room / by preference. Two hard constraints shaped the design:

1. **Screen-only.** Dark mode must never change PDF/OMAP/PNG/JPEG **exports** — those are print
   artifacts. In particular `OVERPRINT_PURPLE = '#BB29BB'` in `constants.ts` is a colour-match
   *sentinel* read by `pdf-course-map.ts`; changing it corrupts exports.
2. **The map is a document, not chrome.** Orienteering maps are designed for white paper; recolouring
   them is wrong. "Dark mode for the canvas" means the **surround**, not the map.

Reviewed by Fable (engineering) + a UI/UX designer (WCAG contrast) + Fable (design taste). Their fixes
are baked into the palette and the map handling.

## Decision

- **Semantic token layer (Tailwind v4).** `src/index.css` registers ~30 semantic colour utilities via
  **`@theme inline`** (required so utilities emit `var(--c-*)` and re-resolve live). Light values on
  `:root` equal the previous literals — so **light mode is pixel-unchanged** — and a
  `:root[data-theme="dark"]` block overrides them (plus `color-scheme`). No `dark:` variants: every
  component uses semantic classes (`bg-surface`, `text-content`, `border-edge`, `bg-accent`, …) that
  flip with one attribute. The dark palette was contrast-corrected (visible surface-elevation ladder,
  functional borders ≥3:1, `faint` ≥4.5:1 as text, saturated accent button + white text).
- **The ~715-site migration is 1:1** to tokens, with judgment cases handled by hand: overlays go on a
  *lighter* surface + border (shadows don't separate on dark); intentionally-dark buttons use a
  `neutral-solid` token that inverts; WYSIWYG print previews (the IOF description sheet, symbol picker)
  and on-map overlay identity colours stay fixed and are allow-listed. A **migration-gate test**
  (`src/theme-migration-gate.test.ts`) forbids raw palette classes outside the allow-list.
- **Theme resolution/application.** `theme: 'system'|'light'|'dark'` lives in `app-settings-store`
  (manual per-key localStorage). `use-theme-effect.ts` resolves `system` via
  `matchMedia('(prefers-color-scheme: dark)')` (reacting to OS + cross-tab changes), writes the
  resolved value to `data-theme`, and syncs `color-scheme` + `<meta name=theme-color>`. A tiny inline
  script in `index.html` applies the theme **before first paint** (no flash); a test asserts it uses
  the same storage key as the store.
- **Map on dark.** OCAD/transparent maps have no background, so a white Konva "paper" `<Rect>` backs
  every map (making it a solid light sheet in any theme — and correctly fixing transparent-OCAD PNG
  export). A screen-only soft drop-shadow gives the sheet a lip against the dark surround.
- **Map fade (bidirectional).** A signed `mapFade` (−1 white … 0 off … +1 dark) drives a screen-only
  Konva scrim placed above the white-outs and below the course overprint (which is solid `normal`
  blend, so the purple stays full strength). Left = fade toward white (PurplePen-style "map intensity"
  design aid); right = darken (night glare). Surfaced as a centre-detent slider in Map Settings.
- **3-way control** in the Preferences modal — a `role=radiogroup` segmented System/Light/Dark control
  with roving tabindex + arrow keys, default **System**.

## Consequences

- **Verified** across light + dark (Playwright): light unchanged; dark chrome + white map paper +
  vivid overprint; map-fade darkens the map while overprint/numbers stay full strength; the Preferences
  segmented control and modal elevation read correctly.
- **Export safety is enforced, not hoped for:** `export-theme-safety.test.ts` pins the purple sentinel,
  asserts no export module imports the theme store, and checks the no-flash key; the map-fade + paper
  shadow are named `screen-only-*` and hidden during image export.
- Adding a colour anywhere now means adding a token (or allow-listing an intentional literal) — the
  gate test makes a missed raw class a red build, since Tailwind v4 keeps its default palette and a
  miss would otherwise look fine in light mode only.
- **Not themed (deliberate):** the IOF description sheet + symbol picker stay white paper; overprint,
  gold selection, and GPS colours are fixed overlay identity.
