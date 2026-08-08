import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFDocument, PDFFont } from 'pdf-lib';
import { embedDescriptionFonts } from './description-fonts';

describe('embedDescriptionFonts (C8)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns four embedded PDFFonts', async () => {
    const pdfDoc = await PDFDocument.create();
    const fonts = await embedDescriptionFonts(pdfDoc);

    for (const face of [fonts.regular, fonts.bold, fonts.condensed, fonts.condensedBold]) {
      expect(face).toBeInstanceOf(PDFFont);
      // The faces must be usable for width measurement (column-fit logic).
      expect(face.widthOfTextAtSize('Beacon 131', 8)).toBeGreaterThan(0);
    }
  });

  it('falls back to Helvetica without throwing when fetch is unavailable', async () => {
    vi.stubGlobal('fetch', undefined);

    const pdfDoc = await PDFDocument.create();
    const fonts = await embedDescriptionFonts(pdfDoc);

    expect(fonts.regular).toBeInstanceOf(PDFFont);
    expect(fonts.bold).toBeInstanceOf(PDFFont);
    // Fallback maps condensed faces onto the standard ones.
    expect(fonts.condensed).toBe(fonts.regular);
    expect(fonts.condensedBold).toBe(fonts.bold);
  });

  it('falls back without throwing when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const pdfDoc = await PDFDocument.create();
    const fonts = await embedDescriptionFonts(pdfDoc);

    expect(fonts.regular).toBeInstanceOf(PDFFont);
    expect(fonts.condensed).toBe(fonts.regular);
  });

  it('produces a saveable document with the embedded faces', async () => {
    const pdfDoc = await PDFDocument.create();
    const fonts = await embedDescriptionFonts(pdfDoc);
    const page = pdfDoc.addPage([200, 200]);
    page.drawText('101', { x: 10, y: 10, size: 8, font: fonts.condensed });
    page.drawText('Course 1', { x: 10, y: 30, size: 9, font: fonts.bold });
    const bytes = await pdfDoc.save();
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});
