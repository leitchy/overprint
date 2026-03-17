import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker using workerPort pattern for explicit worker handle
const worker = new Worker(
  new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
  { type: 'module' },
);

pdfjsLib.GlobalWorkerOptions.workerPort = worker;

export { pdfjsLib };
