import type {
  Control,
  ControlDescription,
  Course,
  EventSettings,
  MapPoint,
  OverprintEvent,
  PageSetup,
} from './types';
import {
  generateControlId,
  generateCourseId,
  generateEventId,
} from '@/utils/id';

const FILE_FORMAT_VERSION = '0.1.0';

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
};

export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  printScale: 15000,                // 1:15000
  controlCircleDiameter: 5.0,      // mm (ISOM 2017-2: 5.0mm outer diameter)
  lineWidth: 0.35,                  // mm (IOF spec)
  numberSize: 4.0,                  // mm (IOF spec)
  descriptionStandard: '2024',
  mapStandard: 'ISOM2017',
  pageSetup: DEFAULT_PAGE_SETUP,
  language: 'en',
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
