const DEFAULT_DPI = 200;
const PDF_INTERNAL_DPI = 72;

interface LoadPdfOptions {
  dpi?: number;
  pageNumber?: number;
}

interface LoadPdfResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  arrayBuffer: ArrayBuffer;
}

export async function loadPdfAsImage(
  file: File,
  options: LoadPdfOptions = {},
): Promise<LoadPdfResult> {
  const { dpi = DEFAULT_DPI, pageNumber = 1 } = options;
  const arrayBuffer = await file.arrayBuffer();
  const canvas = await renderPdfPageToCanvas(arrayBuffer, dpi, pageNumber);
  return { canvas, width: canvas.width, height: canvas.height, arrayBuffer };
}

/**
 * Render a single PDF page to a canvas at the given DPI.
 *
 * Shared by the initial load and by the adaptive re-rasterizer, which re-renders
 * the stored PDF buffer at a higher DPI when the user zooms in. The `arrayBuffer`
 * is transferred to PDF.js, so pass a copy if the caller needs to reuse it — the
 * app keeps the original in the map-image store and hands slices/copies here.
 */
export async function renderPdfPageToCanvas(
  arrayBuffer: ArrayBuffer,
  dpi: number,
  pageNumber = 1,
): Promise<HTMLCanvasElement> {
  const scale = dpi / PDF_INTERNAL_DPI;

  // Lazy import to avoid loading PDF.js at module evaluation time
  // (PDF.js requires DOM APIs not available in test environments)
  const { pdfjsLib } = await import('./pdf-worker-setup');

  // PDF.js detaches the buffer it reads from; render from a copy so the caller's
  // stored buffer stays intact for repeated re-renders and export embedding.
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;

  try {
    const page = await pdf.getPage(pageNumber);

    try {
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvas, viewport }).promise;
      return canvas;
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}
