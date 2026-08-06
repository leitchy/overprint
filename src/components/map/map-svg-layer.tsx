import { useEffect, useRef } from 'react';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useMapImageStore } from '@/stores/map-image-store';
import { getStageInstance } from './map-canvas';

/**
 * ADR-015 Phase 0 SPIKE — live DOM-SVG map layer for vector maps.
 *
 * Renders the loader SVG (OCAD/OMAP) as a live `<svg>` positioned BEHIND the
 * Konva Stage and CSS-transformed to track the stage's pan/zoom, so the map
 * stays vector-sharp at every zoom instead of being an upscaled bitmap.
 *
 * This is a throwaway spike gated behind `?svgmap=1`. Its purpose is to answer
 * the make-or-break question: does the course overprint's `mix-blend-mode:
 * multiply` still composite against this sibling SVG — on iOS Safari especially?
 *
 * Display-only: coordinates, controls, export and print are untouched. The host
 * is `pointer-events: none` so all interaction flows to the Stage behind it.
 */
export function MapSvgLayer({ stageRef }: { stageRef: React.RefObject<StageType | null> }) {
  const svg = useMapImageStore((s) => (s.rerender?.kind === 'svg' ? s.rerender.svg : null));
  const imageWidth = useMapImageStore((s) => s.imageWidth);
  const imageHeight = useMapImageStore((s) => s.imageHeight);
  const mapVersion = useMapImageStore((s) => s.mapVersion);
  const hostRef = useRef<HTMLDivElement>(null);

  // Inject the SVG markup imperatively (NOT via React diffing of a multi-MB
  // subtree). The stored SVG has a viewBox but no width/height; injecting the
  // logical pixel size reproduces the exact geometry of the base bitmap, so the
  // map registers 1:1 with control coordinates.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !svg) return;
    const sized = svg.replace(/<svg\b/, `<svg width="${imageWidth}" height="${imageHeight}"`);
    el.innerHTML = sized;
    const inner = el.querySelector('svg');
    if (inner) inner.style.display = 'block';
  }, [svg, imageWidth, imageHeight, mapVersion]);

  // Transform sync — subscribe to the Stage's attr-change events so the SVG
  // stays glued to the overprint through every gesture (gestures mutate the
  // stage imperatively; syncing to the store would lag ~100ms).
  useEffect(() => {
    const stage = stageRef.current ?? getStageInstance();
    const el = hostRef.current;
    if (!stage || !el) return;
    const apply = () => {
      el.style.transform = `translate(${stage.x()}px, ${stage.y()}px) scale(${stage.scaleX()})`;
    };
    apply(); // initial
    stage.on('xChange.svgsync yChange.svgsync scaleXChange.svgsync', apply);
    return () => { stage.off('.svgsync'); };
  }, [stageRef, mapVersion]);

  if (!svg) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden data-map-svg-layer>
      <div
        ref={hostRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: imageWidth,
          height: imageHeight,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
