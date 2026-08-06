import { create } from 'zustand';

type MapImageSource = HTMLImageElement | HTMLCanvasElement | null;

/**
 * How to re-rasterize the current map at a higher resolution when the user zooms
 * in. `null` for raster maps (already native resolution — nothing to sharpen).
 */
export type MapRerenderSource =
  | { kind: 'svg'; svg: string } // OCAD/OMAP: sized-less SVG (viewBox only)
  | { kind: 'pdf' };             // PDF: re-render page 1 from `pdfArrayBuffer`

interface MapImageState {
  image: MapImageSource;
  imageWidth: number;
  imageHeight: number;
  pdfArrayBuffer: ArrayBuffer | null; // For re-render at different DPI / export embedding
  /** Source for adaptive re-rasterization on zoom (null when not applicable). */
  rerender: MapRerenderSource | null;
  /**
   * Increments only when a *new map* is loaded — not when the displayed bitmap is
   * swapped by the adaptive renderer. Consumers key "new map" logic (e.g. fit-to-view)
   * off this so a mid-zoom bitmap swap doesn't reset the viewport.
   */
  mapVersion: number;
}

interface MapImageActions {
  setImage: (
    image: MapImageSource,
    width: number,
    height: number,
    rerender?: MapRerenderSource | null,
  ) => void;
  /** Swap the displayed bitmap only, preserving logical dimensions and mapVersion. */
  setImageBitmap: (image: MapImageSource) => void;
  setPdfArrayBuffer: (buffer: ArrayBuffer | null) => void;
  clear: () => void;
}

export const useMapImageStore = create<MapImageState & MapImageActions>()(
  (set) => ({
    image: null,
    imageWidth: 0,
    imageHeight: 0,
    pdfArrayBuffer: null,
    rerender: null,
    mapVersion: 0,

    setImage: (image, width, height, rerender = null) => {
      set((state) => ({
        image,
        imageWidth: width,
        imageHeight: height,
        rerender,
        mapVersion: state.mapVersion + 1,
      }));
    },

    setImageBitmap: (image) => {
      set({ image });
    },

    setPdfArrayBuffer: (buffer) => {
      set({ pdfArrayBuffer: buffer });
    },

    clear: () => {
      set((state) => ({
        image: null,
        imageWidth: 0,
        imageHeight: 0,
        pdfArrayBuffer: null,
        rerender: null,
        mapVersion: state.mapVersion + 1,
      }));
    },
  }),
);
