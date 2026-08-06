# ADR-014: Description Box Font Parity with PurplePen

## Status

Accepted — documenting known differences for future work.

## Context

Our PDF description boxes use Helvetica (pdf-lib StandardFonts) while PurplePen uses Roboto and Roboto Condensed (Google fonts). This creates visible differences in letter spacing, stroke weight, and overall appearance.

## PurplePen Font Spec

From `PurplePenCore/Appearance.cs`:

| Element | PP Font | PP Style | Our Font |
|---------|---------|----------|----------|
| Title (event name) | Roboto Condensed | Bold | Helvetica |
| Column A (seq number) | Roboto | Bold | Helvetica |
| Column B (control code) | Roboto Condensed | Regular | Helvetica |
| Column F (dimensions) | Roboto | Regular, smaller | Helvetica |
| Directive text | Roboto Condensed | Bold | Helvetica |
| Text descriptions | Roboto Condensed | Regular, smaller | Helvetica |

PP also uses different font sizes per element (63pt base for most, 50pt for column F, 43pt for text descriptions). We use fixed `DESC_HEADER_FONT_SIZE` (9pt) and `DESC_TEXT_FONT_SIZE` (8pt).

## Current Limitation

pdf-lib's `StandardFonts` only supports 14 built-in PDF fonts (Helvetica, Times, Courier, etc.). Embedding custom fonts requires:

1. Loading the font file (TTF/OTF) as bytes
2. Using `pdfDoc.embedFont(fontBytes)` instead of `pdfDoc.embedFont(StandardFonts.Helvetica)`
3. Bundling the font files with the app (increases bundle size ~200KB per font)

## Decision

Keep Helvetica for now. Helvetica is the closest standard match to Roboto — both are sans-serif with similar proportions. The visual difference is minor and acceptable for v1.

## Future Work

To achieve exact PP parity:

1. Bundle Roboto and Roboto Condensed TTF files (or fetch from Google Fonts CDN)
2. Embed via `pdfDoc.embedFont(robotoBytes)`
3. Use per-element font selection (bold title, condensed code column, etc.)
4. Match PP's per-element font sizes (63pt, 50pt, 43pt scaled to cell size)

## Other Known Differences

- **Unicode symbols**: pdf-lib standard fonts can't encode symbols like ▷ ⇒ ○. We draw geometric shapes instead. Embedding a symbol font (or using the IOF SVG symbols) would improve fidelity.
- **Bold variants**: `StandardFonts.HelveticaBold` exists but we don't use it for titles yet. Quick win.
- **Column-specific sizing**: PP uses different font sizes per column (smaller for dimensions in column F). We use uniform sizes.
