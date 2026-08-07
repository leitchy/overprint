/**
 * Offscreen Canvas renderer for IOF Control Description Sheets.
 *
 * Draws the standard 8-column IOF description grid onto an HTMLCanvasElement
 * that can be used as a Konva.Image source. Symbols are rasterized from SVG
 * via Image + blob URL with module-level caching.
 *
 * Layout mirrors the PDF renderer (pdf-description-sheet.ts):
 *   Row 1:  Course name (header, spans all columns)
 *   Row 2:  Secondary title (optional, spans all columns)
 *   Row 3:  Info row — length + climb (spans all columns)
 *   Row 4+: One row per CourseControl
 *
 * Length/climb formatting is shared with the PDF renderers via desc-rows.ts.
 */

import type { Control, Course } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { buildDescRows, type DescRow } from '@/core/descriptions/desc-rows';
import { sortControlsByCode } from '@/core/geometry/course-utils';
import { getSymbolSvg, getSymbolName, getSymbolText } from '@/core/iof/symbol-db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DescriptionAppearance = 'symbols' | 'text' | 'symbolsAndText';

// ---------------------------------------------------------------------------
// Module-level symbol raster cache
// ---------------------------------------------------------------------------

/** Cache: `${symbolId}:${sizePx}` → ImageBitmap or HTMLCanvasElement */
const symbolRasterCache = new Map<string, HTMLCanvasElement>();

/**
 * Rasterize an SVG symbol to an offscreen canvas of the given size.
 * Returns null if the symbol has no SVG. Caches results.
 */
async function rasterizeSymbol(
  symbolId: string,
  sizePx: number,
): Promise<HTMLCanvasElement | null> {
  const cacheKey = `${symbolId}:${sizePx}`;
  const cached = symbolRasterCache.get(cacheKey);
  if (cached) return cached;

  const svgString = getSymbolSvg(symbolId);
  if (!svgString) return null;

  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, sizePx, sizePx);
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to rasterize symbol ${symbolId}`));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  symbolRasterCache.set(cacheKey, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

const BORDER_COLOR = '#000000';
const HEADER_BG = '#F3E8FF'; // Light violet tint for header
const WHITE = '#FFFFFF';
const GRAY_400 = '#9CA3AF';
const TEXT_COLOR = '#1F2937';

interface GridLayout {
  /** Number of grid columns (8 for symbols/text, 9 for symbolsAndText) */
  numCols: number;
  /** Cell size in pixels (square) */
  cellSize: number;
  /** Total grid width in pixels */
  gridWidth: number;
  /** Number of rows (header + optional secondary + info + column headers + controls) */
  numRows: number;
  /** Total grid height in pixels */
  gridHeight: number;
  /** Whether to show text column */
  hasTextColumn: boolean;
  /** Width of the text column (last column, wider than symbol columns) */
  textColWidth: number;
}

export function computeGridLayout(
  course: Course,
  widthPx: number,
  appearance: DescriptionAppearance,
): GridLayout {
  const hasTextColumn = appearance === 'symbolsAndText';
  // For symbolsAndText: 8 standard columns + 1 wider text column
  const numCols = hasTextColumn ? 8 : 8;

  // Calculate cell size from available width
  // For symbolsAndText, the text column takes extra space (~3.5x symbol column)
  const textColMultiplier = hasTextColumn ? 4.5 : 0;
  const effectiveCols = 8 + textColMultiplier;
  const cellSize = Math.floor(widthPx / effectiveCols);
  const textColWidth = hasTextColumn ? Math.floor(cellSize * textColMultiplier) : 0;
  const gridWidth = cellSize * 8 + textColWidth;

  // Count rows (mirrors buildDescRows: title, optional secondary, split-info,
  // start/finish/exchange directives, and one row per control).
  let numRows = 1; // primary header
  if (course.settings.secondaryTitle) numRows += 1;
  numRows += 1; // split-info row
  if (course.controls.some((cc) => cc.type === 'start')) numRows += 1;
  if (course.controls.some((cc) => cc.type === 'finish')) numRows += 1;
  numRows += course.controls.filter((cc) => cc.type === 'mapExchange' || cc.type === 'mapFlip').length;
  numRows += Math.max(course.controls.length, 1); // control rows (min 1 for empty state)

  const gridHeight = numRows * cellSize;

  return { numCols, cellSize, gridWidth, gridHeight, numRows, hasTextColumn, textColWidth };
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  opts: { bold?: boolean; color?: string; align?: 'center' | 'left' } = {},
) {
  const { bold = false, color = TEXT_COLOR, align = 'center' } = opts;
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;

  const textX = align === 'center' ? x + width / 2 : x + fontSize * 0.3;
  const textY = y + height / 2;

  // Clip to cell
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillText(text, textX, textY);
  ctx.restore();
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { bg?: string } = {},
) {
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.fillRect(x, y, width, height);
  }
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

async function drawSymbolCell(
  ctx: CanvasRenderingContext2D,
  symbolId: string | undefined,
  x: number,
  y: number,
  size: number,
  lang: string,
  mode: 'symbol' | 'text',
) {
  if (!symbolId) return;

  if (mode === 'text') {
    const name = getSymbolName(symbolId, lang);
    const fontSize = Math.max(6, size * 0.35);
    drawCenteredText(ctx, name, x, y, size, size, fontSize, { color: TEXT_COLOR });
    return;
  }

  // Symbol mode: try SVG raster, fallback to text
  const rasterSize = Math.max(16, Math.round(size * 2)); // 2x for retina-quality
  const raster = await rasterizeSymbol(symbolId, rasterSize);
  if (raster) {
    const padding = size * 0.08;
    ctx.drawImage(raster, x + padding, y + padding, size - padding * 2, size - padding * 2);
  } else {
    // Fallback: render symbol name as text
    const name = getSymbolName(symbolId, lang);
    const fontSize = Math.max(6, size * 0.3);
    drawCenteredText(ctx, name, x, y, size, size, fontSize, { color: GRAY_400 });
  }
}

// ---------------------------------------------------------------------------
// Text wrapping & font fitting
// ---------------------------------------------------------------------------

/** Break text into lines that fit within maxWidth. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  bold = false,
): string[] {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px sans-serif`;
  const words = text.split(/\s+/);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let currentLine = words[0]!;

  for (let i = 1; i < words.length; i++) {
    const testLine = `${currentLine} ${words[i]}`;
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i]!;
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}

