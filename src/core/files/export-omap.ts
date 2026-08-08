/**
 * OpenOrienteering Mapper (.omap) course exporter — roadmap item D6.
 *
 * Emits the purple course overprint (control circles, start triangle, finish
 * double circle, connecting legs, control numbers) as real OOM map objects in
 * the SAME paper coordinate frame as the loaded base map, so a mapper or print
 * shop can open the file in OpenOrienteering Mapper and merge it registered
 * onto the base map.
 *
 * Structure mirrors what `load-omap.ts` parses (the inverse operation):
 *   <map> → <georeferencing> + <colors> + <barrier> → <symbols> + <parts>.
 * Coordinates are 1/1000 mm on paper, Y-down (Qt convention). The exported XML
 * round-trips through `parseOmapXml` in load-omap.ts — that is the primary
 * correctness test (see export-omap.test.ts).
 *
 * Coordinate inversion: the loader maps OMAP units → map pixels via
 * `px = (unit − viewBoxOrigin) × renderScale`. We invert:
 * `unit = px / renderScale + viewBoxOrigin`, then normalise the source paper
 * unit (OCAD uses 1/100 mm) to OMAP's 1/1000 mm. Raster/PDF maps have no
 * native paper frame, so `dpi` defines it: 1 px = 25.4/dpi mm.
 */

import type {
  Control,
  CourseControlType,
  MapFile,
  MapPoint,
  OverprintEvent,
} from '@/core/models/types';
import {
  overprintDims,
  OVERPRINT_PURPLE_CMYK,
  NUMBER_DIGIT_HEIGHT_TO_EM,
} from '@/core/models/constants';
import { computeShapeOffset } from '@/core/geometry/shape-offset';
import { buildLegPath, mergeGaps, splitPathByGaps } from '@/core/geometry/leg-path';

// ---------------------------------------------------------------------------
// Coordinate frame
// ---------------------------------------------------------------------------

/** Mapping from map-image pixels to exported OMAP native units (1/1000 mm, Y-down). */
interface OmapExportFrame {
  /** Source paper-frame origin (in SOURCE units — 1/100 or 1/1000 mm). */
  originX: number;
  originY: number;
  /** Pixels per SOURCE unit (the loader's renderScale). */
  renderScale: number;
  /** OMAP output units (1/1000 mm) per source unit: 10 for OCAD, 1 otherwise. */
  unitFactor: number;
}

/** Resolve the pixel→OMAP-unit frame for a map file. */
function frameForMap(mapFile: MapFile): OmapExportFrame {
  const paperUnit = mapFile.georef?.paperUnit
    ?? (mapFile.type === 'ocad' ? 'hundredths-mm' : 'thousandths-mm');
  const unitFactor = paperUnit === 'hundredths-mm' ? 10 : 1;

  if (mapFile.viewBox && mapFile.renderScale) {
    return {
      originX: mapFile.viewBox.x,
      originY: mapFile.viewBox.y,
      renderScale: mapFile.renderScale,
      unitFactor,
    };
  }
  if (mapFile.georef && (mapFile.georef.source === 'ocad' || mapFile.georef.source === 'omap')) {
    return {
      originX: mapFile.georef.viewBoxOrigin.x,
      originY: mapFile.georef.viewBoxOrigin.y,
      renderScale: mapFile.georef.renderScale,
      unitFactor,
    };
  }
  // Raster / PDF: define the paper frame from DPI — 1 px = 25.4/dpi mm.
  // renderScale is px per 1/1000 mm.
  return {
    originX: 0,
    originY: 0,
    renderScale: mapFile.dpi / 25_400,
    unitFactor: 1,
  };
}

