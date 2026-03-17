// Thin wrapper around the svg-control-descriptions package.
// Provides typed access to IOF control description symbols.

// Import the lang.json data directly — it's a static JSON file
import langData from 'svg-control-descriptions/symbols/lang.json';

// IOF column types that map to our ControlDescription fields
export type SymbolColumn = 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

// The package uses these "kind" values for column assignment
// A = start/finish, C-H = description columns, W/X/Y/V/Z = special/directive
const COLUMN_KIND_MAP: Record<string, SymbolColumn | null> = {
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
  G: 'G',
  H: 'H',
  // These are special kinds we don't map to editable columns
  A: null, // start/finish
  W: null, // between controls directive
  X: null, // crossing point
  Y: null, // special
  V: null, // special
  Z: null, // special
};

export interface IofSymbol {
  id: string;
  column: SymbolColumn | null;
  name: string;        // English name
  text: string;        // English text for auto-descriptions
  names: Record<string, string>;  // All language names
  texts: Record<string, string>;  // All language texts
}

// Build the symbol database from lang.json
const symbolDb = new Map<string, IofSymbol>();

for (const [id, entry] of Object.entries(langData) as Array<
  [string, { kind: string; names: Record<string, string>; texts: Record<string, string> }]
>) {
  const column = COLUMN_KIND_MAP[entry.kind] ?? null;
  symbolDb.set(id, {
    id,
    column,
    name: entry.names['en'] ?? id,
    text: entry.texts?.['en'] ?? entry.names['en'] ?? id,
    names: entry.names,
    texts: entry.texts ?? entry.names,
  });
}

/**
 * Get all symbols assigned to a specific column.
 */
export function getSymbolsForColumn(column: SymbolColumn): IofSymbol[] {
  const results: IofSymbol[] = [];
  for (const symbol of symbolDb.values()) {
    if (symbol.column === column) {
      results.push(symbol);
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Look up a symbol by its IOF ID.
 */
export function getSymbol(id: string): IofSymbol | undefined {
  return symbolDb.get(id);
}

/**
 * Get the localized name for a symbol.
 */
export function getSymbolName(id: string, lang = 'en'): string {
  const symbol = symbolDb.get(id);
  if (!symbol) return id;
  return symbol.names[lang] ?? symbol.names['en'] ?? id;
}

/**
 * Get the localized text description for a symbol.
 */
export function getSymbolText(id: string, lang = 'en'): string {
  const symbol = symbolDb.get(id);
  if (!symbol) return id;
  return symbol.texts[lang] ?? symbol.texts['en'] ?? symbol.name;
}

// Load all SVG files from the package as raw strings at build time
const svgModules = import.meta.glob(
  '/node_modules/svg-control-descriptions/symbols/*.svg',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

// Build a lookup map: symbol ID → raw SVG string
const svgCache = new Map<string, string>();
for (const [path, content] of Object.entries(svgModules)) {
  // Path format: /node_modules/svg-control-descriptions/symbols/1.1.svg
  const filename = path.split('/').pop()?.replace('.svg', '');
  if (filename) {
    svgCache.set(filename, content);
  }
}

/**
 * Get the raw SVG markup for a symbol. Returns undefined if no SVG exists.
 */
export function getSymbolSvg(id: string): string | undefined {
  return svgCache.get(id);
}

/**
 * Get the total count of symbols in the database.
 */
export function getSymbolCount(): number {
  return symbolDb.size;
}

/**
 * Get all symbol IDs.
 */
export function getAllSymbolIds(): string[] {
  return Array.from(symbolDb.keys());
}
