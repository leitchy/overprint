import { describe, it, expect } from 'vitest';
import { serializeEvent, deserializeEvent } from './overprint-format';
import { createEvent, createControl, createCourse, makeCourseControl } from '@/core/models/defaults';
import type { OverprintEvent } from '@/core/models/types';
import { generateForkId, generateBranchId } from '@/utils/id';

function makeTestEvent(): OverprintEvent {
  const event = createEvent('Test Event');
  const course = createCourse('Long');
  const control1 = createControl(31, { x: 100, y: 200 });
  const control2 = createControl(32, { x: 300, y: 400 });

  event.controls[control1.id] = control1;
  event.controls[control2.id] = control2;

  course.controls.push(
    { controlId: control1.id, type: 'start' },
    { controlId: control2.id, type: 'finish' },
  );
  event.courses.push(course);

  return event;
}

describe('serializeEvent', () => {
  it('produces valid JSON with envelope', () => {
    const event = makeTestEvent();
    const json = serializeEvent(event);
    const parsed = JSON.parse(json);

    expect(parsed.formatId).toBe('overprint');
    expect(parsed.version).toBe(event.version);
    expect(parsed.event).toBeDefined();
  });

  it('includes event name', () => {
    const event = makeTestEvent();
    const json = serializeEvent(event);
    const parsed = JSON.parse(json);
    expect(parsed.event.name).toBe('Test Event');
  });

  it('includes courses and controls', () => {
    const event = makeTestEvent();
    const json = serializeEvent(event);
    const parsed = JSON.parse(json);
    expect(parsed.event.courses).toHaveLength(1);
    expect(Object.keys(parsed.event.controls)).toHaveLength(2);
  });

  it('includes embedded map image when provided', () => {
    const event = makeTestEvent();
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const json = serializeEvent(event, dataUrl);
    const parsed = JSON.parse(json);
    expect(parsed.embeddedMapImage).toBe(dataUrl);
  });

  it('omits embedded map image when not provided', () => {
    const event = makeTestEvent();
    const json = serializeEvent(event);
    const parsed = JSON.parse(json);
    expect(parsed.embeddedMapImage).toBeUndefined();
  });
});

