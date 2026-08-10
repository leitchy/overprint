import type {
  Control,
  ControlDescription,
  Course,
  CourseControl,
  CourseControlType,
  EventSettings,
  MapPoint,
  OverprintEvent,
  PageSetup,
} from './types';
import type { ControlId } from '@/utils/id';
import {
  generateControlId,
  generateCourseControlId,
  generateCourseId,
  generateEventId,
} from '@/utils/id';

/**
 * Create a CourseControl with a fresh stable courseControlId.
 * Use this at every site that adds a control to a course sequence or branch.
 */
export function makeCourseControl(
  controlId: ControlId,
  type: CourseControlType,
  extra?: Partial<Omit<CourseControl, 'courseControlId' | 'controlId' | 'type'>>,
): CourseControl {
  return { courseControlId: generateCourseControlId(), controlId, type, ...extra };
}

const FILE_FORMAT_VERSION = '0.1.0';

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
};

export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  printScale: 15000,                // 1:15000
  controlCircleDiameter: 5.0,      // mm (ISOM 2017-2 §3.7: 5.0mm ø, centre-to-centre)
  lineWidth: 0.35,                  // mm (ISOM 2017-2 §3.7)
  numberSize: 4.0,                  // mm (IOF spec: digit height)
  descriptionStandard: '2024',
  mapStandard: 'ISOM2017',
  pageSetup: DEFAULT_PAGE_SETUP,
  language: 'en',
  overprintBlend: true,
  itemScaling: 'relativeToMap',
};

/**
 * Create a new OverprintEvent with default settings.
 *
 * @param name     - Display name for the event
 * @param language - BCP 47 language tag for the default description language.
 *                   Defaults to 'en'. Pass the current app language so new
 *                   events inherit the user's preferred description language.
 */
export function createEvent(name: string, language = 'en'): OverprintEvent {
  return {
    id: generateEventId(),
    name,
    mapFile: null,
    courses: [],
    controls: {},
    specialItems: [],
    settings: { ...DEFAULT_EVENT_SETTINGS, language },
    version: FILE_FORMAT_VERSION,
  };
}

export function createCourse(name: string): Course {
  return {
    id: generateCourseId(),
    name,
    courseType: 'normal',
    controls: [],
    settings: {},
  };
}

const DEFAULT_DESCRIPTION: ControlDescription = {
  columnD: '',
};

export function createControl(
  code: number,
  position: MapPoint,
  description: ControlDescription = DEFAULT_DESCRIPTION,
): Control {
  return {
    id: generateControlId(),
    code,
    position,
    description,
  };
}
