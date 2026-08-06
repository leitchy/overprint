import { describe, it, expect } from 'vitest';
import { autoNumberOffsets } from './auto-number-placement';
import { overprintPixelDimensions } from './overprint-dimensions';
import { createCourse, createControl, DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';
import type { Control } from '@/core/models/types';
import type { ControlId } from '@/utils/id';

const dims = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150);

describe('autoNumberOffsets', () => {
  it('places an isolated control number upper-right (default angle) and finite', () => {
    const c = createControl(31, { x: 1000, y: 1000 });
    const course = createCourse('C');
    course.controls = [{ controlId: c.id, type: 'control' }];
    const controls: Record<ControlId, Control> = { [c.id]: c };

    const offs = autoNumberOffsets(course, controls, dims);
    const o = offs.get(0);
    expect(o).toBeDefined();
    expect(Number.isFinite(o!.x)).toBe(true);
    expect(Number.isFinite(o!.y)).toBe(true);

    // With no obstacles, the default candidate (upper-right, θ=-π/6) wins on ties,
    // so the number's absolute position sits above the control centre (y < 0).
    const selectionRadius = dims.circleRadius + dims.lineWidth * 2 * 2;
    const defaultAnchorY = -(dims.numberSize * 0.6);
    void selectionRadius;
    expect(defaultAnchorY + o!.y).toBeLessThan(0); // above the control
  });

  it('responds to an obstacle: a leg toward upper-right moves the number elsewhere', () => {
    const a = createControl(31, { x: 2000, y: 500 });   // previous control (up-right of b)
    const b = createControl(32, { x: 1000, y: 1000 });  // numbered control
    const controls: Record<ControlId, Control> = { [a.id]: a, [b.id]: b };

    // Isolated b (no leg)
    const solo = createCourse('solo');
    solo.controls = [{ controlId: b.id, type: 'control' }];
    const soloOff = autoNumberOffsets(solo, { [b.id]: b }, dims).get(0)!;

    // b with a leg coming from a (up-right)
    const withLeg = createCourse('leg');
    withLeg.controls = [
      { controlId: a.id, type: 'start' },
      { controlId: b.id, type: 'control' },
    ];
    const legOff = autoNumberOffsets(withLeg, controls, dims).get(1)!;

    // The leg near the upper-right changes b's chosen placement.
    const moved = Math.abs(legOff.x - soloOff.x) > 1 || Math.abs(legOff.y - soloOff.y) > 1;
    expect(moved).toBe(true);
  });

  it('places numbers for every labelled control (matches the renderer, incl. start/finish)', () => {
    const s = createControl(31, { x: 100, y: 100 });
    const c = createControl(32, { x: 500, y: 500 });
    const f = createControl(33, { x: 900, y: 900 });
    const course = createCourse('C');
    course.controls = [
      { controlId: s.id, type: 'start' },
      { controlId: c.id, type: 'control' },
      { controlId: f.id, type: 'finish' },
    ];
    const controls: Record<ControlId, Control> = { [s.id]: s, [c.id]: c, [f.id]: f };
    const offs = autoNumberOffsets(course, controls, dims);
    expect(offs.size).toBe(3);
    for (const o of offs.values()) {
      expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true);
    }
  });

  it('produces no numbers when labelMode is none', () => {
    const c = createControl(32, { x: 500, y: 500 });
    const course = createCourse('C');
    course.settings.labelMode = 'none';
    course.controls = [{ controlId: c.id, type: 'control' }];
    const offs = autoNumberOffsets(course, { [c.id]: c }, dims);
    expect(offs.size).toBe(0);
  });
});