describe('deserializeEvent', () => {
  it('round-trips correctly', () => {
    const original = makeTestEvent();
    const json = serializeEvent(original);
    const { event: restored } = deserializeEvent(json);

    expect(restored.name).toBe(original.name);
    expect(restored.id).toBe(original.id);
    expect(restored.courses).toHaveLength(1);
    expect(Object.keys(restored.controls)).toHaveLength(2);
  });

  it('restores control codes', () => {
    const original = makeTestEvent();
    const json = serializeEvent(original);
    const { event: restored } = deserializeEvent(json);

    const codes = Object.values(restored.controls).map((c) => c.code).sort();
    expect(codes).toEqual([31, 32]);
  });

  it('restores course control references', () => {
    const original = makeTestEvent();
    const json = serializeEvent(original);
    const { event: restored } = deserializeEvent(json);

    const course = restored.courses[0]!;
    expect(course.controls).toHaveLength(2);
    expect(course.controls[0]?.type).toBe('start');
    expect(course.controls[1]?.type).toBe('finish');

    // Control IDs in course should reference existing controls
    for (const cc of course.controls) {
      expect(restored.controls[cc.controlId]).toBeDefined();
    }
  });

  it('round-trips a loop generator (kind, entry geometry, ids)', () => {
    const event = createEvent('Loop Event');
    const course = createCourse('Butterfly');
    const start = createControl(31, { x: 0, y: 0 });
    const hub = createControl(32, { x: 100, y: 0 });
    const finish = createControl(33, { x: 200, y: 0 });
    const loopCtrl = createControl(34, { x: 100, y: 100 });
    for (const c of [start, hub, finish, loopCtrl]) event.controls[c.id] = c;
    const hubCC = makeCourseControl(hub.id, 'control');
    course.controls.push(
      makeCourseControl(start.id, 'start'),
      hubCC,
      makeCourseControl(finish.id, 'finish'),
    );
    course.variations = [{
      id: generateForkId(),
      kind: 'loop',
      anchorCourseControlId: hubCC.courseControlId!,
      branches: [
        { id: generateBranchId(), label: 'A', entryBendPoints: [{ x: 50, y: 50 }], controls: [makeCourseControl(loopCtrl.id, 'control')] },
        { id: generateBranchId(), label: 'B', controls: [makeCourseControl(loopCtrl.id, 'control')] },
      ],
    }];
    event.courses.push(course);

    const { event: restored } = deserializeEvent(serializeEvent(event));
    const rv = restored.courses[0]!.variations!;
    expect(rv).toHaveLength(1);
    expect(rv[0]!.kind).toBe('loop');
    expect(rv[0]!.branches.map((b) => b.label)).toEqual(['A', 'B']);
    expect(rv[0]!.branches[0]!.entryBendPoints).toEqual([{ x: 50, y: 50 }]);
    // Anchor id is re-branded but still resolves to a trunk control.
    expect(restored.courses[0]!.controls.some((cc) => cc.courseControlId === rv[0]!.anchorCourseControlId)).toBe(true);
  });

  it('restores settings with defaults', () => {
    const original = makeTestEvent();
    const json = serializeEvent(original);
    const { event: restored } = deserializeEvent(json);

    expect(restored.settings.printScale).toBe(15000);
    expect(restored.settings.pageSetup.paperSize).toBe('A4');
  });

  it('rejects invalid format ID', () => {
    const json = JSON.stringify({ formatId: 'wrong', version: '0.1.0', event: {} });
    expect(() => deserializeEvent(json)).toThrow('Invalid .overprint file');
  });

  it('rejects unsupported major version', () => {
    const json = JSON.stringify({ formatId: 'overprint', version: '1.0.0', event: {} });
    expect(() => deserializeEvent(json)).toThrow('Unsupported .overprint version');
  });

  it('accepts same major version with higher minor', () => {
    const event = makeTestEvent();
    const envelope = { formatId: 'overprint', version: '0.9.0', event };
    const json = JSON.stringify(envelope);
    expect(() => deserializeEvent(json)).not.toThrow();
  });

  it('applies defaults for missing settings fields', () => {
    const event = makeTestEvent();
    // Simulate old format without pageSetup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = JSON.parse(serializeEvent(event)) as any;
    delete raw.event.settings.pageSetup;
    const json = JSON.stringify(raw);

    const { event: restored } = deserializeEvent(json);
    expect(restored.settings.pageSetup.paperSize).toBe('A4');
    expect(restored.settings.pageSetup.margins.top).toBe(10);
  });

  it('returns embedded map image when present', () => {
    const event = makeTestEvent();
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const json = serializeEvent(event, dataUrl);
    const { embeddedMapImage } = deserializeEvent(json);
    expect(embeddedMapImage).toBe(dataUrl);
  });

  it('returns undefined embedded image when not present', () => {
    const event = makeTestEvent();
    const json = serializeEvent(event);
    const { embeddedMapImage } = deserializeEvent(json);
    expect(embeddedMapImage).toBeUndefined();
  });
});

describe('serializeEvent — round-trips newer fields', () => {
  it('preserves control-circle gaps, marked-route line style, white-out items and column-F text', () => {
    const event = createEvent('Round Trip');
    const start = createControl(31, { x: 10, y: 20 });
    const finish = createControl(32, { x: 300, y: 400 });
    // control-circle gaps + free-text column F
    finish.circleGaps = [{ startDeg: 75, endDeg: 105 }];
    finish.description.columnFText = '2.5';
    event.controls[start.id] = start;
    event.controls[finish.id] = finish;
    const course = createCourse('Long');
    course.controls.push(
      { controlId: start.id, type: 'start' },
      { controlId: finish.id, type: 'finish' },
    );
    event.courses.push(course);
    // marked-route (dashed) line + white-out mask as special items
    event.specialItems.push(
      { id: 'l1' as never, type: 'line', position: { x: 0, y: 0 }, endPosition: { x: 50, y: 0 }, lineStyle: 'dashed' },
      { id: 'w1' as never, type: 'whiteOut', position: { x: 5, y: 5 }, endPosition: { x: 40, y: 30 } },
    );

    const { event: r } = deserializeEvent(serializeEvent(event));

    const restoredFinish = Object.values(r.controls).find((c) => c.code === 32)!;
    expect(restoredFinish.circleGaps).toEqual([{ startDeg: 75, endDeg: 105 }]);
    expect(restoredFinish.description.columnFText).toBe('2.5');

    const line = r.specialItems.find((s) => s.type === 'line');
    expect(line && line.type === 'line' && line.lineStyle).toBe('dashed');
    expect(r.specialItems.some((s) => s.type === 'whiteOut')).toBe(true);
  });
});

