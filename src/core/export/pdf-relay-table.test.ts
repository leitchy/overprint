import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateRelayTablePdf } from './pdf-relay-table';
import type { OverprintEvent } from '@/core/models/types';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';
import { asBranchId, asCourseControlId, asForkId } from '@/utils/id';

function makeRelayEvent(teams: number, legs: number): OverprintEvent {
  const event = createEvent('Relay Event');
  event.mapFile = { name: 'map.ocd', type: 'raster', scale: 10000, dpi: 96 };
  const start = createControl(101, { x: 100, y: 900 });
  const a = createControl(42, { x: 300, y: 600 });
  const b = createControl(43, { x: 600, y: 400 });
  const finish = createControl(102, { x: 800, y: 200 });
  const x = createControl(51, { x: 350, y: 550 });
  const y = createControl(52, { x: 400, y: 500 });
  for (const c of [start, a, b, finish, x, y]) event.controls[c.id] = c;

  const course = createCourse('Course A');
  course.controls = [
    { controlId: start.id, type: 'start', courseControlId: asCourseControlId('cc-s') },
    { controlId: a.id, type: 'control', courseControlId: asCourseControlId('cc-a') },
    { controlId: b.id, type: 'control', courseControlId: asCourseControlId('cc-b') },
    { controlId: finish.id, type: 'finish', courseControlId: asCourseControlId('cc-f') },
  ];
  course.variations = [
    {
      id: asForkId('f1'),
      kind: 'fork',
      anchorCourseControlId: asCourseControlId('cc-a'),
      branches: [
        { id: asBranchId('b1'), label: 'A', controls: [{ controlId: x.id, type: 'control', courseControlId: asCourseControlId('cc-x') }] },
        { id: asBranchId('b2'), label: 'B', controls: [{ controlId: y.id, type: 'control', courseControlId: asCourseControlId('cc-y') }] },
      ],
    },
  ];
  course.relay = { firstTeamNumber: 1, teams, legs };
  event.courses.push(course);
  return event;
}

async function pageCount(blob: Blob): Promise<number> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe('generateRelayTablePdf', () => {
  it('produces a non-empty PDF blob', async () => {
    const event = makeRelayEvent(6, 3);
    const { blob, suggestedName } = await generateRelayTablePdf(event, 0);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
    expect(suggestedName).toMatch(/relay\.pdf$/);
  });

  it('paginates: many teams need more pages than few teams', async () => {
    const few = await generateRelayTablePdf(makeRelayEvent(4, 3), 0);
    const many = await generateRelayTablePdf(makeRelayEvent(120, 3), 0);
    const fewPages = await pageCount(few.blob);
    const manyPages = await pageCount(many.blob);
    expect(fewPages).toBe(1);
    expect(manyPages).toBeGreaterThan(1);
  });
});