/** Convert a map-pixel point to OMAP native units (1/1000 mm paper, Y-down). */
function pixelToOmapUnits(p: MapPoint, f: OmapExportFrame): MapPoint {
  return {
    x: (p.x / f.renderScale + f.originX) * f.unitFactor,
    y: (p.y / f.renderScale + f.originY) * f.unitFactor,
  };
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format one coordinate triple for a `<coords>` text body ("x y [flags]"). */
function coordStr(x: number, y: number, flags = 0): string {
  const xi = Math.round(x);
  const yi = Math.round(y);
  return flags !== 0 ? `${xi} ${yi} ${flags}` : `${xi} ${yi}`;
}

function coordsElement(triples: Array<[number, number, number]>): string {
  const body = triples.map(([x, y, f]) => coordStr(x, y, f)).join(';');
  return `<coords count="${triples.length}">${body};</coords>`;
}

// OMAP coordinate flags (see load-omap.ts)
const FLAG_CURVE_START = 1;
const FLAG_CLOSE_POINT = 2;

/** Cubic-bezier circle approximation constant. */
const BEZIER_K = 0.5522847498307936;

/**
 * A closed circle of radius `r` (centred on the origin) as OMAP bezier coords —
 * four 90° cubic arcs, closing back to the start point.
 */
function circleCoords(r: number): Array<[number, number, number]> {
  const k = r * BEZIER_K;
  return [
    [r, 0, FLAG_CURVE_START], [r, k, 0], [k, r, 0],
    [0, r, FLAG_CURVE_START], [-k, r, 0], [-r, k, 0],
    [-r, 0, FLAG_CURVE_START], [-r, -k, 0], [-k, -r, 0],
    [0, -r, FLAG_CURVE_START], [k, -r, 0], [r, -k, 0],
    [r, 0, FLAG_CLOSE_POINT],
  ];
}

/** A closed equilateral triangle, apex pointing "up" (−Y), circumradius from side. */
function triangleCoords(side: number): Array<[number, number, number]> {
  const r = side / Math.sqrt(3);
  const vertex = (deg: number): [number, number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [r * Math.cos(rad), r * Math.sin(rad), 0];
  };
  const v0 = vertex(-90); // apex (Y-down: −Y is up)
  const v1 = vertex(30);
  const v2 = vertex(150);
  v2[2] = FLAG_CLOSE_POINT;
  return [v0, v1, v2];
}

/** A glyph element: a purple line sub-symbol stroking the given coords. */
function lineElement(coords: Array<[number, number, number]>, lineWidth: number): string {
  return '<element>'
    + `<symbol type="2"><line_symbol color="0" line_width="${Math.round(lineWidth)}" cap_style="1" join_style="1"/></symbol>`
    + `<object type="1">${coordsElement(coords)}</object>`
    + '</element>';
}

// ---------------------------------------------------------------------------
// Symbol table (fixed ids)
// ---------------------------------------------------------------------------

const SYM_START = 0;   // ISOM 701
const SYM_CONTROL = 1; // ISOM 703
const SYM_LINE = 2;    // ISOM 705
const SYM_FINISH = 3;  // ISOM 706
const SYM_NUMBER = 4;  // ISOM 704

interface OverprintUnitDims {
  circleRadius: number;
  lineWidth: number;
  startTriangleSide: number;
  finishOuterRadius: number;
  finishInnerRadius: number;
  circleGap: number;
  crossingPointArm: number;
  numberFontSize: number;
  numberSize: number;
}

function buildSymbolsXml(d: OverprintUnitDims): string {
  const start =
    `<symbol type="1" id="${SYM_START}" code="701" name="Start">`
    + '<point_symbol inner_radius="0" inner_color="-1" outer_width="0" outer_color="-1" rotatable="true">'
    + lineElement(triangleCoords(d.startTriangleSide), d.lineWidth)
    + '</point_symbol></symbol>';

  const control =
    `<symbol type="1" id="${SYM_CONTROL}" code="703" name="Control point">`
    + '<point_symbol inner_radius="0" inner_color="-1" outer_width="0" outer_color="-1">'
    + lineElement(circleCoords(d.circleRadius), d.lineWidth)
    + '</point_symbol></symbol>';

  const line =
    `<symbol type="2" id="${SYM_LINE}" code="705" name="Course line">`
    + `<line_symbol color="0" line_width="${Math.round(d.lineWidth)}" cap_style="0" join_style="1"/>`
    + '</symbol>';

  const finish =
    `<symbol type="1" id="${SYM_FINISH}" code="706" name="Finish">`
    + '<point_symbol inner_radius="0" inner_color="-1" outer_width="0" outer_color="-1">'
    + lineElement(circleCoords(d.finishOuterRadius), d.lineWidth)
    + lineElement(circleCoords(d.finishInnerRadius), d.lineWidth)
    + '</point_symbol></symbol>';

  const number =
    `<symbol type="8" id="${SYM_NUMBER}" code="704" name="Control number">`
    + '<text_symbol icon_text="1">'
    + `<font family="Arial" size="${Math.round(d.numberFontSize)}"/>`
    + '<text color="0" line_spacing="1"/>'
    + '</text_symbol></symbol>';

  return `<symbols count="5">${start}${control}${line}${finish}${number}</symbols>`;
}

// ---------------------------------------------------------------------------
// Colour table — the single IOF overprint purple spot colour
// ---------------------------------------------------------------------------

function buildColorsXml(): string {
  const [c, m, y, k] = OVERPRINT_PURPLE_CMYK;
  // sRGB of the overprint purple (#BB29BB) as 0–1 floats for the loader/OOM preview.
  const r = (0xbb / 255).toFixed(3);
  const g = (0x29 / 255).toFixed(3);
  const b = (0xbb / 255).toFixed(3);
  return '<colors count="1">'
    + `<color priority="0" name="Purple" c="${c}" m="${m}" y="${y}" k="${k}" opacity="1">`
    + '<spotcolors><namedcolor name="Purple"/></spotcolors>'
    + '<cmyk method="custom"/>'
    + `<rgb method="cmyk" r="${r}" g="${g}" b="${b}"/>`
    + '</color></colors>';
}

// ---------------------------------------------------------------------------
// Georeferencing — preserved from the source map so the merge stays registered
// ---------------------------------------------------------------------------

function buildGeoreferencingXml(mapFile: MapFile): string {
  const scale = mapFile.georef?.scale ?? mapFile.scale;
  const grivationDeg = mapFile.georef ? (mapFile.georef.grivation * 180) / Math.PI : 0;
  const open = `<georeferencing scale="${scale}" grivation="${grivationDeg}">`;

  const georef = mapFile.georef;
  if (!georef) return `${open}</georeferencing>`;

  const projSpec = typeof georef.projDef === 'string'
    ? georef.projDef
    : `+init=epsg:${georef.projDef}`;
  return open
    + '<projected_crs id="Local">'
    + `<spec language="PROJ.4">${esc(projSpec)}</spec>`
    + `<ref_point x="${georef.easting}" y="${georef.northing}"/>`
    + '</projected_crs>'
    + '</georeferencing>';
}

// ---------------------------------------------------------------------------
// Course objects
// ---------------------------------------------------------------------------

/** Rotation (radians, CW in the Y-down frame) turning the up-pointing triangle toward `d`. */
function rotationToward(d: MapPoint): number {
  return Math.atan2(d.x, -d.y);
}

function pointObject(symbolId: number, p: MapPoint, rotation?: number): string {
  const rot = rotation !== undefined && rotation !== 0 ? ` rotation="${rotation.toFixed(6)}"` : '';
  return `<object type="0" symbol="${symbolId}"${rot}>${coordsElement([[p.x, p.y, 0]])}</object>`;
}

function pathObject(symbolId: number, points: MapPoint[]): string {
  const triples = points.map((p): [number, number, number] => [p.x, p.y, 0]);
  return `<object type="1" symbol="${symbolId}">${coordsElement(triples)}</object>`;
}

function textObject(symbolId: number, p: MapPoint, text: string): string {
  // v_align 2 = baseline; the position is the label baseline point.
  return `<object type="4" symbol="${symbolId}" h_align="0" v_align="2">`
    + coordsElement([[p.x, p.y, 0]])
    + `<text>${esc(text)}</text></object>`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Export one course of an event as OpenOrienteering Mapper XML (.omap).
 *
 * @param event       The event (must have a loaded map file).
 * @param courseIndex Index into `event.courses`.
 * @returns The .omap XML document text.
 */
export function exportCourseToOmap(event: OverprintEvent, courseIndex: number): string {
  const course = event.courses[courseIndex];
  if (!course) throw new Error(`No course at index ${courseIndex}`);
  const mapFile = event.mapFile;
  if (!mapFile) throw new Error('Cannot export OMAP: no map file loaded');

  const frame = frameForMap(mapFile);
  const settings = event.settings;
  const std = overprintDims(settings.mapStandard);

  // IOF dimensions in OMAP units (1/1000 mm on paper)
  const mm = (v: number): number => v * 1000;
  const dims: OverprintUnitDims = {
    circleRadius: mm(settings.controlCircleDiameter / 2),
    lineWidth: mm(settings.lineWidth),
    startTriangleSide: mm(std.startTriangleSide),
    finishOuterRadius: mm(std.finishOuterDiameter / 2),
    finishInnerRadius: mm(std.finishInnerDiameter / 2),
    circleGap: mm(std.circleGap),
    crossingPointArm: mm(std.crossingPointArm),
    numberFontSize: mm(settings.numberSize * NUMBER_DIGIT_HEIGHT_TO_EM),
    numberSize: mm(settings.numberSize),
  };
  /** OMAP units per map pixel — for converting stored pixel offsets/distances. */
  const unitsPerPx = frame.unitFactor / frame.renderScale;

  const shapeOffset = (type: CourseControlType): number =>
    computeShapeOffset(
      type,
      dims.circleRadius,
      dims.startTriangleSide,
      dims.finishOuterRadius,
      dims.crossingPointArm,
      dims.circleGap,
      dims.lineWidth,
    );

  // Resolve course controls to positions in OMAP units
  const resolved: Array<{
    control: Control;
    type: CourseControlType;
    index: number;
    pos: MapPoint;
  }> = [];
  for (let i = 0; i < course.controls.length; i++) {
    const cc = course.controls[i]!;
    const control = event.controls[cc.controlId];
    if (control) {
      resolved.push({ control, type: cc.type, index: i, pos: pixelToOmapUnits(control.position, frame) });
    }
  }

  const objects: string[] = [];

  // Legs (behind shapes) — score courses have no ordered legs
  if (course.courseType !== 'score') {
    for (let i = 1; i < resolved.length; i++) {
      const prev = resolved[i - 1]!;
      const curr = resolved[i]!;
      const cc = course.controls[prev.index];
      const bendPoints = cc?.bendPoints?.map((bp) => pixelToOmapUnits(bp, frame));
      const path = buildLegPath(prev.pos, curr.pos, bendPoints, shapeOffset(prev.type), shapeOffset(curr.type));
      if (!path) continue;

      // Manual leg gaps are stored as pixel distances along the leg — scale to units
      const gaps = (cc?.legGaps ?? []).map((g) => ({
        startDist: g.startDist * unitsPerPx,
        endDist: g.endDist * unitsPerPx,
      }));
      const subPaths = gaps.length > 0 ? splitPathByGaps(path, mergeGaps(gaps)) : [path];
      for (const sub of subPaths) {
        if (sub.length >= 2) objects.push(pathObject(SYM_LINE, sub));
      }
    }
  }

  // Start triangle direction: toward first bend point of the first leg, else next control
  const firstLegBends = course.controls[resolved[0]?.index ?? 0]?.bendPoints;
  const startTargetPos = firstLegBends && firstLegBends.length > 0
    ? pixelToOmapUnits(firstLegBends[0]!, frame)
    : resolved[1]?.pos;

  // Shapes + numbers
  for (const { type, index, pos, control } of resolved) {
    if (type === 'start' || type === 'mapExchange' || type === 'mapFlip') {
      let rotation = startTargetPos && resolved.length >= 2
        ? rotationToward({ x: startTargetPos.x - resolved[0]!.pos.x, y: startTargetPos.y - resolved[0]!.pos.y })
        : 0;
      if (type !== 'start') rotation += Math.PI; // inverted triangle
      objects.push(pointObject(SYM_START, pos, rotation));
    } else if (type === 'finish') {
      objects.push(pointObject(SYM_FINISH, pos));
    } else if (type === 'crossingPoint') {
      // X shape: two diagonal strokes with the course-line symbol
      const a = dims.crossingPointArm;
      objects.push(pathObject(SYM_LINE, [{ x: pos.x - a, y: pos.y - a }, { x: pos.x + a, y: pos.y + a }]));
      objects.push(pathObject(SYM_LINE, [{ x: pos.x + a, y: pos.y - a }, { x: pos.x - a, y: pos.y + a }]));
    } else {
      objects.push(pointObject(SYM_CONTROL, pos));

      // Control number — same label logic as the canvas/PDF renderers
      const labelMode = course.settings.labelMode ?? 'sequence';
      const seqNum = index + 1;
      let labelText = '';
      if (labelMode === 'sequence') labelText = String(seqNum);
      else if (labelMode === 'code') labelText = String(control.code);
      else if (labelMode === 'both') labelText = `${seqNum} (${control.code})`;
      if (labelText !== '') {
        const numberOffset = course.controls[index]?.numberOffset;
        const label: MapPoint = {
          x: pos.x + shapeOffset(type) + dims.lineWidth + (numberOffset ? numberOffset.x * unitsPerPx : 0),
          y: pos.y + dims.numberSize * 0.35 + (numberOffset ? numberOffset.y * unitsPerPx : 0),
        };
        objects.push(textObject(SYM_NUMBER, label, labelText));
      }
    }
  }

  const partName = esc(`${course.name} overprint`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="9">\n'
    + `<notes>Course overprint exported from Overprint — event "${esc(event.name)}", course "${esc(course.name)}". Merge onto the base map in OpenOrienteering Mapper.</notes>\n`
    + buildGeoreferencingXml(mapFile) + '\n'
    + buildColorsXml() + '\n'
    + '<barrier version="6" required="0.6.0">\n'
    + buildSymbolsXml(dims) + '\n'
    + `<parts count="1" current="0"><part name="${partName}"><objects count="${objects.length}">`
    + objects.join('')
    + '</objects></part></parts>\n'
    + '</barrier>\n'
    + '</map>\n';
}

/** Suggested filename for an exported course: "Event - Course.omap" (sanitised). */
export function suggestedOmapFilename(event: OverprintEvent, courseIndex: number): string {
  const courseName = event.courses[courseIndex]?.name ?? 'Course';
  const base = `${event.name} - ${courseName}`.replace(/[^a-zA-Z0-9-_ ]/g, '');
  return `${base}.omap`;
}
