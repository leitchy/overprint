import type { ControlDescription } from '@/core/models/types';
import { getSymbolText } from './symbol-db';

/**
 * Generate a human-readable text description from a control's symbolic description.
 *
 * IOF composition rules:
 *   "{C} {D}, {E}, {F}, {G}. {H}"
 *
 * Examples:
 *   D="1.3" (Re-entrant), G="11.1N" (North side) → "re-entrant, north side"
 *   C="0.1N" (North), D="1.3" → "north re-entrant"
 *   D="1.1" (Terrace), E="2.1" (Shallow) → "shallow terrace"
 */
export function generateTextDescription(
  description: ControlDescription,
  lang = 'en',
): string {
  const parts: string[] = [];

  // Column C — "which of similar" precedes the feature
  const c = description.columnC ? getSymbolText(description.columnC, lang) : '';

  // Column D — the feature (required)
  const d = description.columnD ? getSymbolText(description.columnD, lang) : '';

  // Combine C + D
  if (c && d) {
    parts.push(`${c} ${d}`);
  } else if (d) {
    parts.push(d);
  }

  // Column E — appearance, follows D
  if (description.columnE) {
    parts.push(getSymbolText(description.columnE, lang));
  }

  // Column F — dimensions/combinations
  if (description.columnF) {
    parts.push(getSymbolText(description.columnF, lang));
  }

  // Column G — location of flag
  if (description.columnG) {
    parts.push(getSymbolText(description.columnG, lang));
  }

  // Join with commas
  let result = parts.join(', ');

  // Column H — other info, appended with period separator
  if (description.columnH) {
    const h = getSymbolText(description.columnH, lang);
    result = result ? `${result}. ${h}` : h;
  }

  return result;
}
