/**
 * loadMapFile is the single dispatch chokepoint every map load funnels through
 * (toolbar + drag-drop). It was zero-coverage. This locks its two contracts:
 * (1) correct loader per detected file type, and (2) calibration preservation —
 * raster/PDF keep any saved scale/dpi, while OCAD/OMAP's file-derived scale/dpi are
 * authoritative. The four real loaders (canvas/binary, un-runnable in jsdom) are mocked.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./load-raster', () => ({
  loadRasterImage: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })),
}));
vi.mock('./load-pdf', () => ({
  loadPdfAsImage: vi.fn(async () => ({ arrayBuffer: new ArrayBuffer(0), canvas: { width: 400, height: 400 }, width: 400, height: 400 })),
}));
vi.mock('./load-ocad', () => ({
  loadOcadMap: vi.fn(async () => ({
    image: { naturalWidth: 200, naturalHeight: 200 }, width: 200, height: 200,
    scale: 12000, dpi: 333, arrayBuffer: new ArrayBuffer(0), georef: null,
    viewBox: { x: 0, y: 0, width: 200, height: 200 }, renderScale: 1, svg: '<svg/>',
  })),
}));
vi.mock('./load-omap', () => ({
  loadOmapMap: vi.fn(async () => ({
    image: { naturalWidth: 300, naturalHeight: 300 }, width: 300, height: 300,
    scale: 7500, dpi: 250, georef: null,
    viewBox: { x: 0, y: 0, width: 300, height: 300 }, renderScale: 1, svg: '<svg/>',
  })),
}));

import { loadMapFile } from './load-map-file';
import { loadRasterImage } from './load-raster';
import { loadOcadMap } from './load-ocad';
import { loadOmapMap } from './load-omap';
import { useEventStore } from '@/stores/event-store';

const file = (name: string) => new File([new Uint8Array([1, 2, 3, 4])], name, { type: '' });
const mapFile = () => useEventStore.getState().event?.mapFile;

beforeEach(() => {
  vi.clearAllMocks();
  useEventStore.setState({ event: null, activeCourseId: null, selectedControlId: null });
});

describe('loadMapFile — dispatch', () => {
  it('routes .png to the raster loader and creates an event if none exists', async () => {
    expect(useEventStore.getState().event).toBeNull();
    const ok = await loadMapFile(file('map.png'));
    expect(ok).toBe(true);
    expect(useEventStore.getState().event).not.toBeNull(); // event auto-created
    expect(loadRasterImage).toHaveBeenCalledTimes(1);
    expect(loadOcadMap).not.toHaveBeenCalled();
    expect(mapFile()?.type).toBe('raster');
  });

  it('routes .ocd to the OCAD loader', async () => {
    await loadMapFile(file('map.ocd'));
    expect(loadOcadMap).toHaveBeenCalledTimes(1);
    expect(loadRasterImage).not.toHaveBeenCalled();
    expect(mapFile()?.type).toBe('ocad');
  });

  it('routes .omap to the OMAP loader', async () => {
    await loadMapFile(file('map.omap'));
    expect(loadOmapMap).toHaveBeenCalledTimes(1);
    expect(mapFile()?.type).toBe('omap');
  });

  it('returns false and touches nothing for an unknown type', async () => {
    const ok = await loadMapFile(file('notes.xyz'));
    expect(ok).toBe(false);
    expect(loadRasterImage).not.toHaveBeenCalled();
    expect(useEventStore.getState().event).toBeNull(); // no event created
  });
});

describe('loadMapFile — calibration preservation', () => {
  /** Seed an event that already carries saved map calibration (as after a .overprint load). */
  function seedExistingCalibration(scale: number, dpi: number) {
    useEventStore.getState().newEvent('E');
    useEventStore.getState().setMapFile({ name: 'old', type: 'raster', scale, dpi });
  }

  it('raster keeps the saved scale/dpi (reload must not reset calibration)', async () => {
    seedExistingCalibration(9000, 220);
    await loadMapFile(file('map.png'));
    expect(mapFile()?.scale).toBe(9000);
    expect(mapFile()?.dpi).toBe(220);
  });

  it('raster falls back to defaults when there is no saved calibration', async () => {
    await loadMapFile(file('map.png'));
    expect(mapFile()?.scale).toBe(15000);
    expect(mapFile()?.dpi).toBe(150);
  });

  it('OCAD scale/dpi from the file override any stale saved values', async () => {
    seedExistingCalibration(9000, 220);
    await loadMapFile(file('map.ocd'));
    expect(mapFile()?.scale).toBe(12000); // file wins over saved 9000
    expect(mapFile()?.dpi).toBe(333); // file DPI is authoritative, not saved 220
  });

  it('OMAP scale/dpi from the file are authoritative', async () => {
    seedExistingCalibration(9000, 220);
    await loadMapFile(file('map.omap'));
    expect(mapFile()?.scale).toBe(7500);
    expect(mapFile()?.dpi).toBe(250);
  });
});
