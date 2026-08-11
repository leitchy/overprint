import { describe, it, expect } from 'vitest';
import { exportRelayIofXml } from './export-relay-xml';
import type { OverprintEvent } from '@/core/models/types';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';
import { asBranchId, asCourseControlId, asForkId } from '@/utils/id';

const NS = 'http://www.orienteering.org/datastandard/3.0';

/** Event with one 2-way forked course (branches x/y) + relay settings. */
function makeRelayEvent(teams = 6, legs = 3): { event: OverprintEvent; courseIndex: number } {
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
  return { event, courseIndex: 0 };
}

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

describe('exportRelayIofXml', () => {
  it('produces well-formed CourseData with the IOF namespace', () => {
    const { event, courseIndex } = makeRelayEvent();
    const xml = exportRelayIofXml(event, event.courses[courseIndex]!, 'FIXED');
    const doc = parse(xml);
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    expect(doc.documentElement.localName).toBe('CourseData');
    expect(doc.documentElement.getAttribute('iofVersion')).toBe('3.0');
  });

  it('RaceCourseData children are in schema order: Map, Control*, Course*, TeamCourseAssignment*', () => {
    const { event, courseIndex } = makeRelayEvent();
    const xml = exportRelayIofXml(event, event.courses[courseIndex]!, 'FIXED');
    const doc = parse(xml);
    const rcd = doc.getElementsByTagNameNS(NS, 'RaceCourseData')[0]!;
    const order = Array.from(rcd.children).map((c) => c.localName);
    const firstMap = order.indexOf('Map');
    const firstControl = order.indexOf('Control');
    const firstCourse = order.indexOf('Course');
    const firstTeam = order.indexOf('TeamCourseAssignment');
    expect(firstMap).toBeGreaterThanOrEqual(0);
    expect(firstControl).toBeGreaterThan(firstMap);
    expect(firstCourse).toBeGreaterThan(firstControl);
    expect(firstTeam).toBeGreaterThan(firstCourse);
    // No Course after the first TeamCourseAssignment.
    expect(order.lastIndexOf('Course')).toBeLessThan(firstTeam);
  });

  it('emits one TeamCourseAssignment per team with legs in order', () => {
    const { event, courseIndex } = makeRelayEvent(6, 3);
    const xml = exportRelayIofXml(event, event.courses[courseIndex]!, 'FIXED');
    const doc = parse(xml);
    const teams = doc.getElementsByTagNameNS(NS, 'TeamCourseAssignment');
    expect(teams.length).toBe(6);
    // First team: BibNumber, TeamName, then 3 TeamMemberCourseAssignment with Leg 1..3.
    const first = teams[0]!;
    expect(first.getElementsByTagNameNS(NS, 'BibNumber')[0]?.textContent).toBe('1');
    const members = first.getElementsByTagNameNS(NS, 'TeamMemberCourseAssignment');
    expect(members.length).toBe(3);
    const legNumbers = Array.from(members).map((m) => m.getElementsByTagNameNS(NS, 'Leg')[0]?.textContent);
    expect(legNumbers).toEqual(['1', '2', '3']);
  });

  it('every CourseName referenced by an assignment exists as a Course/Name', () => {
    const { event, courseIndex } = makeRelayEvent(8, 3);
    const xml = exportRelayIofXml(event, event.courses[courseIndex]!, 'FIXED');
    const doc = parse(xml);
    const courseNames = new Set(
      Array.from(doc.getElementsByTagNameNS(NS, 'Course')).map(
        (c) => c.getElementsByTagNameNS(NS, 'Name')[0]?.textContent ?? '',
      ),
    );
    const referenced = Array.from(doc.getElementsByTagNameNS(NS, 'CourseName')).map((c) => c.textContent ?? '');
    expect(referenced.length).toBeGreaterThan(0);
    for (const name of referenced) expect(courseNames.has(name)).toBe(true);
  });

  it('TeamMemberCourseAssignment child order is Leg, CourseName, CourseFamily', () => {
    const { event, courseIndex } = makeRelayEvent();
    const xml = exportRelayIofXml(event, event.courses[courseIndex]!, 'FIXED');
    const doc = parse(xml);
    const member = doc.getElementsByTagNameNS(NS, 'TeamMemberCourseAssignment')[0]!;
    expect(Array.from(member.children).map((c) => c.localName)).toEqual(['Leg', 'CourseName', 'CourseFamily']);
  });
});
