/**
 * Shared PDF inspection helpers for export tests. pdf-lib output is binary and
 * Flate-compressed; these decode it to readable operator/object text so tests can
 * assert draw behaviour (colour-order, layer split, vector-not-raster, content).
 *
 * TEST-ONLY: imported exclusively by `*.test.ts`, so it's tree-shaken out of the app
 * bundle. Uses `node:zlib`/`Buffer` (test runtime is Node/jsdom).
 */
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFArray, PDFRawStream } from 'pdf-lib';

/** Save without object streams so dictionaries (ExtGState etc.) stay plainly readable. */
export function saveFlat(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: false });
}

/** Latin1-decode bytes (1:1 byte↔char, so string offsets are byte offsets). */
export function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

function inflateOrRaw(body: Uint8Array): string {
  try {
    return inflateSync(Buffer.from(body)).toString('latin1');
  } catch {
    return Buffer.from(body).toString('latin1');
  }
}

/**
 * Decompressed content-stream text of one page, via the parsed object model
 * (walks the page's `Contents`). More robust than a raw-byte grep — content may be
 * one stream or an array of streams.
 */
export function pageContentText(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  const streams: PDFRawStream[] = [];
  const push = (obj: unknown) => {
    if (obj instanceof PDFRawStream) streams.push(obj);
  };
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) push(doc.context.lookup(contents.get(i)));
  } else if (contents) {
    push(doc.context.lookup(contents) ?? contents);
  }
  return streams.map((s) => inflateOrRaw(s.getContents())).join('\n');
}

/**
 * Decompress every `stream…endstream` body in a (flat-saved) PDF and concatenate.
 * Simpler than the object-model walk; use when you don't need per-page separation.
 */
export function allStreamText(bytes: Uint8Array): string {
  const raw = latin1(bytes);
  const bodies: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    bodies.push(inflateOrRaw(bytes.subarray(start, end)));
    re.lastIndex = end;
  }
  return bodies.join('\n');
}

/**
 * Every indirect object stringified. Dictionaries like ExtGStates live inside
 * compressed object streams, so raw-byte greps miss them; the parsed model doesn't.
 */
export function allObjectsText(doc: PDFDocument): string {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => String(obj))
    .join('\n');
}

/** Decode a pdf-lib hex/literal `drawText` payload back to a plain string, so tests
 *  can assert visible text. Handles `<...>` hex strings (Tj/TJ) — the common case. */
export function pdfHexText(op: string): string {
  return op.replace(/<([0-9A-Fa-f]*)>/g, (_m, hex: string) => {
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return s;
  });
}
