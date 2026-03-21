import { describe, it, expect } from 'vitest';
import { importPpen } from './import-ppen';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DPI = 96;
const MAP_HEIGHT_PX = 1000;

function mmToPx(mm: number): number {
  return (mm / 25.4) * DPI;
}

function yFlip(yMm: number): number {
  return MAP_HEIGHT_PX - mmToPx(yMm);
}

// ---------------------------------------------------------------------------
// Minimal inline fixture
// ---------------------------------------------------------------------------

const MINIMAL_PPEN = `<course-scribe-event>
  <event id="1">
    <title>Test Event</title>
    <map kind="OCAD" scale="10000">TestMap.ocd</map>
    <standards map="2017" description="2018" />
    <all-controls print-scale="10000" description-kind="symbols" />
    <print-area automatic="true" left="0" top="200" right="300" bottom="0" page-width="827" page-height="1169" page-margins="0" page-landscape="false" />
    <numbering start="31" disallow-invertible="false" />
    <course-appearance scale-sizes="RelativeToMap" blend-purple="true" />
    <descriptions lang="en" color="black" />
  </event>
  <control id="1" kind="start">
    <location x="50.0" y="150.0" />
  </control>
  <control id="2" kind="finish">
    <location x="200.0" y="50.0" />
    <description box="all" iof-2004-ref="14.3" />
  </control>
  <control id="3" kind="normal">
    <code>31</code>
    <location x="100.0" y="120.0" />
    <description box="D" iof-2004-ref="5.2" />
    <description box="E" iof-2004-ref="5.2" />
    <description box="F" iof-2004-ref="10.1" />
  </control>
  <control id="4" kind="normal">
    <code>32</code>
    <location x="150.0" y="80.0" />
    <description box="D" iof-2004-ref="1.3" />
    <description box="G" iof-2004-ref="11.1N" />
  </control>
  <course id="1" kind="normal" order="1">
    <name>Long</name>
    <labels label-kind="sequence" />
    <first course-control="10" />
    <print-area automatic="true" left="10" top="180" right="250" bottom="20" page-width="827" page-height="1169" page-margins="0" page-landscape="false" />
    <options print-scale="10000" description-kind="symbols" />
  </course>
  <course id="2" kind="normal" order="2">
    <name>Short</name>
    <labels label-kind="code" />
    <first course-control="20" />
    <options print-scale="10000" description-kind="symbols-and-text" />
  </course>
  <course-control id="10" control="1">
    <next course-control="11" />
  </course-control>
  <course-control id="11" control="3">
    <next course-control="12" />
  </course-control>
  <course-control id="12" control="4">
    <next course-control="13" />
  </course-control>
  <course-control id="13" control="2" />
  <course-control id="20" control="1">
    <next course-control="21" />
  </course-control>
  <course-control id="21" control="3">
    <next course-control="22" />
  </course-control>
  <course-control id="22" control="2" />
  <leg id="1" start-control="1" end-control="3">
    <bends>
      <location x="75.0" y="140.0" />
    </bends>
  </leg>
  <special-object id="1" kind="descriptions">
    <location x="220.0" y="160.0" />
    <location x="260.0" y="160.0" />
    <courses>
      <course course="1" />
    </courses>
  </special-object>
</course-scribe-event>`;

// ---------------------------------------------------------------------------
// Tests: basic parsing
// ---------------------------------------------------------------------------

describe('importPpen', () => {
  it('throws on malformed XML', () => {
    expect(() => importPpen('<broken><not xml', DPI, MAP_HEIGHT_PX)).toThrow(/parse error/i);
  });

  it('throws on non-ppen XML', () => {
    expect(() => importPpen('<root/>', DPI, MAP_HEIGHT_PX)).toThrow(/Not a PurplePen file/);
  });

  it('throws on missing event element', () => {
    expect(() => importPpen('<course-scribe-event></course-scribe-event>', DPI, MAP_HEIGHT_PX))
      .toThrow(/missing <event>/);
  });

  it('parses event title', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.name).toBe('Test Event');
  });

  it('extracts map filename', () => {
    const { mapFileName } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(mapFileName).toBe('TestMap.ocd');
  });

  it('parses map metadata', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.mapFile?.type).toBe('ocad');
    expect(event.mapFile?.scale).toBe(10000);
  });

  it('parses event settings from standards element', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.settings.mapStandard).toBe('ISOM2017');
    expect(event.settings.descriptionStandard).toBe('2018');
  });

  it('parses event print scale', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.settings.printScale).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// Tests: controls
