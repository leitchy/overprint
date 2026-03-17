import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from './event-store';
import { createControl } from '@/core/models/defaults';

beforeEach(() => {
  useEventStore.setState({ event: null });
  useEventStore.temporal.getState().clear();
});

describe('event-store', () => {
  it('starts with null event', () => {
    expect(useEventStore.getState().event).toBeNull();
  });

  it('creates a new event', () => {
    useEventStore.getState().newEvent('Mt Taylor Sprint');
    const { event } = useEventStore.getState();
    expect(event).not.toBeNull();
    expect(event?.name).toBe('Mt Taylor Sprint');
    expect(event?.courses).toEqual([]);
    expect(event?.controls).toEqual({});
  });

  it('sets map file', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().setMapFile({
      name: 'mt-taylor.pdf',
      type: 'pdf',
      scale: 10000,
      dpi: 200,
    });
    const { event } = useEventStore.getState();
    expect(event?.mapFile?.name).toBe('mt-taylor.pdf');
    expect(event?.mapFile?.type).toBe('pdf');
    expect(event?.mapFile?.scale).toBe(10000);
  });

  it('sets map scale', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().setMapFile({
      name: 'map.png',
      type: 'raster',
      scale: 15000,
      dpi: 150,
    });
    useEventStore.getState().setMapScale(10000);
    expect(useEventStore.getState().event?.mapFile?.scale).toBe(10000);
  });

  it('sets map DPI', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().setMapFile({
      name: 'map.png',
      type: 'raster',
      scale: 15000,
      dpi: 150,
    });
    useEventStore.getState().setMapDpi(200);
    expect(useEventStore.getState().event?.mapFile?.dpi).toBe(200);
  });

  it('adds a control', () => {
    useEventStore.getState().newEvent('Test');
    const control = createControl(31, { x: 100, y: 200 });
    useEventStore.getState().addControl(control);
    const { event } = useEventStore.getState();
    expect(event?.controls[control.id]).toEqual(control);
  });

  it('removes a control', () => {
    useEventStore.getState().newEvent('Test');
    const control = createControl(31, { x: 100, y: 200 });
    useEventStore.getState().addControl(control);
    useEventStore.getState().removeControl(control.id);
    expect(useEventStore.getState().event?.controls[control.id]).toBeUndefined();
  });

  it('updates a control', () => {
    useEventStore.getState().newEvent('Test');
    const control = createControl(31, { x: 100, y: 200 });
    useEventStore.getState().addControl(control);
    useEventStore.getState().updateControl(control.id, {
      position: { x: 150, y: 250 },
    });
    expect(useEventStore.getState().event?.controls[control.id]?.position).toEqual({
      x: 150,
      y: 250,
    });
  });

  it('supports undo/redo', () => {
    useEventStore.getState().newEvent('Test');
    const control = createControl(31, { x: 100, y: 200 });
    useEventStore.getState().addControl(control);

    // Verify control exists
    expect(useEventStore.getState().event?.controls[control.id]).toBeDefined();

    // Undo
    useEventStore.temporal.getState().undo();
    expect(useEventStore.getState().event?.controls[control.id]).toBeUndefined();

    // Redo
    useEventStore.temporal.getState().redo();
    expect(useEventStore.getState().event?.controls[control.id]).toBeDefined();
  });
});
