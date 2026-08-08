import { describe, it, expect } from 'vitest';
import { _tagUpperInkElements as tagUpperInkElements } from './load-ocad';

/** Colour table shaped like ocad2geojson's ocadFile.colors (cmyk 0–100). */
const OCAD_COLORS = [
  { number: 0, name: 'Black', cmyk: [0, 0, 0, 100], rgb: 'rgb(0, 0, 0)' },
  { number: 1, name: 'Blue', cmyk: [87, 18, 0, 0], rgb: 'rgb(0, 148, 216)' },
  { number: 2, name: 'Brown', cmyk: [0, 56, 100, 18], rgb: 'rgb(203, 114, 26)' },
  { number: 3, name: 'Black 50%', cmyk: [0, 0, 0, 50], rgb: 'rgb(145, 145, 145)' },
  { number: 4, name: 'Green', cmyk: [76, 0, 91, 0], rgb: 'rgb(60, 158, 74)' },
];

function parseSvg(inner: string): SVGElement {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" fill="transparent" viewBox="0 0 100 100">${inner}</svg>`,
    'image/svg+xml',
  );
  return doc.documentElement as unknown as SVGElement;
}

describe('tagUpperInkElements (OCAD)', () => {
  it('tags style-painted strokes in 100% black/blue/brown, not screens or green', () => {
    const svg = parseSvg(`
      <g>
        <path id="black" style="stroke: rgb(0, 0, 0); stroke-width: 2;" d="M 0 0 L 1 1"/>
        <path id="blue" style="stroke: rgb(0, 148, 216); stroke-width: 2;" d="M 0 0 L 1 1"/>
        <path id="brown" style="stroke: rgb(203, 114, 26); stroke-width: 2;" d="M 0 0 L 1 1"/>
        <path id="grey" style="stroke: rgb(145, 145, 145); stroke-width: 2;" d="M 0 0 L 1 1"/>
        <path id="green-fill" style="fill: rgb(60, 158, 74);" d="M 0 0 L 1 1 Z"/>
      </g>`);
    tagUpperInkElements(svg, { colors: OCAD_COLORS });

    const ink = (id: string) => svg.querySelector(`#${id}`)?.getAttribute('data-ink') ?? null;
    expect(ink('black')).toBe('upper');
    expect(ink('blue')).toBe('upper');
    expect(ink('brown')).toBe('upper');
    expect(ink('grey')).toBeNull();
    expect(ink('green-fill')).toBeNull();
  });

  it('tags text/attribute paint and inherits group paint; mixed paints stay untagged', () => {
    const svg = parseSvg(`
      <text id="label" fill="rgb(0, 0, 0)" x="1" y="1">42</text>
      <g stroke="rgb(0, 0, 0)">
        <line id="inherited" x1="0" y1="0" x2="1" y2="1"/>
      </g>
      <path id="mixed" style="stroke: rgb(0, 0, 0); fill: rgb(60, 158, 74);" d="M 0 0 L 1 1 Z"/>
      <path id="pattern" style="fill: url(#hatch); stroke: rgb(0, 0, 0);" d="M 0 0 L 1 1 Z"/>`);
    tagUpperInkElements(svg, { colors: OCAD_COLORS });

    const ink = (id: string) => svg.querySelector(`#${id}`)?.getAttribute('data-ink') ?? null;
    expect(ink('label')).toBe('upper');
    expect(ink('inherited')).toBe('upper');
    // Upper stroke + non-upper (green / pattern) fill → conservative: no tag.
    expect(ink('mixed')).toBeNull();
    expect(ink('pattern')).toBeNull();
  });

  it('does nothing when the colour table has no upper inks', () => {
    const svg = parseSvg('<path style="stroke: rgb(145, 145, 145);" d="M 0 0 L 1 1"/>');
    tagUpperInkElements(svg, { colors: [OCAD_COLORS[3], OCAD_COLORS[4]] });
    expect(svg.querySelector('[data-ink]')).toBeNull();
  });
});
