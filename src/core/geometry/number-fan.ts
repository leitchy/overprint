/**
 * Sequence-number fan for repeated controls (E10 Phase 2 — butterfly/phi loops).
 *
 * A loop hub is visited k+1 times, so one physical circle carries k+1 sequence
 * numbers. Rendered at the default position they would stack illegibly; PurplePen
 * fans them around the circle (e.g. "3,5,7"). This pure helper computes, for each
 * occurrence in a flattened control list, an effective `numberOffset` that spreads
 * co-located numbers around the circle.
 *
 * Output is a DELTA in the SAME units as `numberOffset` (map pixels) — the exact
 * value both the screen (`control-shape.tsx`) and PDF (`pdf-overprint-renderer.ts`)
 * renderers add to their type-dependent default number position. Callers pass a
 * map-pixel `radius`; the PDF path's usual `numberOffset * effectivePPP` conversion
 * then yields identical geometry on screen and in print.
 *
 * Rules:
 * - A control that occurs once → its offset passes through unchanged (incl. undefined).
 * - A group of >1 co-located occurrences → each auto occurrence gets a fanned slot;
 *   an occurrence with an EXPLICIT `numberOffset` keeps it (user placement wins).
 * - The first slot sits at the default direction (zero delta), so a group's leading
 *   number stays where a single number would be; the rest fan evenly around 360°.
 */
import type { MapPoint } from '@/core/models/types';
import type { ControlId } from '@/utils/id';

export interface FanEntry {
  controlId: ControlId;
  /** An explicit, user-set offset (wins over fanning); undefined = auto. */
  numberOffset?: MapPoint;
}

/** Default number direction: up-right, matching both renderers' default position.
 *  Screen/PDF coords are +x right, +y down (PDF negates y downstream). */
const DEFAULT_ANGLE = -Math.PI / 4;

export function computeNumberFanOffsets(
  entries: FanEntry[],
  radius: number,
): Array<MapPoint | undefined> {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const key = String(entries[i]!.controlId);
    const arr = groups.get(key);
    if (arr) arr.push(i);
    else groups.set(key, [i]);
  }

  const out: Array<MapPoint | undefined> = entries.map((e) => e.numberOffset);

  const baseX = radius * Math.cos(DEFAULT_ANGLE);
  const baseY = radius * Math.sin(DEFAULT_ANGLE);

  for (const indices of groups.values()) {
    const n = indices.length;
    if (n < 2) continue; // single occurrence → passthrough
    for (let j = 0; j < n; j++) {
      const i = indices[j]!;
      if (entries[i]!.numberOffset) continue; // explicit offset wins
      const theta = DEFAULT_ANGLE + (j * 2 * Math.PI) / n;
      out[i] = {
        x: radius * Math.cos(theta) - baseX,
        y: radius * Math.sin(theta) - baseY,
      };
    }
  }

  return out;
}
