/**
 * Sanitise a name into a safe filename base (strips characters outside
 * `[A-Za-z0-9-_ ]` and trims), falling back to `fallback` when nothing remains.
 */
export function sanitizeFilename(name: string, fallback = 'export'): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || fallback;
}

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
 * A save target acquired up-front, written to once the content is ready.
 */
export interface PendingSave {
  /** Persist the generated content (Blob or string) to the chosen target. */
  write(data: Blob | string): Promise<void>;
}

/**
 * Acquire a save target while the user gesture is still fresh, returning a
 * writer to call once the content has been generated.
 *
 * `showSaveFilePicker` needs Chrome's *transient* user activation, which is
 * consumed by any `await` (a dynamic `import()`, PDF generation, …) between the
 * click and the picker call. Handlers that do heavy async work must call
 * `beginSave` FIRST — before those awaits — then generate and `.write()`.
 * Throws `AbortError` if the user cancels the picker (callers already ignore it).
 * On Firefox/Safari (no picker) it defers to an auto-download at write time.
 */
export async function beginSave(
  suggestedName: string,
  types?: SaveFileType[],
): Promise<PendingSave> {
  if ('showSaveFilePicker' in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      ...(types ? { types } : {}),
    });
    return {
      async write(data) {
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
      },
    };
  }
  return {
    async write(data) {
      const blob = typeof data === 'string' ? new Blob([data]) : data;
      downloadBlob(blob, suggestedName);
    },
  };
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
