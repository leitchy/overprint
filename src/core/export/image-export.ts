/**
 * Canvas-to-image export utilities.
 *
 * Accepts an HTMLCanvasElement (e.g., obtained from a Konva stage) and
 * returns a Blob plus a file extension. The caller is responsible for
 * prompting the user to save the result (see saveBlob in download.ts).
 */

export type ImageFormat = 'png' | 'jpeg';

export interface ImageExportResult {
  blob: Blob;
  extension: 'png' | 'jpg';
}

/**
 * Export a canvas element as a PNG or JPEG Blob.
 *
 * @param canvas  - The source HTMLCanvasElement to capture
 * @param format  - Output format ('png' or 'jpeg')
 * @param quality - JPEG quality 0–1 (ignored for PNG). Defaults to 0.92.
 */
export async function generateImageBlob(
  canvas: HTMLCanvasElement,
  format: ImageFormat = 'png',
  quality = 0.92,
): Promise<ImageExportResult> {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))),
      mimeType,
      format === 'jpeg' ? quality : undefined,
    );
  });
  return { blob, extension: format === 'jpeg' ? 'jpg' : 'png' };
}
