import { describe, it, expect } from 'vitest';
import { exportIofXml } from './export-xml';
import type { OverprintEvent } from '@/core/models/types';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';

// ---------------------------------------------------------------------------
// Fixture builder helpers
// ---------------------------------------------------------------------------

function makeEvent(): OverprintEvent {
  const event = createEvent('Test Event');
  event.mapFile = { name: 'map.ocd', type: 'raster', scale: 10000, dpi: 96 };

  const start = createControl(101, { x: 100, y: 900 });
  const ctrl1 = createControl(42, { x: 300, y: 600 });
  const ctrl2 = createControl(43, { x: 600, y: 400 });
  const finish = createControl(102, { x: 800, y: 200 });

  event.controls[start.id] = start;
  event.controls[ctrl1.id] = ctrl1;
  event.controls[ctrl2.id] = ctrl2;
  event.controls[finish.id] = finish;

  const course = createCourse('Course A');
  course.controls = [
    { controlId: start.id, type: 'start' },
    { controlId: ctrl1.id, type: 'control' },
    { controlId: ctrl2.id, type: 'control' },
    { controlId: finish.id, type: 'finish' },
  ];
  event.courses.push(course);

  return event;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportIofXml', () => {
  it('returns a valid XML string with no parse errors', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const errors = doc.getElementsByTagName('parsererror');
    expect(errors.length).toBe(0);
  });

  it('root element is CourseData with correct IOF namespace', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const root = doc.documentElement;

    expect(root.localName).toBe('CourseData');
    expect(root.getAttribute('iofVersion')).toBe('3.0');
  });

  it('includes Event name', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const ns = 'http://www.orienteering.org/datastandard/3.0';
    const nameEl = doc.getElementsByTagNameNS(ns, 'Name')[0];

    expect(nameEl?.textContent).toBe('Test Event');
  });

  it('includes RaceCourseData with Control and Course elements', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const ns = 'http://www.orienteering.org/datastandard/3.0';

    const raceCourseData = doc.getElementsByTagNameNS(ns, 'RaceCourseData');
    expect(raceCourseData.length).toBe(1);

    // Should have Start (S1), two regular controls (42, 43) and Finish (F1)
    const controlEls = doc.getElementsByTagNameNS(ns, 'Control');
    // Control elements appear both in the control list and inside Course elements
    expect(controlEls.length).toBeGreaterThanOrEqual(4);
  });

  it('assigns S1 to start and F1 to finish', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    expect(xml).toContain('<Id>S1</Id>');
    expect(xml).toContain('<Id>F1</Id>');
    expect(xml).not.toContain('<Id>101</Id>');
    expect(xml).not.toContain('<Id>102</Id>');
  });

  it('assigns regular control code as string ID', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    expect(xml).toContain('<Id>42</Id>');
    expect(xml).toContain('<Id>43</Id>');
  });

  it('includes MapPosition with numeric x/y attributes', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    expect(xml).toContain('MapPosition');
    expect(xml).toContain('unit="mm"');
    // x for ctrl1 at x=300px, dpi=96: 300/96*25.4 ≈ 79.375
    expect(xml).toContain('x="79.375"');
  });

  it('includes Course name', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    expect(xml).toContain('<Name>Course A</Name>');
  });

  it('escapes XML special characters in event name', () => {
    const event = makeEvent();
    event.name = 'Tom & Jerry <Sprint>';
    const xml = exportIofXml(event);

    expect(xml).toContain('Tom &amp; Jerry &lt;Sprint&gt;');
    expect(xml).not.toContain('Tom & Jerry');
  });

  it('includes leg lengths inside Course control sequence', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    expect(xml).toContain('<LegLength>');
  });

  it('includes a createTime attribute on CourseData', () => {
    const event = makeEvent();
    const xml = exportIofXml(event);

    expect(xml).toMatch(/createTime="[0-9T:.Z-]+"/);
  });

  it('handles events with no mapFile without throwing', () => {
    const event = createEvent('Empty');
    const course = createCourse('Course 1');
    const ctrl = createControl(31, { x: 0, y: 0 });
    event.controls[ctrl.id] = ctrl;
    course.controls = [{ controlId: ctrl.id, type: 'control' }];
    event.courses.push(course);

    expect(() => exportIofXml(event)).not.toThrow();
  });

  it('deduplicates controls that appear in multiple courses', () => {
    const event = makeEvent();

    // Add a second course that shares one control with the first
    const sharedCtrlId = event.courses[0]!.controls[1]!.controlId; // ctrl1 (code 42)
    const course2 = createCourse('Course B');
    course2.controls = [
      { controlId: event.courses[0]!.controls[0]!.controlId, type: 'start' },
      { controlId: sharedCtrlId, type: 'control' },
      { controlId: event.courses[0]!.controls[3]!.controlId, type: 'finish' },
    ];
    event.courses.push(course2);

    const xml = exportIofXml(event);
    // The ID "42" should appear exactly once in the control list (in an <Id> tag)
    const idOccurrences = (xml.match(/<Id>42<\/Id>/g) ?? []).length;
    // One in the Control list and once per course reference = 1 + 2 = 3
    // But we only want one global Control definition; course refs use ControlId
    expect(idOccurrences).toBe(1);
  });
});