/** Draw text that word-wraps within the cell, vertically centered. */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  opts: { bold?: boolean; color?: string; align?: 'center' | 'left' } = {},
) {
  const { bold = false, color = TEXT_COLOR, align = 'left' } = opts;
  const padding = fontSize * 0.4;
  const lineHeight = fontSize * 1.3;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;

  const lines = wrapText(ctx, text, width - padding * 2, fontSize, bold);
  const totalTextHeight = lines.length * lineHeight;
  const startY = y + Math.max(padding, (height - totalTextHeight) / 2);

  for (let i = 0; i < lines.length; i++) {
    const textX = align === 'center' ? x + width / 2 : x + padding;
    ctx.fillText(lines[i]!, textX, startY + i * lineHeight);
  }

  ctx.restore();
}

/** Shrink font until text fits within maxWidth, down to minSize. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  idealSize: number,
  minSize: number,
  bold = false,
): number {
  for (let size = idealSize; size >= minSize; size -= 1) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

/** Measure the height a text column row needs to fit wrapped text. */
function measureTextRowHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  textColWidth: number,
  cellSize: number,
): number {
  const fontSize = Math.max(7, cellSize * 0.35);
  const padding = fontSize * 0.4;
  const lines = wrapText(ctx, text, textColWidth - padding * 2, fontSize);
  const textH = lines.length * fontSize * 1.3 + padding * 2;
  return Math.max(cellSize, Math.ceil(textH));
}

// ---------------------------------------------------------------------------
// Text composition
// ---------------------------------------------------------------------------

/**
 * Compose a human-readable text description from columns C-H.
 *
 * IOF symbol texts use `{0}` as a placeholder for the column D feature name
 * (e.g. "N {0}" + "Knoll" → "N Knoll", "shallow {0}" + "depression" → "shallow depression").
 * This function substitutes the placeholders and avoids duplicating the feature name.
 */
