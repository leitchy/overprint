import { describe, it, expect } from 'vitest';
import { createEvent, createCourse, createControl, DEFAULT_EVENT_SETTINGS } from './defaults';

describe('createEvent', () => {
  it('creates an event with the given name', () => {
    const event = createEvent('Mt Taylor Sprint');
    expect(event.name).toBe('Mt Taylor Sprint');
  });

  it('generates a unique ID', () => {
    const a = createEvent('Event A');
    const b = createEvent('Event B');
    expect(a.id).not.toBe(b.id);
  });

  it('starts with no map file', () => {
    const event = createEvent('Test');
    expect(event.mapFile).toBeNull();
  });

  it('starts with empty courses and controls', () => {
    const event = createEvent('Test');
    expect(event.courses).toEqual([]);
    expect(event.controls).toEqual({});
  });

  it('uses default settings with IOF-correct values', () => {
    const event = createEvent('Test');
    expect(event.settings.printScale).toBe(15000);
    expect(event.settings.controlCircleDiameter).toBe(5.0);
    expect(event.settings.lineWidth).toBe(0.35);
    expect(event.settings.numberSize).toBe(4.0);
    expect(event.settings.descriptionStandard).toBe('2024');
    expect(event.settings.mapStandard).toBe('ISOM2017');
  });

  it('uses A4 portrait as default page setup', () => {
    const event = createEvent('Test');
    expect(event.settings.pageSetup.paperSize).toBe('A4');
    expect(event.settings.pageSetup.orientation).toBe('portrait');
  });

  it('has a version string', () => {
    const event = createEvent('Test');
    expect(event.version).toBeTruthy();
  });
});

describe('createCourse', () => {
  it('creates a course with the given name', () => {
    const course = createCourse('Long');
    expect(course.name).toBe('Long');
  });

  it('defaults to normal course type', () => {
    const course = createCourse('Short');
    expect(course.courseType).toBe('normal');
  });

  it('starts with empty controls', () => {
    const course = createCourse('Test');
    expect(course.controls).toEqual([]);
  });

  it('generates unique IDs', () => {
    const a = createCourse('A');
    const b = createCourse('B');
    expect(a.id).not.toBe(b.id);
  });
});

describe('createControl', () => {
  it('creates a control with code and position', () => {
    const control = createControl(31, { x: 100, y: 200 });
    expect(control.code).toBe(31);
    expect(control.position).toEqual({ x: 100, y: 200 });
  });

  it('generates a unique ID', () => {
    const a = createControl(31, { x: 0, y: 0 });
    const b = createControl(32, { x: 0, y: 0 });
    expect(a.id).not.toBe(b.id);
  });

  it('uses default empty description', () => {
    const control = createControl(31, { x: 0, y: 0 });
    expect(control.description.columnD).toBe('');
  });

  it('accepts a custom description', () => {
    const control = createControl(31, { x: 0, y: 0 }, {
      columnD: '1.3',
      columnG: '11.1',
    });
    expect(control.description.columnD).toBe('1.3');
    expect(control.description.columnG).toBe('11.1');
  });
});

describe('DEFAULT_EVENT_SETTINGS', () => {
  it('has margins defined', () => {
    expect(DEFAULT_EVENT_SETTINGS.pageSetup.margins.top).toBe(10);
    expect(DEFAULT_EVENT_SETTINGS.pageSetup.margins.right).toBe(10);
    expect(DEFAULT_EVENT_SETTINGS.pageSetup.margins.bottom).toBe(10);
    expect(DEFAULT_EVENT_SETTINGS.pageSetup.margins.left).toBe(10);
  });
});
