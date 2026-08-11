/**
 * IOF XML v3 relay team-assignment export (E10 Phase 3).
 *
 * Produces a **self-contained** `CourseData` document for ONE relay course:
 * `<Map>` → `<Control>`* → `<Course>`* (one per enumerated variation) →
 * `<TeamCourseAssignment>`* — the strict `RaceCourseData` child order required by
 * the IOF 3.0 schema. The assignment references each variation `<Course>` by name
 * via `<CourseName>`, so the Map/Control/Course definitions MUST be present for an
 * importer (PurplePen / OE2010 / MeOS) to resolve the courses to real geometry.
 *
 * Uses the UNCAPPED variation decoder (`choiceVectorToVariation`) so every variation
 * `<Course>` exists even when the course has > MAX_VARIATIONS combinations.
 */
import type { Course, OverprintEvent } from '@/core/models/types';
import {
  resolveGenerators,
  decodeChoice,
  variationCode,
  choiceVectorToVariation,
} from '@/core/models/variation-enumerator';
import { assignRelayTeams } from '@/core/models/relay-assignment';
import { IOF_XML_NS, IOF_XML_VERSION } from './xml-constants';
import {
  escapeXml,
  buildCourseElement,
  buildMapElement,
  collectControlElements,
} from './export-xml';

/** The variation course name IOF references: "<course> <code>", or the base name for code ''. */
function variationCourseName(courseName: string, code: string): string {
  return code ? `${courseName} ${code}` : courseName;
}

/**
 * Serialise a relay course's team assignments to an IOF XML v3 `CourseData` string.
 * The course must carry `relay` settings; returns a valid (if empty-of-teams)
 * document otherwise.
 */
export function exportRelayIofXml(
  event: OverprintEvent,
  course: Course,
  createTime: string = new Date().toISOString(),
): string {
  const dpi = event.mapFile?.dpi ?? 96;
  const scale = event.mapFile?.scale ?? 15000;
  const georef = event.mapFile?.georef;

  const settings = course.relay ?? { firstTeamNumber: 1, teams: 0, legs: 1 };
  const assignment = assignRelayTeams(course, event.controls, settings);

  // Enumerate ALL variations (uncapped) → one <Course> each, grouped by family.
  const { generators } = resolveGenerators(course);
  const dims = generators.map((g) => g.dim);
  const total = dims.reduce((acc, d) => acc * d, 1);
  const family = total > 1 ? course.name : undefined;

  const courseElements: string[] = [];
  for (let k = 0; k < total; k++) {
    const choice = decodeChoice(k, dims);
    const code = variationCode(generators, choice);
    const controls = generators.length > 0 ? choiceVectorToVariation(course, generators, choice) : course.controls;
    const synthetic: Course = {
      ...course,
      name: variationCourseName(course.name, code),
      controls,
      variations: undefined,
      relay: undefined,
    };
    courseElements.push(buildCourseElement(synthetic, event.controls, dpi, scale, family));
  }

  // One <TeamCourseAssignment> per team, referencing variation courses by name.
  const teamElements = assignment.teams.map((team) => {
    const lines: string[] = [
      `    <TeamCourseAssignment>`,
      `      <BibNumber>${team.teamNumber}</BibNumber>`,
      `      <TeamName>${escapeXml(`Team ${team.teamNumber}`)}</TeamName>`,
    ];
    team.legs.forEach((code, legIndex) => {
      lines.push(`      <TeamMemberCourseAssignment>`);
      lines.push(`        <Leg>${legIndex + 1}</Leg>`);
      lines.push(`        <CourseName>${escapeXml(variationCourseName(course.name, code))}</CourseName>`);
      lines.push(`        <CourseFamily>${escapeXml(course.name)}</CourseFamily>`);
      lines.push(`      </TeamMemberCourseAssignment>`);
    });
    lines.push(`    </TeamCourseAssignment>`);
    return lines.join('\n');
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<CourseData xmlns="${IOF_XML_NS}" iofVersion="${IOF_XML_VERSION}" createTime="${createTime}" creator="Overprint">`,
    `  <Event>`,
    `    <Name>${escapeXml(event.name)}</Name>`,
    `  </Event>`,
    `  <RaceCourseData>`,
    buildMapElement(event.controls, dpi, scale),
    collectControlElements([course], event.controls, dpi, georef),
    courseElements.join('\n'),
    teamElements.join('\n'),
    `  </RaceCourseData>`,
    `</CourseData>`,
  ].join('\n');
}
