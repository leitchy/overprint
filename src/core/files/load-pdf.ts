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
  const scale = dpi / PDF_INTERNAL_DPI;

  // Lazy import to avoid loading PDF.js at module evaluation time
  // (PDF.js requires DOM APIs not available in test environments)
  const { pdfjsLib } = await import('./pdf-worker-setup');

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  try {
    const page = await pdf.getPage(pageNumber);

    try {
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvas, viewport }).promise;

      return {
        canvas,
        width: canvas.width,
        height: canvas.height,
        arrayBuffer,
      };
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}
