import { describe, it, expect } from 'vitest';
import { importIofXml } from './import-xml';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const IOF_NS = 'http://www.orienteering.org/datastandard/3.0';

/** Minimal valid IOF XML v3 fixture with one course and three controls */
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CourseData xmlns="${IOF_NS}" iofVersion="3.0" createTime="2024-01-01T00:00:00Z" creator="Test">
  <Event>
    <Name>Sprint Test</Name>
  </Event>
  <RaceCourseData>
    <Control>
      <Id>S1</Id>
      <Type>Start</Type>
      <MapPosition x="26.458" y="79.375" unit="mm"/>
    </Control>
    <Control>
      <Id>42</Id>
      <Type>Control</Type>
      <MapPosition x="79.375" y="63.500" unit="mm"/>
    </Control>
    <Control>
      <Id>43</Id>
      <Type>Control</Type>
      <MapPosition x="158.750" y="42.333" unit="mm"/>
    </Control>
    <Control>
      <Id>F1</Id>
      <Type>Finish</Type>
      <MapPosition x="211.667" y="21.167" unit="mm"/>
    </Control>
    <Course>
      <Name>Course Alpha</Name>
      <Control>
        <ControlId>S1</ControlId>
      </Control>
      <Control>
        <ControlId>42</ControlId>
        <LegLength>185</LegLength>
      </Control>
      <Control>
        <ControlId>43</ControlId>
        <LegLength>220</LegLength>
      </Control>
      <Control>
        <ControlId>F1</ControlId>
        <LegLength>155</LegLength>
      </Control>
    </Course>
  </RaceCourseData>
</CourseData>`;

const TWO_COURSE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CourseData xmlns="${IOF_NS}" iofVersion="3.0" createTime="2024-01-01T00:00:00Z" creator="Test">
  <Event><Name>Two Courses</Name></Event>
  <RaceCourseData>
    <Control>
      <Id>S1</Id>
      <Type>Start</Type>
      <MapPosition x="10.0" y="50.0" unit="mm"/>
    </Control>
    <Control>
      <Id>31</Id>
      <Type>Control</Type>
      <MapPosition x="20.0" y="40.0" unit="mm"/>
    </Control>
    <Control>
      <Id>32</Id>
      <Type>Control</Type>
      <MapPosition x="30.0" y="30.0" unit="mm"/>
    </Control>
    <Control>
      <Id>F1</Id>
      <Type>Finish</Type>
      <MapPosition x="40.0" y="20.0" unit="mm"/>
    </Control>
    <Course>
      <Name>Short</Name>
      <Control><ControlId>S1</ControlId></Control>
      <Control><ControlId>31</ControlId></Control>
      <Control><ControlId>F1</ControlId></Control>
    </Course>
    <Course>
      <Name>Long</Name>
      <Control><ControlId>S1</ControlId></Control>
      <Control><ControlId>31</ControlId></Control>
      <Control><ControlId>32</ControlId></Control>
      <Control><ControlId>F1</ControlId></Control>
    </Course>
  </RaceCourseData>
</CourseData>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importIofXml', () => {
  it('throws on malformed XML', () => {
    expect(() => importIofXml('<broken><not xml', 96, 1000)).toThrow(/parse error/i);
  });

  it('returns empty result when RaceCourseData is missing', () => {
    const xml = `<?xml version="1.0"?>
<CourseData xmlns="${IOF_NS}" iofVersion="3.0">
  <Event><Name>Empty</Name></Event>
