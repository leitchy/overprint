import { describe, it, expect } from 'vitest';
import { serializeEvent, deserializeEvent } from './overprint-format';
import { createEvent, createControl, createCourse } from '@/core/models/defaults';
import type { OverprintEvent } from '@/core/models/types';

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
