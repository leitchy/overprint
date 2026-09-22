# Web (Overprint) vs Native (PurplePen) — Limitations

> Context: PurplePen has released a cross-platform beta (macOS + Linux), so the "Windows-only"
> gap is closing. Overprint's case is still the web delivery model (any OS, tablets, phones,
> zero install, instant updates) — but the browser imposes real limits a native binary doesn't.
> This note captures where the browser is genuinely harder, complex, or off-spec.

## Fundamental browser constraints

- **File system access** — no true "open folder / save in place". `showSaveFilePicker` is
  Chrome/Edge-only; Firefox/Safari fall back to downloads. No file-watching, no silent re-save
  of the source file. Working across a folder of maps + events is clunky compared to a desktop
  app with a normal open/save model.
- **Large map files & memory** — a browser tab has a hard memory ceiling. Big OCAD maps or
  high-DPI raster rendering can hit limits a native process wouldn't. Vector re-raster at print
  DPI is memory-hungry.
- **Printing** — no direct control of the print pipeline. We generate a PDF and hand it off;
  we can't drive a printer, ICC colour profiles, or true CMYK spot-colour **separations** the
  way a desktop print path can.
- **Colour fidelity** — the big one. Canvas is sRGB-only, so the on-screen purple is always an
  RGB approximation. True purple **spot colour**, CMYK overprint separations, and knockout/
  trapping for a print shop are beyond canvas. The PDF path emits DeviceCMYK, but screen ≠ print.

## Harder / not attempted

- **Full OCAD editing** — deliberately out of scope (that's OpenOrienteering Mapper's job);
  the trade-off is no round-trip map fixes from within Overprint.
- **Deep OCAD/OMAP rendering edge cases** — native tools have decades of symbol-rendering
  fidelity. Our renderer covers the common cases but has known gaps (area borders, some
  combined/multi-part objects).
- **Offline robustness** — we ship a PWA, but it's inherently more fragile than an installed
  binary: cache/update semantics, storage eviction (notably iOS), and persistence quotas.
- **Performance ceiling** — pan/zoom/render of very complex maps will never match a compiled
  native app.

## Where the web wins (keep in view)

- Zero install; runs on any OS including **tablets and phones**.
- Instant updates (no installer, no version drift).
- Easy sharing; self-contained `.overprint` files.
- **GPS-in-the-field** control placement — a native desktop app doesn't get this for free.
- Modern, responsive UI.

## Net

The cross-platform PurplePen beta narrows the "reach" advantage, but the browser model still
wins on device breadth, field use (GPS), and frictionless updates. The honest weak spots are
**print-shop colour fidelity** (CMYK spot colour / separations) and **heavy-map performance/
memory** — both structural to the browser, not just unfinished work.
