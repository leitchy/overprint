/**
 * PrintBoundary — Konva overlay that draws a dashed rectangle on the canvas
 * showing the area that will appear on the printed page at the current print
 * scale and page settings.
 *
 * The rectangle is computed using the same viewport calculation as PDF export
 * so what you see is exactly what will print.
 */
import { Rect } from 'react-konva';
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { useAppSettingsStore } from '@/stores/app-settings-store';
import {
  computePageLayout,
  computeCourseBounds,
  computeMapViewport,
} from '@/core/export/pdf-page-layout';

/** Stroke colour: blue at 50% opacity */
const BOUNDARY_STROKE = 'rgba(74, 144, 217, 0.5)';

/** Stroke width in map pixels — kept thin so it doesn't obscure controls */
const STROKE_WIDTH = 2;

export function PrintBoundary() {
  const showPrintBoundary = useAppSettingsStore((s) => s.showPrintBoundary);
  const courses = useEventStore((s) => s.event?.courses);
  const controls = useEventStore((s) => s.event?.controls);
  const settings = useEventStore((s) => s.event?.settings);
  const mapFile = useEventStore((s) => s.event?.mapFile);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const imgWidth = useMapImageStore((s) => s.imageWidth);
  const imgHeight = useMapImageStore((s) => s.imageHeight);

  if (!showPrintBoundary || !courses || !controls || !settings || !activeCourseId) return null;

  const activeCourse = courses.find((c) => c.id === activeCourseId) ?? null;
  if (!activeCourse || activeCourse.controls.length === 0) return null;

  if (!mapFile) return null;

  const bounds = computeCourseBounds(activeCourse, controls);
  if (!bounds) return null;

  const { dpi, scale: mapScale } = mapFile;
  const printScale = activeCourse.settings.printScale ?? settings.printScale;
  const layout = computePageLayout(settings.pageSetup);
  const printAreaOverride = activeCourse.settings.printArea;

  const viewport = computeMapViewport(
    layout,
    mapScale,
    printScale,
    dpi,
    imgWidth,
    imgHeight,
    bounds,
    30,
    printAreaOverride,
  );

  return (
    <Rect
      x={viewport.left}
      y={viewport.top}
      width={viewport.widthPx}
      height={viewport.heightPx}
      stroke={BOUNDARY_STROKE}
      strokeWidth={STROKE_WIDTH}
      dash={[10, 5]}
      fill="transparent"
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}
