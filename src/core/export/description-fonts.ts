/**
 * Roboto font embedding for PDF control descriptions (C8).
 *
 * PurplePen renders control descriptions in Roboto (headers) and Roboto
 * Condensed (grid cell text — the condensed face fits narrow 7mm cells).
 * We bundle the full Apache-2.0 Roboto TTFs and embed them via @pdf-lib/fontkit
 * with `subset: true`, so each exported PDF carries only its used glyphs
 * (~a few KB/face) while all scripts (Latin+ext, Cyrillic, Greek) stay available.
 * (Note: pre-subsetting the source TTF corrupts pdf-lib's own subsetter — the
 * source must be the full font.)
 *
 * Graceful fallback: if fontkit registration, asset fetch, or embedding
 * fails (offline, jsdom test environment, …) all four faces fall back to
 * the built-in Helvetica / Helvetica-Bold so export never breaks.
 */
import fontkit from '@pdf-lib/fontkit';
import { StandardFonts } from 'pdf-lib';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import robotoRegularUrl from '@/assets/fonts/Roboto-Regular.ttf?url';
import robotoBoldUrl from '@/assets/fonts/Roboto-Bold.ttf?url';
import robotoCondensedRegularUrl from '@/assets/fonts/RobotoCondensed-Regular.ttf?url';
import robotoCondensedBoldUrl from '@/assets/fonts/RobotoCondensed-Bold.ttf?url';

/** The four description faces, embedded in a specific PDFDocument. */
export interface DescriptionFonts {
  /** Roboto Regular — split-info rows, secondary header rows. */
  regular: PDFFont;
  /** Roboto Bold — primary header (event/course name) rows. */
  bold: PDFFont;
  /** Roboto Condensed — 8-column grid cell text, distances, text descriptions. */
  condensed: PDFFont;
  /** Roboto Condensed Bold — reserved for emphasised cell text. */
  condensedBold: PDFFont;
}

async function fetchFontBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed (${res.status}): ${url}`);
  return res.arrayBuffer();
}

/**
 * Register fontkit on the document and embed the four Roboto faces with
 * glyph subsetting. Never throws — on any failure all four faces are the
 * standard Helvetica / Helvetica-Bold instead.
 */
export async function embedDescriptionFonts(pdfDoc: PDFDocument): Promise<DescriptionFonts> {
  try {
    pdfDoc.registerFontkit(fontkit);
    const [regular, bold, condensed, condensedBold] = await Promise.all(
      [robotoRegularUrl, robotoBoldUrl, robotoCondensedRegularUrl, robotoCondensedBoldUrl].map(
        async (url) => pdfDoc.embedFont(await fetchFontBytes(url), { subset: true }),
      ),
    );
    return { regular: regular!, bold: bold!, condensed: condensed!, condensedBold: condensedBold! };
  } catch {
    // Fallback: built-in fonts (no fontkit needed). Keeps export working in
    // test environments and offline sessions.
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    return { regular, bold, condensed: regular, condensedBold: bold };
  }
}
