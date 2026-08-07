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

// ---------------------------------------------------------------------------
// IOF v3 schema conformance (D3)
// ---------------------------------------------------------------------------

const NS = 'http://www.orienteering.org/datastandard/3.0';

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

describe('exportIofXml — IOF v3 conformance', () => {
  it('gives map-control definitions a `type` attribute, not a <Type> child', () => {
    const doc = parse(exportIofXml(makeEvent()));
    const rcd = doc.getElementsByTagNameNS(NS, 'RaceCourseData')[0]!;
    const controlDefs = Array.from(rcd.childNodes).filter(
      (n): n is Element => n.nodeType === 1 && (n as Element).localName === 'Control',
    );
    expect(controlDefs.length).toBe(4);
    for (const c of controlDefs) {
      expect(c.getAttribute('type')).toBeTruthy();
      expect(c.getElementsByTagNameNS(NS, 'Type').length).toBe(0);
    }
    const types = controlDefs.map((c) => c.getAttribute('type'));
    expect(types).toContain('Start');
    expect(types).toContain('Finish');
    expect(types).toContain('Control');
  });

  it('references controls via <CourseControl type><Control>id</Control>', () => {
    const doc = parse(exportIofXml(makeEvent()));
    const course = doc.getElementsByTagNameNS(NS, 'Course')[0]!;
    const ccs = Array.from(course.childNodes).filter(
      (n): n is Element => n.nodeType === 1 && (n as Element).localName === 'CourseControl',
    );
    expect(ccs.length).toBe(4);
    expect(ccs[0]!.getAttribute('type')).toBe('Start');
    expect(ccs[3]!.getAttribute('type')).toBe('Finish');
    // nested <Control> holds the id; no legacy <ControlId>
    expect(ccs[0]!.getElementsByTagNameNS(NS, 'Control')[0]?.textContent).toBe('S1');
    expect(course.getElementsByTagNameNS(NS, 'ControlId').length).toBe(0);
  });

  it('emits <Map><Scale> and <Course><Length>', () => {
    const doc = parse(exportIofXml(makeEvent()));
    expect(doc.getElementsByTagNameNS(NS, 'Scale')[0]?.textContent).toBe('10000');
    const len = doc.getElementsByTagNameNS(NS, 'Length')[0]?.textContent;
    expect(len && parseInt(len, 10)).toBeGreaterThan(0);
  });

  it('attaches LegLength to the leg INTO each control (start carries none)', () => {
    const doc = parse(exportIofXml(makeEvent()));
    const ccs = Array.from(
      doc.getElementsByTagNameNS(NS, 'Course')[0]!.getElementsByTagNameNS(NS, 'CourseControl'),
    );
    // 4 controls → 3 legs; the first (start) has no LegLength.
    expect(ccs[0]!.getElementsByTagNameNS(NS, 'LegLength').length).toBe(0);
    expect(ccs[1]!.getElementsByTagNameNS(NS, 'LegLength').length).toBe(1);
    expect(ccs[3]!.getElementsByTagNameNS(NS, 'LegLength').length).toBe(1);
    const total = doc.getElementsByTagNameNS(NS, 'LegLength').length;
    expect(total).toBe(3);
  });

  it('respects xs:sequence ordering (RaceCourseData, Course, CourseControl)', () => {
    const doc = parse(exportIofXml(makeEvent()));
    const childNames = (el: Element) =>
      Array.from(el.childNodes)
        .filter((n): n is Element => n.nodeType === 1)
        .map((n) => n.localName);

    // RaceCourseData: Map → Control(s) → Course(s)
    const rcd = doc.getElementsByTagNameNS(NS, 'RaceCourseData')[0]!;
    const rcdNames = childNames(rcd);
    expect(rcdNames.indexOf('Map')).toBeLessThan(rcdNames.indexOf('Control'));
    expect(rcdNames.lastIndexOf('Control')).toBeLessThan(rcdNames.indexOf('Course'));

    // Course: Name → Length → CourseControl(s)
    const course = doc.getElementsByTagNameNS(NS, 'Course')[0]!;
    const cNames = childNames(course);
    expect(cNames.indexOf('Name')).toBeLessThan(cNames.indexOf('Length'));
    expect(cNames.indexOf('Length')).toBeLessThan(cNames.indexOf('CourseControl'));

    // CourseControl: Control before LegLength
    const cc = course.getElementsByTagNameNS(NS, 'CourseControl')[1]!; // has a LegLength
    const ccNames = childNames(cc);
    expect(ccNames.indexOf('Control')).toBeLessThan(ccNames.indexOf('LegLength'));
  });

  it('does not emit the illegal MapExchange control type', () => {
    const event = makeEvent();
    event.courses[0]!.controls[2]!.type = 'mapExchange';
    const xml = exportIofXml(event);
    expect(xml).not.toContain('MapExchange');
    // mapExchange falls back to a plain Control type
    expect(xml).toContain('type="Control"');
  });

  it('places Score after Control in a score course', () => {
    const event = makeEvent();
    const course = event.courses[0]!;
    course.courseType = 'score';
    course.controls = course.controls.map((cc) => ({ ...cc, type: 'control', score: 30 }));
    const doc = parse(exportIofXml(event));
    const cc = doc.getElementsByTagNameNS(NS, 'CourseControl')[0]!;
    const names = Array.from(cc.childNodes)
      .filter((n): n is Element => n.nodeType === 1)
      .map((n) => n.localName);
    expect(names.indexOf('Control')).toBeLessThan(names.indexOf('Score'));
    // score courses have no ordered legs
    expect(doc.getElementsByTagNameNS(NS, 'LegLength').length).toBe(0);
  });
});
