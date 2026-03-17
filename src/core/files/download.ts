/**
 * Trigger a browser file download from a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download a string as a file.
 */
export function downloadString(
  content: string,
  filename: string,
  mimeType = 'application/json',
): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Download a Uint8Array as a file.
 */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType = 'application/octet-stream',
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  downloadBlob(blob, filename);
}
