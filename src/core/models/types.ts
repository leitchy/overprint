import type { ControlId, CourseId, EventId, SpecialItemId } from '@/utils/id';

export interface MapPoint {
  x: number; // Pixels from left of map image
  y: number; // Pixels from top of map image
}

/** A ground-truth point linking map pixels to GPS coordinates (for manual calibration). */
export interface CalibrationPoint {
  /** Map pixel coordinates */
  mapPoint: MapPoint;
  /** WGS84 longitude (degrees) */
  lon: number;
  /** WGS84 latitude (degrees) */
  lat: number;
}

/** Georeferencing data extracted from OCAD/OMAP or computed via manual calibration. */
export interface GeoReference {
  /** EPSG code (number) or PROJ.4 string (string) for projected CRS */
  projDef: number | string;
  /** Projected origin X (metres) */
  easting: number;
  /** Projected origin Y (metres) */
  northing: number;
  /** Map scale denominator */
  scale: number;
  /** Grid-to-magnetic north angle (radians) */
  grivation: number;
  /** Source of this georef data */
  source: 'ocad' | 'omap' | 'calibration';
  /** Paper coordinate unit — needed for correct scale factor */
  paperUnit: 'hundredths-mm' | 'thousandths-mm';
  /** SVG viewBox origin for paper→pixel mapping */
  viewBoxOrigin: { x: number; y: number };
  /** SVG viewBox height — required for Y-flip */
  viewBoxHeight: number;
  /** SVG-to-pixel render scale factor */
  renderScale: number;
  /** Manual calibration points (for raster/PDF) */
  calibrationPoints?: CalibrationPoint[];
}

export interface MapFile {
  name: string;
  type: 'raster' | 'pdf' | 'ocad' | 'omap';
  scale: number;  // e.g. 10000 for 1:10000
  dpi: number;    // Resolution for coordinate mapping
  georef?: GeoReference;
  /** True when coordinates were imported in mm (e.g. from .ppen) and need
   *  re-projection once the actual map image is loaded. */
  pendingCoordinateTransform?: boolean;
  /** SVG viewBox for OCAD/OMAP maps (1/100mm or 1/1000mm units).
   *  Required for correct .ppen coordinate conversion independently of georef. */
  viewBox?: { x: number; y: number; width: number; height: number };
  /** SVG-to-pixel render scale factor for OCAD/OMAP maps. */
  renderScale?: number;
}

export interface ControlDescription {
  // IOF 2024 standard columns A-H
  // Column A (sequence number) is derived from course array index
  // Column B (control code) is derived from Control.code
  columnC?: string; // Which of similar features
  columnD: string;  // Feature (the control feature symbol) — required
  columnE?: string; // Appearance / detail
  columnF?: string; // Dimensions / combinations (symbol, e.g. crossing/junction)
  columnFText?: string; // Free-text dimensions, e.g. "2.5" or "8 x 4" — takes precedence over columnF when set
  columnG?: string; // Location of flag
  columnH?: string; // Other information
}

/** A gap in a control circle so an underlying map feature shows through (ISOM §3.7).
 *  Angles in degrees, CCW from the +X axis, y-up (PurplePen convention). The gapped
 *  arc runs CCW from startDeg to endDeg. */
export interface CircleGap {
  startDeg: number;
  endDeg: number;
}

export interface Control {
  id: ControlId;
  code: number; // IOF code, >30
  position: MapPoint;
  description: ControlDescription;
  /** Gaps in this control's circle. Stored on the shared Control so a gap opened
   *  over a map feature applies in every course. Absent/empty = full circle. */
  circleGaps?: CircleGap[];
}

export type CourseControlType =
  | 'start'
  | 'control'
  | 'finish'
  | 'crossingPoint'
  | 'mapExchange'
  | 'mapFlip';

export interface CourseControl {
  controlId: ControlId;
  type: CourseControlType;
  // sequenceNumber is derived from array index — not stored
  score?: number; // For score courses only
  /** Pixel offset from the default number position. Per-CourseControl so the same
   *  control can have different number positions in different courses. */
  numberOffset?: MapPoint;
  /** Intermediate waypoints for the outgoing leg (to the next control). */
  bendPoints?: MapPoint[];
  /** Visual gaps in the outgoing leg. */
  legGaps?: LegGap[];
}

/** A visual gap in a leg line, defined by absolute distances along the polyline. */
export interface LegGap {
  /** Distance from leg start along the polyline (map pixels). */
  startDist: number;
  /** Distance from leg start where the gap ends (map pixels). */
  endDist: number;
}

/** Axis-aligned bounding box in map pixel coordinates. */
export interface CourseBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CourseSettings {
  printScale?: number; // Override event print scale for this course
  labelMode?: 'sequence' | 'code' | 'both' | 'none';
  descriptionAppearance?: 'symbols' | 'text' | 'symbolsAndText';
  secondaryTitle?: string;
  printArea?: CourseBounds;
  climb?: number;
  pageSetup?: Partial<PageSetup>; // Per-course override (e.g. orientation, paper size)
}

/** Per-part options for multi-part courses (map exchange / map flip). */
export interface PartOptions {
  /** Show finish circle on non-final parts (default false). */
  showFinish?: boolean;
}

export interface Course {
  id: CourseId;
  name: string;
  courseType: 'normal' | 'score';
  controls: CourseControl[];
  climb?: number; // Optional climb in metres
  settings: CourseSettings;
  /** Per-part options, indexed by 0-based part number. Only for multi-part courses. */
  partOptions?: PartOptions[];
}

