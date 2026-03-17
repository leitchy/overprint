import { create } from 'zustand';

type MapImageSource = HTMLImageElement | HTMLCanvasElement | null;

interface MapImageState {
  image: MapImageSource;
  imageWidth: number;
  imageHeight: number;
  pdfArrayBuffer: ArrayBuffer | null; // For re-render at different DPI / export embedding
}

interface MapImageActions {
  setImage: (
    image: MapImageSource,
    width: number,
    height: number,
  ) => void;
  setPdfArrayBuffer: (buffer: ArrayBuffer | null) => void;
  clear: () => void;
}

export const useMapImageStore = create<MapImageState & MapImageActions>()(
  (set) => ({
    image: null,
    imageWidth: 0,
    imageHeight: 0,
    pdfArrayBuffer: null,

    setImage: (image, width, height) => {
      set({ image, imageWidth: width, imageHeight: height });
    },

    setPdfArrayBuffer: (buffer) => {
      set({ pdfArrayBuffer: buffer });
    },

    clear: () => {
      set({
        image: null,
        imageWidth: 0,
        imageHeight: 0,
        pdfArrayBuffer: null,
      });
    },
  }),
);
