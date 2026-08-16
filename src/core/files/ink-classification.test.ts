import { describe, it, expect } from 'vitest';
import { isUpperInk, mapColourGroup } from './ink-classification';

describe('isUpperInk', () => {
  // --- upper inks (100% black / brown / blue) ---

  it('classifies 100% black (0/0/0/100)', () => {
    expect(isUpperInk([0, 0, 0, 1], 'Black')).toBe(true);
    expect(isUpperInk([0, 0, 0, 1])).toBe(true); // no name needed
  });

  it('classifies ISOM blue (~87/18/0/0) and pure cyan blue (100/0/0/0)', () => {
    expect(isUpperInk([0.87, 0.18, 0, 0], 'Blue')).toBe(true);
    expect(isUpperInk([1, 0, 0, 0], 'Blue')).toBe(true);
  });

  it('classifies ISOM brown (0/56/100/18) and ISSprOM brown (34/61/100/28)', () => {
    expect(isUpperInk([0, 0.56, 1, 0.18], 'Brown for contours')).toBe(true);
    expect(isUpperInk([0.34, 0.61, 1, 0.28], 'Brown')).toBe(true);
  });

  // --- screens / tints stay lower ---

  it('rejects 50% screens of the upper inks', () => {
    expect(isUpperInk([0, 0, 0, 0.5], 'Black 50%')).toBe(false);
    expect(isUpperInk([0.435, 0.09, 0, 0], 'Blue 50%')).toBe(false);
    expect(isUpperInk([0, 0.28, 0.5, 0.09], 'Brown 50%')).toBe(false);
  });

  it('rejects grey building screens (k 0.5–0.65)', () => {
    expect(isUpperInk([0, 0, 0, 0.65], 'Black 50-65% for buildings')).toBe(false);
  });

  it('vetoes on a sub-100% tint in the name even when CMYK passes', () => {
    // Hypothetical map that defines a tint with full-strength CMYK values.
    expect(isUpperInk([0, 0, 0, 1], 'Black 30%')).toBe(false);
    // ...but "100%" in the name is not a veto.
    expect(isUpperInk([0, 0, 0, 1], 'Black 100%')).toBe(true);
  });

  // --- other hues stay lower ---

  it('rejects green, olive and yellow (vegetation/open-land colours)', () => {
    expect(isUpperInk([0.76, 0, 0.91, 0], 'Green')).toBe(false);
    expect(isUpperInk([0.24, 0.28, 1, 0.06], 'Olive green')).toBe(false);
    expect(isUpperInk([0, 0.27, 0.79, 0], 'Yellow')).toBe(false);
  });

  it('rejects the course purple itself and white', () => {
    expect(isUpperInk([0.35, 0.85, 0, 0], 'Purple')).toBe(false);
    expect(isUpperInk([0, 0, 0, 0], 'Opaque White below Black')).toBe(false);
  });

  it('rejects out-of-range or non-finite components', () => {
    expect(isUpperInk([0, 0, 0, 1.5])).toBe(false);
    expect(isUpperInk([0, 0, 0, Number.NaN])).toBe(false);
    expect(isUpperInk([-0.1, 0, 0, 1])).toBe(false);
  });
});

describe('mapColourGroup', () => {
  it('classifies by colour NAME first (survives absent CMYK)', () => {
    expect(mapColourGroup('Brown 50%', undefined)).toBe('brown');
    expect(mapColourGroup('Contour', undefined)).toBe('brown');
    expect(mapColourGroup('Vegetation green 50%', undefined)).toBe('green');
    expect(mapColourGroup('Blue (water)', undefined)).toBe('blue');
    expect(mapColourGroup('Marsh', undefined)).toBe('blue');
    expect(mapColourGroup('Open land (yellow)', undefined)).toBe('yellow');
    expect(mapColourGroup('Rough open', undefined)).toBe('yellow');
  });

  it('falls back to CMYK when the name is unhelpful', () => {
    expect(mapColourGroup('Colour 3', [0, 0.56, 1, 0.18])).toBe('brown');   // ISOM brown
    expect(mapColourGroup('Colour 1', [0.87, 0.18, 0, 0])).toBe('blue');    // ISOM blue
    expect(mapColourGroup('Colour 4', [0.76, 0, 0.91, 0])).toBe('green');   // ISOM green
    expect(mapColourGroup('Colour 2', [0, 0.27, 0.79, 0])).toBe('yellow');  // ISOM yellow
  });

  it('tests brown before yellow (brown = yellow + magenta + K)', () => {
    // Olive-ish brown must not be mistaken for open-land yellow.
    expect(mapColourGroup(undefined, [0.24, 0.4, 1, 0.1])).toBe('brown');
  });

  it('uses naive RGB→CMYK as a last resort for pre-CMYK colours', () => {
    expect(mapColourGroup(undefined, undefined, { r: 0, g: 160, b: 220 })).toBe('blue');
    expect(mapColourGroup(undefined, undefined, { r: 40, g: 160, b: 70 })).toBe('green');
  });

  it('returns "other" (full strength) for black, grey, purple and white', () => {
    expect(mapColourGroup('Black', [0, 0, 0, 1])).toBe('other');
    expect(mapColourGroup('Grey 50%', [0, 0, 0, 0.5])).toBe('other');
    expect(mapColourGroup('Purple', [0.35, 0.85, 0, 0])).toBe('other');
    expect(mapColourGroup('White', [0, 0, 0, 0])).toBe('other');
    expect(mapColourGroup(undefined, undefined)).toBe('other');
  });
});
