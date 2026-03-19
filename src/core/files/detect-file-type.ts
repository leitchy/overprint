export type MapFileType = 'raster' | 'pdf' | 'ocad' | 'omap' | 'unknown';

const RASTER_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/tiff',
]);

const RASTER_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.tiff', '.tif', '.bmp',
]);

export function detectMapFileType(file: File): MapFileType {
  // Check MIME type first
  if (RASTER_MIME_TYPES.has(file.type)) return 'raster';
  if (file.type === 'application/pdf') return 'pdf';

  // Fall back to extension
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  if (RASTER_EXTENSIONS.has(ext)) return 'raster';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.ocd') return 'ocad';
  if (ext === '.omap' || ext === '.xmap') return 'omap';

  return 'unknown';
}