export type PaperSize = 'A4' | 'A3' | 'Letter' | 'custom';

export interface PageSetup {
  paperSize: PaperSize;
  customWidth?: number;  // mm, only if paperSize is 'custom'
  customHeight?: number; // mm, only if paperSize is 'custom'
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;    // mm
    right: number;  // mm
    bottom: number; // mm
    left: number;   // mm
  };
}

export type DescriptionStandard = '2018' | '2024';
export type MapStandard = 'ISOM2017' | 'ISSprOM2019';

/**
 * How overprint symbol sizes respond when the print scale differs from the
 * map scale (PurplePen "Item sizes" / ItemScaling):
 * - 'none'            — symbols are a fixed mm size on the printed page.
 * - 'relativeToMap'   — symbols scale with the map enlargement (default).
 * - 'relativeTo15000' — symbols keep a fixed ground size, as if the map were
 *   printed at the standard's reference scale (1:15000 ISOM, 1:4000 ISSprOM).
 */
export type ItemScaling = 'none' | 'relativeToMap' | 'relativeTo15000';

export interface EventSettings {
  printScale: number;
  controlCircleDiameter: number; // mm at print scale
  lineWidth: number;             // mm at print scale
  numberSize: number;            // mm at print scale
  descriptionStandard: DescriptionStandard;
  mapStandard: MapStandard;
  pageSetup: PageSetup;
  /** BCP 47 language tag for IOF control description output. Default: 'en'. */
  language: string;
  /** Optional map title for PDF output (e.g. "Red Hill North"). Falls back to event name. */
  mapTitle?: string;
  /** Contour interval in metres (e.g. 5). Displayed on scale bar when set. */
  contourInterval?: number;
  /** Map author credit line for PDF output. */
  mapAuthor?: string;
  /** PDF export: apply a Multiply blend to the overprint layer so map detail
   *  shows through the purple in on-screen viewers. Default true. (The DeviceCMYK
   *  overprint flag is always set for press output regardless.) */
  overprintBlend?: boolean;
  /** Overprint symbol size scaling mode. Default 'relativeToMap' (see {@link ItemScaling}). */
  itemScaling?: ItemScaling;
}

// ---------------------------------------------------------------------------
// Special items
// ---------------------------------------------------------------------------

/** Discriminated union tag for all special overlay items. */
export type SpecialItemType =
  | 'text'
  | 'line'
  | 'rectangle'
  | 'whiteOut'
  | 'outOfBoundsArea'
  | 'descriptionBox'
  | 'image'
  | 'outOfBounds'
  | 'dangerousArea'
  | 'waterLocation'
  | 'firstAid'
  | 'forbiddenRoute'
  | 'mapIssue';

interface SpecialItemBase {
  id: SpecialItemId;
  position: MapPoint;
  rotation?: number;
  color?: string;
  /** If defined and non-empty, item is only shown on these courses. */
  courseIds?: CourseId[];
}

export interface TextItem extends SpecialItemBase {
  type: 'text';
  text: string;
  fontSize: number;        // map pixels
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
}

export interface LineItem extends SpecialItemBase {
  type: 'line';
  endPosition: MapPoint;
  lineWidth?: number; // map pixels, defaults to DEFAULT_LINE_WIDTH
  /** 'dashed' renders a marked-route line (IOF 707/711 dash pattern); default solid. */
  lineStyle?: 'solid' | 'dashed';
}

export interface RectangleItem extends SpecialItemBase {
  type: 'rectangle';
  endPosition: MapPoint;
  lineWidth?: number;
}

/**
 * An opaque white rectangle that masks stale map content. Drawn ABOVE the map
 * but BELOW the course overprint, so course symbols still show over the mask.
 */
export interface WhiteOutItem extends SpecialItemBase {
  type: 'whiteOut';
  endPosition: MapPoint;
}

/**
 * A hatched area — out-of-bounds (IOF 709) or dangerous (IOF 710). Both render
 * as a closed polygon filled with a purple 45°+135° cross-hatch and no solid
 * boundary (PurplePen OOBCourseObj / DangerousCourseObj — identical fill).
 * Vertices are relative to `position`, matching the rectangle convention.
 */
export interface HatchAreaItem extends SpecialItemBase {
  type: 'outOfBoundsArea' | 'dangerousArea';
  /** Polygon vertices relative to `position`, at least 3. */
  vertices: MapPoint[];
}

export interface DescriptionBoxItem extends SpecialItemBase {
  type: 'descriptionBox';
  endPosition: MapPoint;
  /** Number of description columns (from PurplePen appearance). */
  columns?: number;
  /** True if this is the "All Controls" description box. */
  allControls?: boolean;
}

export interface ImageItem extends SpecialItemBase {
  type: 'image';
  endPosition: MapPoint;          // bottom-right corner
  /** Base64 data URL (e.g., data:image/png;base64,...) */
  imageDataUrl: string;
  /** Original filename for display purposes */
  fileName?: string;
}

export interface IofSymbolItem extends SpecialItemBase {
  type: 'outOfBounds' | 'waterLocation' | 'firstAid' | 'forbiddenRoute' | 'mapIssue';
}

export type SpecialItem = TextItem | LineItem | RectangleItem | WhiteOutItem | HatchAreaItem | DescriptionBoxItem | ImageItem | IofSymbolItem;

export interface OverprintEvent {
  id: EventId;
  name: string;
  mapFile: MapFile | null;
  courses: Course[];
  controls: Record<ControlId, Control>;
  settings: EventSettings;
  specialItems: SpecialItem[];
  version: string; // File format version
}