function composeDescriptionText(
  descCols: (string | undefined)[],
  lang: string,
): string {
  // descCols order: [C, D, E, F, G, H]
  const featureText = descCols[1] ? getSymbolText(descCols[1], lang) : '';
  let featureUsed = false;

  const parts: string[] = [];
  for (let i = 0; i < descCols.length; i++) {
    const symId = descCols[i];
    if (!symId) continue;

    // Column D (index 1) — skip if already substituted via {0}
    if (i === 1) {
      if (!featureUsed) parts.push(featureText);
      continue;
    }

    let text = getSymbolText(symId, lang);
    if (text.includes('{0}') && featureText) {
      text = text.replace('{0}', featureText);
      featureUsed = true;
    }
    // Strip any remaining unreplaced placeholders
    text = text.replace(/\{[0-9]+\}/g, '').trim();
    if (text) parts.push(text);
  }

  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

/**
 * Render the IOF control description sheet for a course onto an offscreen canvas.
 *
 * Two-pass approach:
 *   1. Measure row heights (text wrapping may increase height of some rows)
 *   2. Render with the computed per-row heights
 *
 * @returns An HTMLCanvasElement sized to the grid's natural dimensions at the given width.
 *          The height is determined by the content (not the full box height).
 */
export interface CanvasDescOptions {
  /** Title for the top header row (defaults to the course name). */
  eventName?: string;
  /** All-controls box: split-info shows a count, no per-course length. */
  isAllControls?: boolean;
  /** Multi-column: non-first columns omit the title / split-info / start rows. */
  hideHeaders?: boolean;
}

export async function renderDescriptionToCanvas(
  course: Course,
  controls: Record<ControlId, Control>,
  mapScale: number,
  mapDpi: number,
  widthPx: number,
  appearance: DescriptionAppearance,
  lang = 'en',
  opts: CanvasDescOptions = {},
): Promise<HTMLCanvasElement> {
  const hasTextColumn = appearance === 'symbolsAndText';
  const isTextMode = appearance === 'text';
  const symbolMode: 'symbol' | 'text' = isTextMode ? 'text' : 'symbol';

  const textColMultiplier = hasTextColumn ? 4.5 : 0;
  const effectiveCols = 8 + textColMultiplier;
  const cellSize = Math.floor(widthPx / effectiveCols);
  const textColWidth = hasTextColumn ? Math.floor(cellSize * textColMultiplier) : 0;
  const gridWidth = cellSize * 8 + textColWidth;
  const totalWidth = gridWidth;

  // --- Pass 1: compute per-row heights ---
  // Temp canvas for text measurement
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = 1;
  tmpCanvas.height = 1;
  const tmpCtx = tmpCanvas.getContext('2d')!;

  const isScore = course.courseType === 'score';

  // Canonical rows shared with the PDF renderers. Score courses are code-sorted.
  const orderedCourse: Course = isScore
    ? { ...course, controls: sortControlsByCode(course.controls, controls) }
    : course;
  const { headerRows, bodyRows } = buildDescRows(orderedCourse, controls, {
    eventName: opts.eventName ?? course.name,
    scale: mapScale,
    dpi: mapDpi,
    isAllControls: opts.isAllControls,
    isScore,
    headerFontSize: Math.max(8, cellSize * 0.55),
  });
  // Non-first columns of a multi-column box omit the title / split-info / start rows.
  const descRows: DescRow[] = opts.hideHeaders ? bodyRows : [...headerRows, ...bodyRows];

  // Render-row list with per-row heights (control rows grow in text mode).
  // A null row is the empty-state placeholder.
  const rows: { row: DescRow | null; height: number }[] = [];
  for (const r of descRows) {
    let rowHeight = cellSize;
    if (r.kind === 'control' && hasTextColumn) {
      const ctrl = controls[r.cc.controlId as ControlId];
      if (ctrl) {
        const d = ctrl.description;
        const composedText = composeDescriptionText(
          [d.columnC, d.columnD, d.columnE, d.columnF, d.columnG, d.columnH],
          lang,
        );
        if (composedText) rowHeight = measureTextRowHeight(tmpCtx, composedText, textColWidth, cellSize);
      }
    }
    rows.push({ row: r, height: rowHeight });
  }
  if (course.controls.length === 0 && !opts.hideHeaders) {
    rows.push({ row: null, height: cellSize });
  }

  const gridHeight = rows.reduce((sum, r) => sum + r.height, 0);

  // --- Pass 2: render ---
  const canvas = document.createElement('canvas');
  canvas.width = gridWidth;
  canvas.height = gridHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, gridWidth, gridHeight);

  let currentY = 0;
  let headerCount = 0;

  // Directive symbol (start triangle / finish double-circle / map-exchange arrow).
  function drawDirectiveSymbol(c: CanvasRenderingContext2D, symbolType: string, cx: number, cy: number, s: number): void {
    c.strokeStyle = TEXT_COLOR;
    c.lineWidth = Math.max(1, cellSize * 0.05);
    if (symbolType === 'start') {
      c.beginPath();
      c.moveTo(cx - s * 0.866, cy - s);
      c.lineTo(cx + s * 0.866, cy);
      c.lineTo(cx - s * 0.866, cy + s);
      c.closePath();
      c.stroke();
    } else if (symbolType === 'finish') {
      c.beginPath(); c.arc(cx, cy, s, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx, cy, s * 0.7, 0, Math.PI * 2); c.stroke();
    } else if (symbolType === 'exchange') {
      c.beginPath();
      c.moveTo(cx - s, cy); c.lineTo(cx + s, cy);
      c.moveTo(cx + s * 0.5, cy - s * 0.5); c.lineTo(cx + s, cy);
      c.moveTo(cx + s * 0.5, cy + s * 0.5); c.lineTo(cx + s, cy);
      c.stroke();
    }
  }

  for (const { row, height: rh } of rows) {
    // Empty-state placeholder row.
    if (row === null) {
      drawCell(ctx, 0, currentY, totalWidth, rh);
      drawCenteredText(ctx, 'No controls yet', 0, currentY, totalWidth, rh, Math.max(7, cellSize * 0.35), { color: GRAY_400 });
      currentY += rh;
      continue;
    }

    switch (row.kind) {
      case 'header': {
        const isPrimary = headerCount === 0;
        headerCount += 1;
        drawCell(ctx, 0, currentY, totalWidth, rh, isPrimary ? { bg: HEADER_BG } : {});
        const ideal = isPrimary ? Math.max(8, cellSize * 0.55) : Math.max(7, cellSize * 0.45);
        const size = fitFontSize(ctx, row.text, totalWidth * 0.9, ideal, Math.max(6, cellSize * 0.3), isPrimary);
        drawCenteredText(ctx, row.text, 0, currentY, totalWidth, rh, size, { bold: isPrimary });
        break;
      }

      case 'splitInfo': {
        const n = row.sections.length;
        const widths = n === 3
          ? [totalWidth * 3 / 8, totalWidth * 3 / 8, totalWidth * 2 / 8]
          : [totalWidth / 2, totalWidth / 2];
        let x = 0;
        const fs = Math.max(7, cellSize * 0.42);
        for (let i = 0; i < n; i++) {
          const w = widths[i] ?? totalWidth / n;
          drawCell(ctx, x, currentY, w, rh);
          drawCenteredText(ctx, row.sections[i]!, x, currentY, w, rh, fs);
          x += w;
        }
        break;
      }

      case 'directive': {
        const leftW = cellSize * 3;
        drawCell(ctx, 0, currentY, leftW, rh);
        drawCell(ctx, leftW, currentY, totalWidth - leftW, rh);
        drawDirectiveSymbol(ctx, row.leftSymbol, leftW / 2, currentY + rh / 2, cellSize * 0.3);
        if (row.distanceText) {
          drawCenteredText(ctx, row.distanceText, leftW, currentY, totalWidth - leftW, rh, Math.max(7, cellSize * 0.4));
        }
        break;
      }

      case 'control': {
        const cc = row.cc;
        const ctrl: Control | undefined = controls[cc.controlId as ControlId];
        if (!ctrl) {
          for (let col = 0; col < 8; col++) drawCell(ctx, col * cellSize, currentY, cellSize, rh);
          if (hasTextColumn) drawCell(ctx, 8 * cellSize, currentY, textColWidth, rh);
          break;
        }

        const isStart = cc.type === 'start';
        const isFinish = cc.type === 'finish';

        // Column A: score (score courses) or sequence number (from the shared builder)
        drawCell(ctx, 0, currentY, cellSize, rh);
        const colAText = isScore
          ? (cc.score != null ? String(cc.score) : null)
          : (row.seqNumber != null ? String(row.seqNumber) : null);
        if (colAText) {
          drawCenteredText(ctx, colAText, 0, currentY, cellSize, rh, Math.max(6, cellSize * 0.4), { color: GRAY_400 });
        }

        // Column B: control code
        drawCell(ctx, cellSize, currentY, cellSize, rh);
        if (!isStart && !isFinish) {
          drawCenteredText(ctx, String(ctrl.code), cellSize, currentY, cellSize, rh, Math.max(6, cellSize * 0.4));
        }

        // Columns C-H: description symbols (vertically centered when row is taller)
        const desc = ctrl.description;
        const descCols = [desc.columnC, desc.columnD, desc.columnE, desc.columnF, desc.columnG, desc.columnH];
        const symbolYOffset = (rh - cellSize) / 2;

        for (let i = 0; i < 6; i++) {
          const colX = (i + 2) * cellSize;
          drawCell(ctx, colX, currentY, cellSize, rh);
          if (i === 3 && desc.columnFText) {
            drawCenteredText(ctx, desc.columnFText, colX, currentY, cellSize, rh, Math.max(6, cellSize * 0.34));
          } else {
            await drawSymbolCell(ctx, descCols[i], colX, currentY + symbolYOffset, cellSize, lang, symbolMode);
          }
        }

        // Text column (symbolsAndText mode)
        if (hasTextColumn) {
          const textColX = 8 * cellSize;
          drawCell(ctx, textColX, currentY, textColWidth, rh);
          const composedText = composeDescriptionText(descCols, lang);
          if (composedText) {
            drawWrappedText(
              ctx, composedText, textColX, currentY, textColWidth, rh, Math.max(7, cellSize * 0.35),
              { align: 'left', color: TEXT_COLOR },
            );
          }
        }
        break;
      }
    }

    currentY += rh;
  }

  return canvas;
}
