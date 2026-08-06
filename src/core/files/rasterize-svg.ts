/**
 * Rasterize an SVG string to an HTMLImageElement at explicit pixel dimensions.
 *
 * The input SVG must carry a `viewBox` but NOT `width`/`height` attributes — this
 * function injects the requested pixel size so the same source can be re-rendered
 * at any resolution (see `use-adaptive-map-raster`).
 *
 * Encoding:
 * - `'data-url'` gives better SVG text rendering in some engines but is bounded
 *   by Safari's ~2 MB data-URL limit for <img>.
 * - `'blob'` avoids that limit — preferred for large / high-resolution renders.
 */
export async function rasterizeSvgToImage(
  svgWithoutSize: string,
  pixelWidth: number,
  pixelHeight: number,
  encoding: 'blob' | 'data-url' = 'blob',
): Promise<HTMLImageElement> {
  const sized = svgWithoutSize.replace(
    /<svg\b/,
    `<svg width="${pixelWidth}" height="${pixelHeight}"`,
  );

  let url: string;
  let isBlob = false;
  if (encoding === 'data-url') {
    const base64 = btoa(unescape(encodeURIComponent(sized)));
    url = `data:image/svg+xml;base64,${base64}`;
  } else {
    const blob = new Blob([sized], { type: 'image/svg+xml' });
    url = URL.createObjectURL(blob);
    isBlob = true;
  }

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to rasterize SVG'));
      img.src = url;
    });
  } finally {
    if (isBlob) URL.revokeObjectURL(url);
  }
}
