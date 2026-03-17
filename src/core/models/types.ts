import type { ControlId, CourseId, EventId } from '@/utils/id';

export interface MapPoint {
  x: number; // Pixels from left of map image
  y: number; // Pixels from top of map image
}

export interface MapFile {
  name: string;
  type: 'raster' | 'pdf' | 'ocad';
  scale: number;  // e.g. 10000 for 1:10000
  dpi: number;    // Resolution for coordinate mapping
}

export interface ControlDescription {
  // IOF 2024 standard columns A-H
  // Column A (sequence number) is derived from course array index
  // Column B (control code) is derived from Control.code
  columnC?: string; // Which of similar features
  columnD: string;  // Feature (the control feature symbol) — required
  columnE?: string; // Appearance / detail
  columnF?: string; // Dimensions / combinations
  columnG?: string; // Location of flag
  columnH?: string; // Other information
}

export interface Control {
  id: ControlId;
  code: number; // IOF code, >30
  position: MapPoint;
  description: ControlDescription;
}

export type CourseControlType =
  | 'start'
  | 'control'
  | 'finish'
  | 'crossingPoint'
  | 'mapExchange';

export interface CourseControl {
  controlId: ControlId;
  type: CourseControlType;
  // sequenceNumber is derived from array index — not stored
  score?: number; // For score courses only
}

export interface CourseSettings {
  printScale?: number; // Override event print scale for this course
}

export interface Course {
  id: CourseId;
  name: string;
  courseType: 'normal' | 'score';
  controls: CourseControl[];
  climb?: number; // Optional climb in metres
  settings: CourseSettings;
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
}

export interface OverprintEvent {
  id: EventId;
  name: string;
  mapFile: MapFile | null;
  courses: Course[];
  controls: Record<ControlId, Control>;
  settings: EventSettings;
  version: string; // File format version
}
