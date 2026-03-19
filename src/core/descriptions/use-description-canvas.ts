import { useEffect, useRef, useState } from 'react';
import type { Control, Course } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { renderDescriptionToCanvas, type DescriptionAppearance } from './canvas-description-renderer';

/**
 * React hook that produces an offscreen HTMLCanvasElement containing the
 * rendered IOF description sheet for the given course.
 *
 * Returns null while the async render is in progress. The canvas reference
 * updates when any input changes.
 */
export function useDescriptionCanvas(
  course: Course | undefined,
  controls: Record<ControlId, Control>,
  mapScale: number,
  mapDpi: number,
  widthPx: number,
  appearance: DescriptionAppearance,
  lang: string,
): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const renderIdRef = useRef(0);

  // Build a fingerprint to detect meaningful changes
  const fingerprint = course
    ? JSON.stringify({
        courseId: course.id,
        name: course.name,
        secondaryTitle: course.settings.secondaryTitle,
        climb: course.climb ?? course.settings.climb,
        controls: course.controls.map((cc) => {
          const ctrl = controls[cc.controlId];
          return ctrl
            ? { id: cc.controlId, type: cc.type, code: ctrl.code, desc: ctrl.description }
            : { id: cc.controlId, type: cc.type };
        }),
        widthPx: Math.round(widthPx),
        appearance,
        lang,
      })
    : null;

  useEffect(() => {
    if (!course || widthPx < 10) {
      setCanvas(null);
      return;
    }

    const renderId = ++renderIdRef.current;

    renderDescriptionToCanvas(course, controls, mapScale, mapDpi, widthPx, appearance, lang)
      .then((result) => {
        // Only apply if this is still the latest render
        if (renderIdRef.current === renderId) {
          setCanvas(result);
        }
      })
      .catch((err) => {
        console.error('Description canvas render failed:', err);
        if (renderIdRef.current === renderId) {
          setCanvas(null);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  return canvas;
}
