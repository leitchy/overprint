/**
 * Relay team-assignment table PDF (E10 Phase 3).
 *
 * A team × leg grid: one row per team, one column per leg (plus a Team column),
 * each cell showing the variation code that team runs on that leg. Reuses the
 * Roboto embedding (`embedDescriptionFonts`) and pdf-lib primitives — NOT the
 * fixed 8-column description-sheet grid — with computed column widths (fit to the
 * printable width) and a paginate-and-repeat-header loop for many teams.
 *
 * Dense typography per house style: 18pt title, 8pt table.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFPage, PDFFont } from 'pdf-lib';
import type { Course, OverprintEvent } from '@/core/models/types';
import { assignRelayTeams } from '@/core/models/relay-assignment';
import { computePageLayout, mmToPdfPoints } from './pdf-page-layout';
import { embedDescriptionFonts } from './description-fonts';
import { sanitizeFilename } from '@/core/files/download';

const TITLE_SIZE = 18;
const SUBTITLE_SIZE = 9;
const CELL_SIZE = 8;
const HEADER_SIZE = 8;
const BORDER = rgb(0, 0, 0);
const TEXT = rgb(0, 0, 0);
const HEADER_FILL = rgb(0.93, 0.93, 0.93);

const CELL_PAD_X = mmToPdfPoints(1.5);
const ROW_HEIGHT = mmToPdfPoints(6);

/** Column natural width = widest of its cell strings (+ padding), min a sane floor. */
function columnWidth(cells: string[], font: PDFFont, size: number): number {
  let max = 0;
  for (const c of cells) max = Math.max(max, font.widthOfTextAtSize(c, size));
  return max + 2 * CELL_PAD_X;
}

/** Draw one bordered, centred cell. */
function drawCell(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  text: string,
  font: PDFFont,
  size: number,
  fill?: ReturnType<typeof rgb>,
): void {
  page.drawRectangle({
    x,
    y: y - ROW_HEIGHT,
    width: w,
    height: ROW_HEIGHT,
    borderColor: BORDER,
    borderWidth: 0.5,
    color: fill,
  });
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: x + (w - tw) / 2,
    y: y - ROW_HEIGHT + (ROW_HEIGHT - size) / 2 + 1,
    size,
    font,
    color: TEXT,
  });
}

export async function generateRelayTablePdf(
  event: OverprintEvent,
  courseIndex = 0,
): Promise<{ blob: Blob; suggestedName: string }> {
  const course: Course | undefined = event.courses[courseIndex];
  if (!course) throw new Error('No course to export');

  const settings = course.relay ?? { firstTeamNumber: 1, teams: 0, legs: 1 };
  const assignment = assignRelayTeams(course, event.controls, settings);
  const legs = settings.legs;

  const pdfDoc = await PDFDocument.create();
  const fonts = await embedDescriptionFonts(pdfDoc);
  const cellFont = fonts.condensed;
  const headerFont = fonts.bold;

  const layout = computePageLayout({ ...event.settings.pageSetup, ...course.settings.pageSetup });
  const { printableWidth, marginLeft, marginTop, marginBottom, pageHeight, pageWidth } = layout;

  // --- Column widths: Team column + one per leg, fit to the printable width. ---
  const headerRow = ['Team', ...Array.from({ length: legs }, (_, l) => `Leg ${l + 1}`)];
  const columns: number[] = headerRow.map((header, col) => {
    const cells = [header, ...assignment.teams.map((t) => (col === 0 ? String(t.teamNumber) : t.legs[col - 1] ?? ''))];
    const font = col === 0 ? headerFont : cellFont;
    return columnWidth(cells, font, Math.max(HEADER_SIZE, CELL_SIZE));
  });
  const naturalWidth = columns.reduce((a, w) => a + w, 0);
  if (naturalWidth > printableWidth) {
    const scale = printableWidth / naturalWidth;
    for (let i = 0; i < columns.length; i++) columns[i]! *= scale;
  }
  const columnX: number[] = [];
  let x = marginLeft;
  for (const w of columns) {
    columnX.push(x);
    x += w;
  }

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - marginTop;

  const drawHeaderRow = () => {
    for (let col = 0; col < headerRow.length; col++) {
      drawCell(page, columnX[col]!, currentY, columns[col]!, headerRow[col]!, headerFont, HEADER_SIZE, HEADER_FILL);
    }
    currentY -= ROW_HEIGHT;
  };

  // Title + subtitle (first page only).
  const title = `${event.settings.mapTitle || event.name || course.name} — Relay`;
  page.drawText(title, { x: marginLeft, y: currentY - TITLE_SIZE, size: TITLE_SIZE, font: headerFont, color: TEXT });
  currentY -= TITLE_SIZE + mmToPdfPoints(2);
  const subtitle = `${course.name} · ${assignment.teams.length} teams × ${legs} legs · ${assignment.totalVariations} variations`;
  page.drawText(subtitle, { x: marginLeft, y: currentY - SUBTITLE_SIZE, size: SUBTITLE_SIZE, font: cellFont, color: TEXT });
  currentY -= SUBTITLE_SIZE + mmToPdfPoints(3);

  drawHeaderRow();

  for (const team of assignment.teams) {
    // Page break — repeat the header on the new page.
    if (currentY - ROW_HEIGHT < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - marginTop;
      drawHeaderRow();
    }
    drawCell(page, columnX[0]!, currentY, columns[0]!, String(team.teamNumber), cellFont, CELL_SIZE);
    for (let l = 0; l < legs; l++) {
      drawCell(page, columnX[l + 1]!, currentY, columns[l + 1]!, team.legs[l] ?? '', cellFont, CELL_SIZE);
    }
    currentY -= ROW_HEIGHT;
  }

  const bytes = await pdfDoc.save();
  const base = sanitizeFilename(event.name || course.name, 'relay');
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    suggestedName: `${base}-relay.pdf`,
  };
}
