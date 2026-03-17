/**
 * File type definitions for showSaveFilePicker.
 */
export interface SaveFileType {
  description: string;
  accept: Record<string, string[]>;
}

/**
 * Save a Blob using the File System Access API (showSaveFilePicker) when
 * available, falling back to anchor-click auto-download on Firefox/Safari.
 */
export async function saveBlob(
  blob: Blob,
  suggestedName: string,
  types?: SaveFileType[],
): Promise<void> {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        ...(types ? { types } : {}),
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled the dialog — not an error
      if (err instanceof DOMException && err.name === 'AbortError') return;
      throw err;
    }
  }

  // Fallback: auto-download via anchor click
  downloadBlob(blob, suggestedName);
}

/**
 * Save a string as a file, prompting for filename when supported.
 */
export async function saveString(
  content: string,
  suggestedName: string,
  mimeType = 'application/json',
  types?: SaveFileType[],
): Promise<void> {
  const blob = new Blob([content], { type: mimeType });
  await saveBlob(blob, suggestedName, types);
}

/**
 * Save a Uint8Array as a file, prompting for filename when supported.
 */
export async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
  mimeType = 'application/octet-stream',
  types?: SaveFileType[],
): Promise<void> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  await saveBlob(blob, suggestedName, types);
}

/**
 * Trigger a browser file download from a Blob (no dialog).
 * Used as fallback when File System Access API is unavailable.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
