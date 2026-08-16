import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginSave } from './download';

describe('beginSave', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker');

  afterEach(() => {
    if (original) Object.defineProperty(window, 'showSaveFilePicker', original);
    else delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    vi.restoreAllMocks();
  });

  it('acquires the file handle BEFORE any content is generated (picker-first)', async () => {
    const order: string[] = [];
    const writes: unknown[] = [];
    const writable = {
      write: (d: unknown) => { writes.push(d); return Promise.resolve(); },
      close: () => Promise.resolve(),
    };
    const picker = vi.fn(async () => {
      order.push('picker');
      return { createWritable: async () => writable };
    });
    (window as unknown as Record<string, unknown>).showSaveFilePicker = picker;

    // Simulate a handler: pick first, THEN generate, THEN write.
    const save = await beginSave('map.pdf');
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'map.pdf' });
    order.push('generate');
    const blob = new Blob(['pdf-bytes']);
    await save.write(blob);

    // Picker resolved before generation started.
    expect(order).toEqual(['picker', 'generate']);
    expect(writes).toEqual([blob]);
  });

  it('passes through file types to the picker', async () => {
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
    }));
    (window as unknown as Record<string, unknown>).showSaveFilePicker = picker;
    const types = [{ description: 'PNG', accept: { 'image/png': ['.png'] } }];
    await beginSave('x.png', types);
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'x.png', types });
  });

  it('propagates AbortError when the user cancels (callers ignore it)', async () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    await expect(beginSave('x.pdf')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('falls back to an anchor download when the picker is unavailable', async () => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    const click = vi.fn();
    const createEl = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createEl(tag) as HTMLElement;
      if (tag === 'a') (el as HTMLAnchorElement).click = click;
      return el as HTMLAnchorElement;
    });
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });

    const save = await beginSave('fallback.pdf');
    await save.write(new Blob(['data']));
    expect(click).toHaveBeenCalledTimes(1);
  });
});
