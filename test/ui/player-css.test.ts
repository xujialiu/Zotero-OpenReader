import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The Player's stylesheet and its three dropdowns, provider, language and
 * voice (issue #227).
 *
 * In the Top and Bottom bar the three are one row of flex items
 * (`.voice-group` is `display: contents`), sized by one rule: equal shares
 * of the room the other controls leave, between a floor and a cap. The cap
 * fits the longest language name the plugin composes from Azure's locales,
 * Arabic (United Arab Emirates): 181 px at 13 px in the macOS system font
 * (a canvas in Chrome, 2026-10-22), plus 28 px for the dropdown's padding,
 * border, gap and chevron. The sizes are in em, so they follow the font size
 * the Player takes from Zotero's own player. Vitest lays nothing out, so the
 * widths themselves are checked live (test/zotero-dev/cases/
 * player-dropdown-widths.md).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sheet = readFileSync(join(root, 'addon', 'content', 'player.css'), 'utf8');

interface Rule {
  selectors: string[];
  declarations: Map<string, string>;
}

/** Every style rule of the sheet (it has no at-rules), comments stripped. */
function rulesOf(css: string): Rule[] {
  const out: Rule[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const part of match[2].split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    }
    out.push({ selectors: match[1].split(',').map((s) => s.trim()), declarations });
  }
  return out;
}

const rules = rulesOf(sheet);
/** The declarations of the rules naming exactly `selector`, later ones winning. */
function declared(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of rules) if (rule.selectors.includes(selector)) for (const [k, v] of rule.declarations) out.set(k, v);
  return out;
}
const em = (value: string | undefined): number => {
  const match = /^([\d.]+)em$/.exec(value ?? '');
  return match ? Number(match[1]) : NaN;
};
const FONT_PX = 13;
const LONGEST_LANGUAGE_PX = 181;
const PICKER_CHROME_PX = 28;

describe('the Player\'s dropdowns in the Top and Bottom bar (issue #227)', () => {
  const field = declared('.field');

  it('gives the three dropdowns equal shares of the free room', () => {
    expect(field.get('flex')).toBe('1 1 0');
    expect(field.has('width')).toBe(false);
  });

  it('sizes no dropdown apart from the others outside the Floating panel', () => {
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        if (selector.startsWith('.layout-B')) continue;
        expect(selector, selector).not.toMatch(/\.field\.voice|\.field\.provider|\.field\.locale/);
      }
    }
  });

  it('stops growing once the longest language name fits', () => {
    const cap = em(field.get('max-width'));
    expect(cap * FONT_PX).toBeGreaterThanOrEqual(LONGEST_LANGUAGE_PX + PICKER_CHROME_PX);
    expect(cap * FONT_PX).toBeLessThan(LONGEST_LANGUAGE_PX + PICKER_CHROME_PX + 13);
  });

  it('shrinks no further than the voice dropdown could before', () => {
    expect(em(field.get('min-width')) * FONT_PX).toBeCloseTo(95, 0);
  });
});

describe('the Player\'s dropdowns in the Floating panel', () => {
  it('stay as wide as the panel, without the bars\' floor or cap', () => {
    const panel = declared('.layout-B .field');
    expect(panel.get('width')).toBe('100%');
    expect(panel.get('flex')).toBe('0 0 auto');
    expect(panel.get('min-width')).toBe('0');
    expect(panel.get('max-width')).toBe('none');
  });
});