describe('deserializeEvent — legacy dangerous-area migration', () => {
  it('gives a legacy dangerous-area point default polygon vertices', () => {
    // Hand-crafted legacy envelope: dangerousArea as a point (no vertices).
    const legacy = JSON.stringify({
      formatId: 'overprint',
      version: '0.19.0',
      event: {
        id: 'e1', name: 'Legacy', mapFile: null, courses: [], controls: {},
        settings: {}, specialItems: [
          { id: 's1', type: 'dangerousArea', position: { x: 100, y: 100 } },
        ], version: '0.19.0',
      },
    });
    const { event } = deserializeEvent(legacy);
    const item = event.specialItems[0]!;
    expect(item.type).toBe('dangerousArea');
    expect('vertices' in item && Array.isArray(item.vertices) && item.vertices.length).toBeGreaterThanOrEqual(3);
  });
});

describe('deserializeEvent — E10 fork/variation migration', () => {
  it('backfills a stable courseControlId on legacy course controls', () => {
    const legacy = JSON.stringify({
      formatId: 'overprint',
      version: '0.24.0',
      event: {
        id: 'e1', name: 'Legacy', mapFile: null,
        controls: { c1: { id: 'c1', code: 31, position: { x: 0, y: 0 }, description: { columnD: '' } } },
        courses: [{
          id: 'co1', name: 'A', courseType: 'normal',
          controls: [{ controlId: 'c1', type: 'start' }], // no courseControlId
          settings: {},
        }],
        settings: {}, specialItems: [], version: '0.24.0',
      },
    });
    const { event } = deserializeEvent(legacy);
    const cc = event.courses[0]!.controls[0]!;
    expect(cc.courseControlId).toBeDefined();
    expect(typeof cc.courseControlId).toBe('string');
  });

  it('round-trips a course with a fork and restores nested ids', () => {
    const withFork = JSON.stringify({
      formatId: 'overprint',
      version: '0.24.2',
      event: {
        id: 'e1', name: 'Forked', mapFile: null,
        controls: {
          c1: { id: 'c1', code: 31, position: { x: 0, y: 0 }, description: { columnD: '' } },
          c2: { id: 'c2', code: 32, position: { x: 10, y: 0 }, description: { columnD: '' } },
          c3: { id: 'c3', code: 33, position: { x: 20, y: 0 }, description: { columnD: '' } },
        },
        courses: [{
          id: 'co1', name: 'A', courseType: 'normal',
          controls: [
            { courseControlId: 'cc-start', controlId: 'c1', type: 'start' },
            { courseControlId: 'cc-anchor', controlId: 'c2', type: 'control' },
            { courseControlId: 'cc-finish', controlId: 'c3', type: 'finish' },
          ],
          settings: {},
          variations: [{
            id: 'f1', kind: 'fork', anchorCourseControlId: 'cc-anchor',
            branches: [
              { id: 'b1', label: 'A', controls: [{ controlId: 'c1', type: 'control' }] },
              { id: 'b2', label: 'B', controls: [{ controlId: 'c3', type: 'control' }] },
            ],
          }],
        }],
        settings: {}, specialItems: [], version: '0.24.2',
      },
    });
    const { event } = deserializeEvent(withFork);
    const fork = event.courses[0]!.variations![0]!;
    expect(fork.id).toBe('f1');
    expect(fork.anchorCourseControlId).toBe('cc-anchor');
    expect(fork.branches).toHaveLength(2);
    expect(fork.branches[0]!.label).toBe('A');
    // branch controls get a backfilled courseControlId
    expect(fork.branches[0]!.controls[0]!.courseControlId).toBeDefined();
  });

  it('leaves simple courses without a variations field', () => {
    const { event } = deserializeEvent(serializeEvent(makeTestEvent()));
    expect(event.courses[0]!.variations).toBeUndefined();
  });
});