</CourseData>`;
    const result = importIofXml(xml, 96, 1000);
    expect(result.controls).toHaveLength(0);
    expect(result.courses).toHaveLength(0);
  });

  it('parses the correct number of controls', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    // Start(S1), 42, 43, Finish(F1) = 4 controls
    expect(result.controls).toHaveLength(4);
  });

  it('parses the correct number of courses', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    expect(result.courses).toHaveLength(1);
  });

  it('assigns course name', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    expect(result.courses[0]?.name).toBe('Course Alpha');
  });

  it('assigns correct control count per course', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    // Start + 2 controls + Finish = 4
    expect(result.courses[0]?.controls).toHaveLength(4);
  });

  it('assigns start type to first control', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    expect(result.courses[0]?.controls[0]?.type).toBe('start');
  });

  it('assigns finish type to last control', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    const controls = result.courses[0]?.controls ?? [];
    expect(controls[controls.length - 1]?.type).toBe('finish');
  });

  it('assigns control type to middle controls', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    expect(result.courses[0]?.controls[1]?.type).toBe('control');
    expect(result.courses[0]?.controls[2]?.type).toBe('control');
  });

  it('converts mm positions to pixels using dpi', () => {
    const dpi = 96;
    const mapHeightPx = 1000;
    const result = importIofXml(SAMPLE_XML, dpi, mapHeightPx);

    // S1 is at x=26.458mm → 26.458/25.4*96 ≈ 100px
    const s1Id = result.courses[0]!.controls[0]!.controlId;
    const s1 = result.controls.find((c) => c.id === s1Id)!;
    expect(s1.position.x).toBeCloseTo(100, 0);
  });

  it('maps Y directly (top-left origin, Y-down — no flip)', () => {
    const dpi = 96;
    const result = importIofXml(SAMPLE_XML, dpi);

    // S1 y=79.375mm → 79.375/25.4*96 = 300px from the top (Y-down, no flip)
    const s1Id = result.courses[0]!.controls[0]!.controlId;
    const s1 = result.controls.find((c) => c.id === s1Id)!;
    expect(s1.position.y).toBeCloseTo(300, 0);
  });

  it('assigns code 42 to control with IOF ID "42"', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    const cc = result.courses[0]!.controls[1]!;
    const ctrl = result.controls.find((c) => c.id === cc.controlId)!;
    expect(ctrl.code).toBe(42);
  });

  it('shares Control objects across two courses referencing the same IOF ID', () => {
    const result = importIofXml(TWO_COURSE_XML, 96, 1000);
    expect(result.courses).toHaveLength(2);

    // S1 is shared — both courses should reference the same controlId
    const s1InShort = result.courses[0]!.controls[0]!.controlId;
    const s1InLong = result.courses[1]!.controls[0]!.controlId;
    expect(s1InShort).toBe(s1InLong);
  });

  it('does not duplicate controls shared between courses', () => {
    const result = importIofXml(TWO_COURSE_XML, 96, 1000);
    // There are 4 unique controls across both courses (S1, 31, 32, F1)
    expect(result.controls).toHaveLength(4);
  });

  it('sets courseType to normal', () => {
    const result = importIofXml(SAMPLE_XML, 96, 1000);
    expect(result.courses[0]?.courseType).toBe('normal');
  });
});

// ---------------------------------------------------------------------------
// Real IOF v3 shape (D4): Control @type attribute + <CourseControl> wrappers
// ---------------------------------------------------------------------------

const REAL_V3_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CourseData xmlns="${IOF_NS}" iofVersion="3.0" createTime="2024-01-01T00:00:00Z" creator="PurplePen">
  <Event><Name>Real V3</Name></Event>
  <RaceCourseData>
    <Map><Scale>10000</Scale></Map>
    <Control type="Start">
      <Id>S1</Id>
      <MapPosition x="26.458" y="79.375" unit="mm"/>
    </Control>
    <Control type="Control">
      <Id>45</Id>
      <MapPosition x="79.375" y="63.500" unit="mm"/>
    </Control>
    <Control type="Finish">
      <Id>F1</Id>
      <MapPosition x="211.667" y="21.167" unit="mm"/>
    </Control>
    <Course>
      <Name>Blue</Name>
      <Length>1200</Length>
      <CourseControl type="Start"><Control>S1</Control></CourseControl>
      <CourseControl type="Control"><Control>45</Control><LegLength>600</LegLength></CourseControl>
      <CourseControl type="Finish"><Control>F1</Control><LegLength>600</LegLength></CourseControl>
    </Course>
  </RaceCourseData>
</CourseData>`;

describe('importIofXml — real IOF v3 files', () => {
  it('reads <Control type> attributes and <CourseControl> wrappers', () => {
    const result = importIofXml(REAL_V3_XML, 96, 1000);
    expect(result.courses).toHaveLength(1);
    const course = result.courses[0]!;
    expect(course.name).toBe('Blue');
    expect(course.controls.map((c) => c.type)).toEqual(['start', 'control', 'finish']);
    // control code 45 resolves
    const mid = result.controls.find((c) => c.id === course.controls[1]!.controlId)!;
    expect(mid.code).toBe(45);
  });

  it('does not import a real-v3 course as empty', () => {
    const result = importIofXml(REAL_V3_XML, 96, 1000);
    expect(result.courses[0]!.controls.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Export → import round trip
// ---------------------------------------------------------------------------

describe('IOF XML round trip', () => {
  it('preserves course structure through export then import', async () => {
    const { exportIofXml } = await import('./export-xml');
    const { createEvent, createCourse, createControl } = await import('@/core/models/defaults');

    const event = createEvent('Round Trip');
    event.mapFile = { name: 'm.ocd', type: 'raster', scale: 10000, dpi: 96 };
    const start = createControl(101, { x: 100, y: 900 });
    const c1 = createControl(45, { x: 300, y: 600 });
    const c2 = createControl(46, { x: 600, y: 400 });
    const finish = createControl(102, { x: 800, y: 200 });
    for (const c of [start, c1, c2, finish]) event.controls[c.id] = c;
    const course = createCourse('Green');
    course.controls = [
      { controlId: start.id, type: 'start' },
      { controlId: c1.id, type: 'control' },
      { controlId: c2.id, type: 'control' },
      { controlId: finish.id, type: 'finish' },
    ];
    event.courses.push(course);

    const xml = exportIofXml(event);
    const result = importIofXml(xml, 96);

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.name).toBe('Green');
    expect(result.courses[0]!.controls.map((c) => c.type)).toEqual([
      'start', 'control', 'control', 'finish',
    ]);

    // Regular control codes survive the round trip.
    const codes = result.courses[0]!.controls.map(
      (cc) => result.controls.find((c) => c.id === cc.controlId)!.code,
    );
    expect(codes[1]).toBe(45);
    expect(codes[2]).toBe(46);

    // Positions round-trip within rounding tolerance (3dp mm).
    const c1Back = result.controls.find((c) => c.code === 45)!;
    expect(c1Back.position.x).toBeCloseTo(300, 0);
    expect(c1Back.position.y).toBeCloseTo(600, 0);
  });
});