// ---------------------------------------------------------------------------

describe('importPpen — controls', () => {
  it('parses correct number of controls', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(Object.keys(event.controls)).toHaveLength(4);
  });

  it('assigns synthetic code 1 to start control', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const start = Object.values(event.controls).find(c => c.code === 1);
    expect(start).toBeDefined();
  });

  it('assigns synthetic code 2 to finish control', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const finish = Object.values(event.controls).find(c => c.code === 2);
    expect(finish).toBeDefined();
  });

  it('parses normal control codes', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const codes = Object.values(event.controls).map(c => c.code).sort((a, b) => a - b);
    expect(codes).toEqual([1, 2, 31, 32]);
  });

  it('converts mm coordinates to pixels', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const ctrl31 = Object.values(event.controls).find(c => c.code === 31)!;
    expect(ctrl31.position.x).toBeCloseTo(mmToPx(100.0), 1);
  });

  it('flips Y axis correctly', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const ctrl31 = Object.values(event.controls).find(c => c.code === 31)!;
    expect(ctrl31.position.y).toBeCloseTo(yFlip(120.0), 1);
  });

  it('parses description columns from iof-2004-ref', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const ctrl31 = Object.values(event.controls).find(c => c.code === 31)!;
    expect(ctrl31.description.columnD).toBe('5.2');
    expect(ctrl31.description.columnE).toBe('5.2');
    expect(ctrl31.description.columnF).toBe('10.1');
  });

  it('parses compass-suffixed description refs', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const ctrl32 = Object.values(event.controls).find(c => c.code === 32)!;
    expect(ctrl32.description.columnG).toBe('11.1N');
  });

  it('maps box="all" to columnH for finish controls', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const finish = Object.values(event.controls).find(c => c.code === 2)!;
    expect(finish.description.columnH).toBe('14.3');
  });
});

// ---------------------------------------------------------------------------
// Tests: courses
// ---------------------------------------------------------------------------

describe('importPpen — courses', () => {
  it('parses correct number of courses', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.courses).toHaveLength(2);
  });

  it('parses course names', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.courses[0]!.name).toBe('Long');
    expect(event.courses[1]!.name).toBe('Short');
  });

  it('walks linked list to produce correct control sequence for Long course', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const longCourse = event.courses[0]!;
    expect(longCourse.controls).toHaveLength(4);
    expect(longCourse.controls[0]!.type).toBe('start');
    expect(longCourse.controls[1]!.type).toBe('control');
    expect(longCourse.controls[2]!.type).toBe('control');
    expect(longCourse.controls[3]!.type).toBe('finish');
  });

  it('walks linked list to produce correct control sequence for Short course', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const shortCourse = event.courses[1]!;
    expect(shortCourse.controls).toHaveLength(3);
    expect(shortCourse.controls[0]!.type).toBe('start');
    expect(shortCourse.controls[1]!.type).toBe('control');
    expect(shortCourse.controls[2]!.type).toBe('finish');
  });

  it('shares controls across courses', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    // Start control is shared between Long and Short
    const longStart = event.courses[0]!.controls[0]!.controlId;
    const shortStart = event.courses[1]!.controls[0]!.controlId;
    expect(longStart).toBe(shortStart);
  });

  it('parses course settings', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.courses[0]!.settings.printScale).toBe(10000);
    expect(event.courses[0]!.settings.labelMode).toBe('sequence');
    expect(event.courses[0]!.settings.descriptionAppearance).toBe('symbols');
  });

  it('parses description-kind symbols-and-text', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.courses[1]!.settings.descriptionAppearance).toBe('symbolsAndText');
  });

  it('parses label-kind code', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.courses[1]!.settings.labelMode).toBe('code');
  });

  it('parses print area bounds', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const pa = event.courses[0]!.settings.printArea;
    expect(pa).toBeDefined();
    expect(pa!.minX).toBeGreaterThan(0);
    expect(pa!.maxX).toBeGreaterThan(pa!.minX);
  });
});

