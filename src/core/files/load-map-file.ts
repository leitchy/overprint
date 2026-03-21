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
import { useGpsStore } from '@/stores/gps-store';
import { useToastStore } from '@/stores/toast-store';

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

  // If the event already has mapFile metadata (from a .overprint or .ppen load),
  // keep its saved scale/dpi so calibration survives a map reload.
  const existingMapFile = useEventStore.getState().event?.mapFile;
  const hasPendingTransform = existingMapFile?.pendingCoordinateTransform === true;

  try {
    if (fileType === 'raster') {
      const img = await loadRasterImage(file);
      useMapImageStore.getState().setImage(img, img.naturalWidth, img.naturalHeight);
      useEventStore.getState().setMapFile({
        name: file.name,
        type: 'raster',
        scale: existingMapFile?.scale ?? 15000,
        dpi: existingMapFile?.dpi ?? 150,
        georef: existingMapFile?.georef,
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
        georef: existingMapFile?.georef,
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
        georef: result.georef ?? undefined,
        viewBox: result.viewBox,
        renderScale: result.renderScale,
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
        georef: result.georef ?? undefined,
        viewBox: result.viewBox,
        renderScale: result.renderScale,
      });
    }

    // After loading a map, check if there are pending coordinate transforms
    // from a .ppen import that happened before the map was loaded.
    if (hasPendingTransform) {
      await applyPendingReproject();
    }

    return true;
  } catch (err) {
    console.error('Failed to load map:', err);
    return false;
  }
}

/**
 * Re-project all coordinates from identity-mm space using the now-loaded map.
 * Called after loading a map when hasPendingTransform was true.
 */
async function applyPendingReproject(): Promise<void> {
  const event = useEventStore.getState().event;
  if (!event?.mapFile) return;

  const mapImage = useMapImageStore.getState().image;
  const mapHeightPx =
    mapImage instanceof HTMLCanvasElement
      ? mapImage.height
      : mapImage instanceof HTMLImageElement
        ? mapImage.naturalHeight
        : 0;

  if (mapHeightPx === 0) return;

  const dpi = event.mapFile.dpi;
  if (!dpi || dpi <= 0) return;

  const viewBox = (event.mapFile.viewBox && event.mapFile.renderScale)
    ? {
        viewBox: event.mapFile.viewBox,
        renderScale: event.mapFile.renderScale,
        mmToUnits: event.mapFile.type === 'omap' ? 1000 : 100,
      }
    : undefined;

  const { reprojectPpenCoordinates } = await import('@/core/ppen/reproject-coordinates');
  const reprojected = reprojectPpenCoordinates(event, dpi, mapHeightPx, viewBox);
  useEventStore.getState().loadEvent(reprojected);
  useToastStore.getState().addToast('Controls repositioned to match loaded map');
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
    const { event: loadedEvent, embeddedMapImage } = deserializeEvent(text);
    // Reset GPS state before replacing the event — georef may change
    useGpsStore.getState().reset();
    useEventStore.getState().loadEvent(loadedEvent);

    // Auto-load embedded map image if present
    if (embeddedMapImage) {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          useMapImageStore.getState().setImage(img, img.naturalWidth, img.naturalHeight);
          resolve();
        };
        img.onerror = () => reject(new Error('Failed to load embedded map image'));
        img.src = embeddedMapImage;
      });
    }
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

/**
 * Import a PurplePen `.ppen` file, creating a new event.
 *
 * If a map is already loaded, coordinates are converted immediately.
 * Otherwise, coordinates are stored in mm and re-projected when the map loads.
 *
 * @returns `true` when the import succeeded, `false` otherwise.
 */
export async function importPpenFile(file: File): Promise<boolean> {
  const mapImage = useMapImageStore.getState().image;
  const mapHeightPx =
    mapImage instanceof HTMLCanvasElement
      ? mapImage.height
      : mapImage instanceof HTMLImageElement
        ? mapImage.naturalHeight
        : 0;

  // If a map is loaded, use its real DPI; otherwise use identity-mm mode
  const currentMapFile = useEventStore.getState().event?.mapFile;
  const hasMap = mapHeightPx > 0 && currentMapFile;
  const dpi = hasMap ? currentMapFile.dpi : 25.4; // 25.4 → 1mm = 1px

  // ViewBox params for OCAD/OMAP maps — needed for correct coordinate conversion
  const viewBox = (hasMap && currentMapFile.viewBox && currentMapFile.renderScale)
    ? {
        viewBox: currentMapFile.viewBox,
        renderScale: currentMapFile.renderScale,
        mmToUnits: currentMapFile.type === 'omap' ? 1000 : 100,
      }
    : undefined;

  try {
    const xmlString = await file.text();
    const { importPpen } = await import('@/core/ppen/import-ppen');
    const { event, mapFileName, warnings } = importPpen(
      xmlString,
      dpi,
      hasMap ? mapHeightPx : 0,
      viewBox,
    );

    // Flag for deferred re-projection when importing without a map
    if (!hasMap && event.mapFile) {
      event.mapFile.pendingCoordinateTransform = true;
    }

    // Reset GPS state before replacing the event
    useGpsStore.getState().reset();
    useEventStore.getState().loadEvent(event);

    // Surface warnings
    for (const w of warnings) {
      useToastStore.getState().addToast(w.message, 4000);
    }

    // Prompt user to load the referenced map if no map is loaded
    if (!hasMap && mapFileName) {
      useToastStore.getState().addToast(`Load map file: ${mapFileName}`, 5000);
    }

    return true;
  } catch (err) {
    console.error('PurplePen import failed:', err);
    return false;
  }
}
