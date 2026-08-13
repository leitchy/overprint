import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OVERPRINT_PURPLE } from '@/core/models/constants';
import { LOCAL_STORAGE_KEY_THEME } from '@/stores/app-settings-store';

/**
 * Dark mode is screen-only. These guards keep it from leaking into exports.
 */
describe('export safety (dark mode is screen-only)', () => {
  it('OVERPRINT_PURPLE is the exact sentinel the PDF path matches on', () => {
    // Changing this value silently corrupts pdf-course-map.ts's colour-match.
    expect(OVERPRINT_PURPLE).toBe('#BB29BB');
  });

  it('no export module imports the theme store or map-fade state', () => {
    const dir = join(process.cwd(), 'src/core/export');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      if (/app-settings-store|use-theme-effect|data-theme|mapFade/.test(src)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('index.html no-flash script uses the same localStorage key as the store', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain(LOCAL_STORAGE_KEY_THEME);
  });
});
