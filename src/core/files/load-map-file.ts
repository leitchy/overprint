/**
 * Shared map-loading utility.
 *
 * Encapsulates the full flow for loading any supported map file type into the
 * Zustand stores. Used by both the Toolbar file-input handler and the app-level
 * drag-and-drop handler so the logic lives in exactly one place.
 */
import { detectMapFileType } from './detect-file-type';
import { loadRasterImage } from './load-raster';
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';

/**
 * Load a map file (raster/PDF/OCAD) into the stores.
 *
 * - Creates a new event if none exists.
 * - Preserves `scale` and `dpi` from any previously-loaded `.overprint`
 *   metadata so re-loading the same file does not reset calibration.
 *
 * @returns `true` when the file was loaded successfully, `false` otherwise.
 */
export async function loadMapFile(file: File): Promise<boolean> {
  const fileType = detectMapFileType(file);

  if (fileType === 'unknown') {
    console.error('Unsupported file type:', file.name);
    return false;
  }

  // Create event if none exists — never overwrite an existing loaded event.
  if (!useEventStore.getState().event) {
    useEventStore.getState().newEvent('Untitled Event');
  }

  // If the event already has mapFile metadata (from a .overprint load), keep
  // its saved scale/dpi so calibration survives a map reload.
  const existingMapFile = useEventStore.getState().event?.mapFile;

  try {
    if (fileType === 'raster') {
      const img = await loadRasterImage(file);
      useMapImageStore.getState().setImage(img, img.naturalWidth, img.naturalHeight);
      useEventStore.getState().setMapFile({
        name: file.name,
        type: 'raster',
        scale: existingMapFile?.scale ?? 15000,
        dpi: existingMapFile?.dpi ?? 150,
      });
    } else if (fileType === 'pdf') {
      const { loadPdfAsImage } = await import('./load-pdf');
      const dpi = existingMapFile?.dpi ?? 200;
      const result = await loadPdfAsImage(file, { dpi });
      useMapImageStore.getState().setImage(result.canvas, result.width, result.height);
      useMapImageStore.getState().setPdfArrayBuffer(result.arrayBuffer);
      useEventStore.getState().setMapFile({
        name: file.name,
        type: 'pdf',
        scale: existingMapFile?.scale ?? 15000,
        dpi,
      });
    } else if (fileType === 'ocad') {
      const { loadOcadMap } = await import('./load-ocad');
      const result = await loadOcadMap(file);
      useMapImageStore.getState().setImage(result.image, result.width, result.height);
      // OCAD DPI is computed from the file's coordinate geometry and must not
      // be overridden by a stale saved value.  Scale is also authoritative;
      // fall back only when the OCAD metadata is absent (result.scale === null).
      useEventStore.getState().setMapFile({
        name: file.name,
        type: 'ocad',
        scale: result.scale ?? existingMapFile?.scale ?? 15000,
        dpi: result.dpi,
      });
    } else if (fileType === 'omap') {
      const { loadOmapMap } = await import('./load-omap');
      const result = await loadOmapMap(file);
      useMapImageStore.getState().setImage(result.image, result.width, result.height);
      // OOM DPI + scale are computed from the file and are authoritative.
      useEventStore.getState().setMapFile({
        name: file.name,
        type: 'omap',
        scale: result.scale ?? existingMapFile?.scale ?? 15000,
        dpi: result.dpi,
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to load map:', err);
    return false;
  }
}

/**
 * Load an `.overprint` event file into the event store.
 *
 * @returns `true` when the event was loaded successfully, `false` otherwise.
 */
export async function loadEventFile(file: File): Promise<boolean> {
  try {
    const { deserializeEvent } = await import('./overprint-format');
    const text = await file.text();
    const loadedEvent = deserializeEvent(text);
    useEventStore.getState().loadEvent(loadedEvent);
    return true;
  } catch (err) {
    console.error('Failed to open event:', err);
    return false;
  }
}

/**
 * Import controls and courses from an IOF XML file into the current event.
 *
 * @returns `true` when the import succeeded, `false` otherwise.
 */
export async function importIofXmlFile(file: File): Promise<boolean> {
  const currentEvent = useEventStore.getState().event;
  const mapFile = currentEvent?.mapFile;

  const dpi = mapFile?.dpi ?? 96;
  const mapImage = useMapImageStore.getState().image;
  const mapHeightPx =
    mapImage instanceof HTMLCanvasElement
      ? mapImage.height
      : mapImage instanceof HTMLImageElement
        ? mapImage.naturalHeight
        : 0;

  try {
    const xmlString = await file.text();
    const { importIofXml } = await import('@/core/iof/import-xml');
    const { controls, courses } = importIofXml(xmlString, dpi, mapHeightPx);

    if (!useEventStore.getState().event) {
      useEventStore.getState().newEvent('Imported Event');
    }

    useEventStore.getState().importControlsAndCourses(controls, courses);
    return true;
  } catch (err) {
    console.error('IOF XML import failed:', err);
    return false;
  }
}
