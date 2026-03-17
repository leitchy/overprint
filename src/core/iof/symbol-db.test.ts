import { describe, it, expect } from 'vitest';
import {
  getSymbolsForColumn,
  getSymbol,
  getSymbolName,
  getSymbolText,
  getSymbolCount,
  getAllSymbolIds,
} from './symbol-db';

describe('symbol-db', () => {
  it('loads a non-trivial number of symbols', () => {
    expect(getSymbolCount()).toBeGreaterThan(100);
  });

  it('has unique IDs', () => {
    const ids = getAllSymbolIds();
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('looks up a known symbol by ID', () => {
    // "1.1" is typically "Terrace" in the IOF standard
    const symbol = getSymbol('1.1');
    expect(symbol).toBeDefined();
    expect(symbol?.name).toBe('Terrace');
    expect(symbol?.column).toBe('D');
  });

  it('returns undefined for unknown IDs', () => {
    expect(getSymbol('nonexistent')).toBeUndefined();
  });

  it('gets symbols for column D', () => {
    const dSymbols = getSymbolsForColumn('D');
    expect(dSymbols.length).toBeGreaterThan(30);
    expect(dSymbols.every((s) => s.column === 'D')).toBe(true);
  });

  it('gets symbols for column C', () => {
    const cSymbols = getSymbolsForColumn('C');
    expect(cSymbols.length).toBeGreaterThan(0);
    expect(cSymbols.every((s) => s.column === 'C')).toBe(true);
  });

  it('gets symbols for column G', () => {
    const gSymbols = getSymbolsForColumn('G');
    expect(gSymbols.length).toBeGreaterThan(0);
    expect(gSymbols.every((s) => s.column === 'G')).toBe(true);
  });

  it('returns sorted symbols by name', () => {
    const dSymbols = getSymbolsForColumn('D');
    const names = dSymbols.map((s) => s.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('gets English name by default', () => {
    expect(getSymbolName('1.1')).toBe('Terrace');
  });

  it('gets localized name', () => {
    const name = getSymbolName('1.1', 'de');
    expect(name).toBe('Terrasse');
  });

  it('falls back to English for unknown language', () => {
    const name = getSymbolName('1.1', 'xx');
    expect(name).toBe('Terrace');
  });

  it('gets text description', () => {
    const text = getSymbolText('1.1');
    expect(text).toBeTruthy();
    expect(typeof text).toBe('string');
  });

  it('returns ID for unknown symbol name lookup', () => {
    expect(getSymbolName('nonexistent')).toBe('nonexistent');
  });
});
