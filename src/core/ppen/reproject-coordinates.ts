/**
 * Re-project coordinates from identity-mm space to real pixel space.
 *
 * When a .ppen file is imported without a loaded map, positions are stored
 * using a synthetic dpi=25.4 (1mm = 1px) with no Y-flip. Once the actual
 * map image loads and we know real dpi and mapHeightPx, this function
 * transforms all MapPoint values in the event to correct pixel coordinates.
 *
 * For OCAD/OMAP maps with georef data, uses viewBox-aware conversion
 * (same as the parser's convertPoint with georef).
 */
import type { MapPoint, OverprintEvent } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import type { ViewBoxParams } from '@/core/ppen/import-ppen';

function reprojectPoint(
  p: MapPoint,
  dpi: number,
  mapHeightPx: number,
  viewBox?: ViewBoxParams,
): MapPoint {
  // In identity-mm mode, p.x === x_mm and p.y === y_mm
  const xMm = p.x;
  const yMm = p.y;

  // OCAD/OMAP: use viewBox-aware conversion
  if (viewBox && viewBox.renderScale > 0) {
    const u = viewBox.mmToUnits;
    const xPx = (xMm * u - viewBox.viewBox.x) * viewBox.renderScale;
    const yPx = (viewBox.viewBox.y + viewBox.viewBox.height - yMm * u) * viewBox.renderScale;
    return { x: xPx, y: yPx };
  }

  // Raster/PDF: simple mm→pixel with Y-flip
  const xPx = (xMm / 25.4) * dpi;
  const yPx = mapHeightPx - (yMm / 25.4) * dpi;
  return { x: xPx, y: yPx };
}

/**
 * Transform all coordinates in an event from identity-mm space to pixel space.
 *
 * Returns a new event object (does not mutate the input).
 */
export function reprojectPpenCoordinates(
  event: OverprintEvent,
  dpi: number,
  mapHeightPx: number,
  viewBox?: ViewBoxParams,
): OverprintEvent {
  const rp = (p: MapPoint) => reprojectPoint(p, dpi, mapHeightPx, viewBox);

  // Re-project controls
  const controls = { ...event.controls };
  for (const [id, control] of Object.entries(event.controls)) {
    controls[id as ControlId] = {
      ...control,
      position: rp(control.position),
    };
  }

  // Re-project course-control bend points and print areas
  const courses = event.courses.map(course => ({
    ...course,
    controls: course.controls.map(cc => ({
      ...cc,
      bendPoints: cc.bendPoints?.map(rp),
    })),
    settings: {
      ...course.settings,
      printArea: course.settings.printArea ? {
        minX: rp({ x: course.settings.printArea.minX, y: course.settings.printArea.minY }).x,
        minY: rp({ x: course.settings.printArea.minX, y: course.settings.printArea.minY }).y,
        maxX: rp({ x: course.settings.printArea.maxX, y: course.settings.printArea.maxY }).x,
        maxY: rp({ x: course.settings.printArea.maxX, y: course.settings.printArea.maxY }).y,
      } : undefined,
    },
  }));

  // Re-project special items
  const specialItems = event.specialItems.map(item => {
    const base = { ...item, position: rp(item.position) };
    if ('endPosition' in item && item.endPosition) {
      return { ...base, endPosition: rp(item.endPosition) } as typeof item;
    }
    return base as typeof item;
  });

  return {
    ...event,
    controls,
    courses,
    specialItems,
    mapFile: event.mapFile ? {
      ...event.mapFile,
      dpi,
      pendingCoordinateTransform: false,
    } : null,
  };
}
