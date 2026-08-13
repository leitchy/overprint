import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dark-mode migration gate: neutral/accent colours must go through semantic
 * tokens (bg-surface, text-content, border-edge, bg-accent, …), never raw
 * Tailwind palette classes. Tailwind v4 keeps its default gray/violet palette,
 * so a missed class compiles and *looks fine in light mode* — this test is the
 * only thing that catches it.
 *
 * Intentional exceptions: WYSIWYG print previews and on-map overlay identity
 * colours are deliberately fixed and allow-listed by filename.
 */

// Files permitted to keep raw palette classes (fixed white-paper previews /
// on-map identity colours). Keep this list tight.
const ALLOWLIST = new Set([
  'description-sheet.tsx', // IOF description grid — black on white paper
  'description-cell.tsx',
  'symbol-picker.tsx', // symbol palette — black IOF glyphs on white
  'symbol-icon.tsx',
  'center-reticle.tsx', // on-map GPS reticle identity colours
  'map-canvas.tsx', // svgmap-spike "paper" bg-white + over-map info chips
]);

// Raw neutral/accent shades that should have become tokens (+ bg-white).
const RAW = new RegExp(
  String.raw`\b(bg|text|border|ring|divide|placeholder|decoration|from|via|to|outline|caret|accent)-(gray|slate|zinc|neutral|stone|violet|purple|indigo)-[0-9]|\bbg-white\b`,
);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

describe('theme migration gate', () => {
  it('no raw neutral/accent palette classes outside the allowlist', () => {
    const roots = [join(process.cwd(), 'src/components'), join(process.cwd(), 'src/app')];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const base = file.split('/').pop()!;
        if (ALLOWLIST.has(base)) continue;
        const src = readFileSync(file, 'utf8');
        src.split('\n').forEach((line, i) => {
          if (RAW.test(line)) offenders.push(`${base}:${i + 1}  ${line.trim().slice(0, 80)}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
