import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateRelayTablePdf } from './pdf-relay-table';
import { pageContentText, pdfHexText } from './__test-utils__/pdf-inspect';
import { assignRelayTeams } from '@/core/models/relay-assignment';
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

describe('generateRelayTablePdf — grid content', () => {
  // drawCell → drawRectangle: filled header cells end in `B` (fill+stroke), stroked
  // data cells in `S`. One per cell, so B+S standalone ops = cells drawn on the page.
  const cellRects = (content: string) =>
    content.split('\n').filter((l) => l.trim() === 'B' || l.trim() === 'S').length;
  const decoded = (doc: PDFDocument, page: number) => pdfHexText(pageContentText(doc, page));

  it('lays out every (team, leg) cell plus the header row on a single page', async () => {
    const teams = 4;
    const legs = 3;
    const { blob } = await generateRelayTablePdf(makeRelayEvent(teams, legs), 0);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
    // (teams + header) rows × (Team column + legs) columns.
    expect(cellRects(pageContentText(doc, 0))).toBe((teams + 1) * (legs + 1));
  });

  it('renders the header labels, every team number, and the assigned variation codes', async () => {
    const event = makeRelayEvent(4, 3);
    const { blob } = await generateRelayTablePdf(event, 0);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const text = decoded(doc, 0);

    expect(text).toContain('Team');
    expect(text).toContain('Leg 1');
    expect(text).toContain('Leg 3');

    // Ground truth: the same assignment the renderer computes internally.
    const course = event.courses[0]!;
    const assignment = assignRelayTeams(course, event.controls, course.relay!);
    for (const team of assignment.teams) {
      expect(text).toContain(String(team.teamNumber)); // row present
    }
    const distinctCodes = new Set(assignment.teams.flatMap((t) => t.legs));
    for (const code of distinctCodes) {
      expect(text).toContain(code); // every assigned variation code is rendered
    }
  });

  it('repeats the header row on each page when teams overflow', async () => {
    const legs = 3;
    const { blob } = await generateRelayTablePdf(makeRelayEvent(120, legs), 0);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const pages = doc.getPageCount();
    expect(pages).toBeGreaterThan(1);
    expect(decoded(doc, pages - 1)).toContain('Team'); // header redrawn on the last page
  });

  it('teams = 0 draws only the header row (no team rows)', async () => {
    const legs = 3;
    const { blob } = await generateRelayTablePdf(makeRelayEvent(0, legs), 0);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(cellRects(pageContentText(doc, 0))).toBe(legs + 1); // header only
  });
});
