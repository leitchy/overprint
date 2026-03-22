import { describe, it, expect } from 'vitest';
import { computeGridLayout } from './canvas-description-renderer';
import { createCourse, createControl } from '@/core/models/defaults';
import type { CourseControl } from '@/core/models/types';

function addControlsToCourse(course: ReturnType<typeof createCourse>, count: number) {
  const controls: Record<string, ReturnType<typeof createControl>> = {};
  const courseControls: CourseControl[] = [];

  // Start
  const start = createControl(100, { x: 0, y: 0 });
  controls[start.id] = start;
  courseControls.push({ controlId: start.id, type: 'start' });

  // Regular controls
  for (let i = 0; i < count; i++) {
    const ctrl = createControl(31 + i, { x: (i + 1) * 100, y: (i + 1) * 100 }, {
      columnD: '1.1', // Terrace
      columnG: '0.1', // North side
    });
    controls[ctrl.id] = ctrl;
    courseControls.push({ controlId: ctrl.id, type: 'control' });
  }

  // Finish
  const finish = createControl(200, { x: 500, y: 500 });
  controls[finish.id] = finish;
  courseControls.push({ controlId: finish.id, type: 'finish' });

  course.controls = courseControls;
  return controls;
}

describe('computeGridLayout', () => {
  it('calculates correct row count for empty course', () => {
    const course = createCourse('Test');
    const layout = computeGridLayout(course, 400, 'symbols');
    // header + info + column headers + 1 empty state row = 4
    expect(layout.numRows).toBe(4);
  });

  it('calculates correct row count for course with controls', () => {
    const course = createCourse('Test');
    addControlsToCourse(course, 5);
    const layout = computeGridLayout(course, 400, 'symbols');
    // header + info + column headers + 7 controls (start + 5 + finish) = 10
    expect(layout.numRows).toBe(10);
  });

  it('includes secondary title row when present', () => {
    const course = createCourse('Test');
    course.settings.secondaryTitle = 'M21A';
    addControlsToCourse(course, 3);
    const layout = computeGridLayout(course, 400, 'symbols');
    // header + secondary + info + column headers + 5 controls = 9
    expect(layout.numRows).toBe(9);
  });

  it('uses 8 columns for symbols mode', () => {
    const course = createCourse('Test');
    const layout = computeGridLayout(course, 400, 'symbols');
    expect(layout.numCols).toBe(8);
    expect(layout.hasTextColumn).toBe(false);
    expect(layout.textColWidth).toBe(0);
  });

  it('uses 8 columns for text mode', () => {
    const course = createCourse('Test');
    const layout = computeGridLayout(course, 400, 'text');
    expect(layout.numCols).toBe(8);
    expect(layout.hasTextColumn).toBe(false);
  });

  it('adds text column for symbolsAndText mode', () => {
    const course = createCourse('Test');
    const layout = computeGridLayout(course, 400, 'symbolsAndText');
    expect(layout.hasTextColumn).toBe(true);
    expect(layout.textColWidth).toBeGreaterThan(0);
    // Grid width should be wider than 8 * cellSize
    expect(layout.gridWidth).toBe(layout.cellSize * 8 + layout.textColWidth);
  });

  it('grid width scales with input width', () => {
    const course = createCourse('Test');
    const narrow = computeGridLayout(course, 200, 'symbols');
    const wide = computeGridLayout(course, 800, 'symbols');
    expect(wide.cellSize).toBeGreaterThan(narrow.cellSize);
    expect(wide.gridWidth).toBeGreaterThan(narrow.gridWidth);
  });

  it('grid height scales with control count', () => {
    const course3 = createCourse('Test');
    addControlsToCourse(course3, 3);
    const course10 = createCourse('Test');
    addControlsToCourse(course10, 10);

    const layout3 = computeGridLayout(course3, 400, 'symbols');
    const layout10 = computeGridLayout(course10, 400, 'symbols');
    expect(layout10.gridHeight).toBeGreaterThan(layout3.gridHeight);
  });

  it('cell size is square (used for both width and height)', () => {
    const course = createCourse('Test');
    addControlsToCourse(course, 5);
    const layout = computeGridLayout(course, 400, 'symbols');
    expect(layout.gridHeight).toBe(layout.numRows * layout.cellSize);
  });
});