// ---------------------------------------------------------------------------
// Tests: legs
// ---------------------------------------------------------------------------

describe('importPpen — legs', () => {
  it('attaches bend points to the correct course-control', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    // Leg from control 1 (start) to control 3 (code 31) has one bend point
    const longCourse = event.courses[0]!;
    const startCc = longCourse.controls[0]!; // start → ctrl 31
    expect(startCc.bendPoints).toHaveLength(1);
    expect(startCc.bendPoints![0]!.x).toBeCloseTo(mmToPx(75.0), 1);
  });

  it('attaches bend points to matching legs in multiple courses', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    // Same leg (start → ctrl 31) also exists in Short course
    const shortCourse = event.courses[1]!;
    const startCc = shortCourse.controls[0]!;
    expect(startCc.bendPoints).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: special objects
// ---------------------------------------------------------------------------

describe('importPpen — special objects', () => {
  it('parses description box special objects', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.specialItems).toHaveLength(1);
    expect(event.specialItems[0]!.type).toBe('descriptionBox');
  });

  it('assigns course IDs to special objects', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const item = event.specialItems[0]!;
    expect(item.courseIds).toHaveLength(1);
    expect(item.courseIds![0]).toBe(event.courses[0]!.id);
  });

  it('converts special object positions', () => {
    const { event } = importPpen(MINIMAL_PPEN, DPI, MAP_HEIGHT_PX);
    const item = event.specialItems[0]!;
    expect(item.position.x).toBeCloseTo(mmToPx(220.0), 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: defensive parsing
// ---------------------------------------------------------------------------

describe('importPpen — defensive parsing', () => {
  it('detects cycles in course-control linked list', () => {
    const cycleXml = `<course-scribe-event>
      <event id="1">
        <title>Cycle Test</title>
        <map kind="OCAD" scale="5000">test.ocd</map>
        <standards map="2017" description="2018" />
        <all-controls print-scale="5000" />
        <descriptions lang="en" />
      </event>
      <control id="1" kind="start"><location x="10" y="10" /></control>
      <control id="2" kind="normal"><code>31</code><location x="20" y="20" /></control>
      <course id="1" kind="normal"><name>Cycle</name><first course-control="1" /></course>
      <course-control id="1" control="1"><next course-control="2" /></course-control>
      <course-control id="2" control="2"><next course-control="1" /></course-control>
    </course-scribe-event>`;

    const { warnings } = importPpen(cycleXml, DPI, MAP_HEIGHT_PX);
    expect(warnings.some(w => w.type === 'cycle')).toBe(true);
  });

  it('handles broken links gracefully', () => {
    const brokenXml = `<course-scribe-event>
      <event id="1">
        <title>Broken Link</title>
        <map kind="OCAD" scale="5000">test.ocd</map>
        <standards map="2017" description="2018" />
        <all-controls print-scale="5000" />
        <descriptions lang="en" />
      </event>
      <control id="1" kind="start"><location x="10" y="10" /></control>
      <control id="2" kind="normal"><code>31</code><location x="20" y="20" /></control>
      <course id="1" kind="normal"><name>Broken</name><first course-control="1" /></course>
      <course-control id="1" control="1"><next course-control="999" /></course-control>
    </course-scribe-event>`;

    const { event, warnings } = importPpen(brokenXml, DPI, MAP_HEIGHT_PX);
    expect(warnings.some(w => w.type === 'broken-link')).toBe(true);
    // Should still have the start control in the course
    expect(event.courses[0]!.controls).toHaveLength(1);
  });

  it('handles missing controls gracefully', () => {
    const missingCtrlXml = `<course-scribe-event>
      <event id="1">
        <title>Missing Ctrl</title>
        <map kind="OCAD" scale="5000">test.ocd</map>
        <standards map="2017" description="2018" />
        <all-controls print-scale="5000" />
        <descriptions lang="en" />
      </event>
      <control id="1" kind="start"><location x="10" y="10" /></control>
      <course id="1" kind="normal"><name>Missing</name><first course-control="1" /></course>
      <course-control id="1" control="1"><next course-control="2" /></course-control>
      <course-control id="2" control="999" />
    </course-scribe-event>`;

    const { event, warnings } = importPpen(missingCtrlXml, DPI, MAP_HEIGHT_PX);
    expect(warnings.some(w => w.type === 'missing-control')).toBe(true);
    expect(event.courses[0]!.controls).toHaveLength(1);
  });

  it('warns on unsupported special object kinds', () => {
    const unsupportedXml = `<course-scribe-event>
      <event id="1">
        <title>Unsupported</title>
        <map kind="OCAD" scale="5000">test.ocd</map>
        <standards map="2017" description="2018" />
        <all-controls print-scale="5000" />
        <descriptions lang="en" />
      </event>
      <special-object id="1" kind="custom-widget">
        <location x="10" y="10" />
      </special-object>
    </course-scribe-event>`;

    const { warnings } = importPpen(unsupportedXml, DPI, MAP_HEIGHT_PX);
    expect(warnings.some(w => w.type === 'unsupported-feature')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: score courses
// ---------------------------------------------------------------------------

describe('importPpen — score courses', () => {
  it('parses score course type', () => {
    const scoreXml = `<course-scribe-event>
      <event id="1">
        <title>Score Event</title>
        <map kind="OCAD" scale="5000">test.ocd</map>
        <standards map="2017" description="2018" />
        <all-controls print-scale="5000" />
        <descriptions lang="en" />
      </event>
      <control id="1" kind="start"><location x="10" y="10" /></control>
      <control id="2" kind="finish"><location x="50" y="50" /></control>
      <control id="3" kind="normal"><code>31</code><location x="20" y="20" /></control>
      <control id="4" kind="normal"><code>32</code><location x="30" y="30" /></control>
      <course id="1" kind="score"><name>Rogaine</name><first course-control="1" /></course>
      <course-control id="1" control="1"><next course-control="2" /></course-control>
      <course-control id="2" control="3" points="10"><next course-control="3" /></course-control>
      <course-control id="3" control="4" points="20"><next course-control="4" /></course-control>
      <course-control id="4" control="2" />
    </course-scribe-event>`;

    const { event } = importPpen(scoreXml, DPI, MAP_HEIGHT_PX);
    expect(event.courses[0]!.courseType).toBe('score');
    expect(event.courses[0]!.controls[1]!.score).toBe(10);
    expect(event.courses[0]!.controls[2]!.score).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Tests: identity-mm mode (no map loaded)
// ---------------------------------------------------------------------------

describe('importPpen — identity-mm mode', () => {
  it('stores mm values directly when mapHeightPx is 0', () => {
    const IDENTITY_DPI = 25.4; // 1mm = 1px
    const { event } = importPpen(MINIMAL_PPEN, IDENTITY_DPI, 0);
    const ctrl31 = Object.values(event.controls).find(c => c.code === 31)!;
    // x should be 100mm → 100px, y should be 120mm → 120px (no flip)
    expect(ctrl31.position.x).toBeCloseTo(100.0, 1);
    expect(ctrl31.position.y).toBeCloseTo(120.0, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: inline large fixture (simulates real Mt Taylor .ppen structure)
// ---------------------------------------------------------------------------

describe('importPpen — complex event', () => {
  // Test with multiple courses sharing start/finish, varied descriptions
  const COMPLEX_PPEN = `<course-scribe-event>
    <event id="1">
      <title>Complex Event</title>
      <map kind="OCAD" scale="5000">ComplexMap.ocd</map>
      <standards map="2017" description="2018" />
      <all-controls print-scale="5000" description-kind="symbols" />
      <descriptions lang="en-GB" />
    </event>
    <control id="1" kind="start"><location x="50" y="100" /></control>
    <control id="2" kind="finish"><location x="150" y="100" /><description box="all" iof-2004-ref="14.3" /></control>
    <control id="3" kind="normal"><code>101</code><location x="80" y="120" /><description box="D" iof-2004-ref="5.2" /><description box="E" iof-2004-ref="5.2" /><description box="F" iof-2004-ref="10.1" /></control>
    <control id="4" kind="normal"><code>102</code><location x="120" y="80" /><description box="D" iof-2004-ref="1.3" /><description box="G" iof-2004-ref="11.1SE" /></control>
    <control id="5" kind="normal"><code>103</code><location x="100" y="60" /><description box="C" iof-2004-ref="0.1E" /><description box="D" iof-2004-ref="1.14" /></control>
    <course id="1" kind="normal"><name>Course A</name><first course-control="10" /><options print-scale="5000" /></course>
    <course id="2" kind="normal"><name>Course B</name><first course-control="20" /><options print-scale="5000" /></course>
    <course-control id="10" control="1"><next course-control="11" /></course-control>
    <course-control id="11" control="3"><next course-control="12" /></course-control>
    <course-control id="12" control="4"><next course-control="13" /></course-control>
    <course-control id="13" control="2" />
    <course-control id="20" control="1"><next course-control="21" /></course-control>
    <course-control id="21" control="5"><next course-control="22" /></course-control>
    <course-control id="22" control="4"><next course-control="23" /></course-control>
    <course-control id="23" control="2" />
    <leg id="1" start-control="3" end-control="4"><bends><location x="100" y="100" /></bends></leg>
    <special-object id="1" kind="descriptions"><location x="180" y="150" /><location x="220" y="150" /><courses><course course="1" /></courses></special-object>
    <special-object id="2" kind="descriptions"><location x="180" y="130" /><location x="220" y="130" /><courses><course course="2" /></courses></special-object>
    <special-object id="3" kind="descriptions"><location x="180" y="110" /><location x="220" y="110" /></special-object>
    <special-object id="4" kind="descriptions"><location x="180" y="90" /><location x="220" y="90" /><courses><course course="1" /><course course="2" /></courses></special-object>
  </course-scribe-event>`;

  it('parses complex event with shared controls and multiple courses', () => {
    const { event, warnings } = importPpen(COMPLEX_PPEN, DPI, MAP_HEIGHT_PX);

    expect(event.name).toBe('Complex Event');
    expect(event.mapFile?.scale).toBe(5000);
    expect(Object.keys(event.controls)).toHaveLength(5);
    expect(event.courses).toHaveLength(2);
    expect(event.courses[0]!.name).toBe('Course A');
    expect(event.courses[1]!.name).toBe('Course B');
    expect(warnings.filter(w => w.type === 'cycle' || w.type === 'broken-link')).toHaveLength(0);
  });

  it('correctly maps compass-suffixed and multi-column descriptions', () => {
    const { event } = importPpen(COMPLEX_PPEN, DPI, MAP_HEIGHT_PX);
    const ctrl102 = Object.values(event.controls).find(c => c.code === 102)!;
    expect(ctrl102.description.columnD).toBe('1.3');
    expect(ctrl102.description.columnG).toBe('11.1SE');

    const ctrl103 = Object.values(event.controls).find(c => c.code === 103)!;
    expect(ctrl103.description.columnC).toBe('0.1E');
    expect(ctrl103.description.columnD).toBe('1.14');
  });

  it('parses language from BCP 47 tag', () => {
    const { event } = importPpen(COMPLEX_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.settings.language).toBe('en');
  });

  it('parses special objects with varied course assignments', () => {
    const { event } = importPpen(COMPLEX_PPEN, DPI, MAP_HEIGHT_PX);
    expect(event.specialItems).toHaveLength(4);

    // Item assigned to course 1 only
    const item1 = event.specialItems[0]!;
    expect(item1.courseIds).toHaveLength(1);

    // Item with no course assignment (all courses)
    const item3 = event.specialItems[2]!;
    expect(item3.courseIds).toBeUndefined();

    // Item assigned to both courses
    const item4 = event.specialItems[3]!;
    expect(item4.courseIds).toHaveLength(2);
  });
});
