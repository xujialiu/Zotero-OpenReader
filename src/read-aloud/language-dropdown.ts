/**
 * The Player's language dropdown and the voice browser's language column
 * (issue #223): which language a voice is listed under, and what each is
 * called. The rules are OpenReader's (xujialiu/OpenReader#232, #300), so a
 * voice is filed under the same words on the phone and on the desktop:
 *
 * - A voice is listed under its own locale, as its provider sent it.
 *   Nothing is merged: Azure's zh-CN, zh-HK and zh-TW are three languages,
 *   and so are Zotero Premium's ar-XA and ar-SA. Zotero's own dropdown
 *   merged them — `normalizeLanguage` (reader.js 38103, Zotero 11.0) drops
 *   the regions CN, HK and TW and maps XA and SA to 001 — and its manager
 *   still resolves voices that way, which is why memory-sync stages the
 *   picks Zotero cannot tell apart (core/read-aloud-speed.ts zoteroKeepsRegion).
 * - A language is named by only what tells it apart from the entry's other
 *   languages of the same language (languageNames), in the app's language.
 *
 * The dropdown's order — "Multilingual" first, the rest by name — is the
 * Player's (player-controller.ts); the browser sorts its column the same
 * way.
 */

import { hasMessageSource, t } from '../core/l10n';
import { MULTILINGUAL } from '../core/providers/types';

/** Zotero's `getBaseLanguage`: the tag up to its first hyphen. */
export function baseLanguage(lang: string): string {
  return lang.replace(/-.+$/, '');
}

/**
 * The languages of a list of voices, in the order first met: each locale
 * its own, a wildcard voice (`*`) none — Zotero's `getSupportedLanguages`
 * (reader.js 39370) without its normalization, which made one zh of zh-CN,
 * zh-HK and zh-TW. The list may be a reader's, so it is walked by index.
 */
export function voiceLanguages(voices: any): string[] {
  const languages = new Set<string>();
  for (let i = 0; i < (voices?.length ?? 0); i++) {
    const language = voices[i]?.language;
    if (typeof language === 'string' && language && language !== '*') languages.add(language);
  }
  return [...languages];
}

/**
 * A tag's display name the way the dropdown renders one — `languageDisplay:
 * 'standard'`, "English (United States)" and never "American English", in
 * the given locale (the app's when none) — or the tag itself when ICU
 * cannot name it. In English the multilingual entry is "Multilingual", not
 * ICU's "Multiple languages"; other locales keep ICU's.
 */
export function languageDisplayName(code: string, locale?: string): string {
  try {
    const names = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'language', languageDisplay: 'standard' });
    if (code === MULTILINGUAL && baseLanguage(names.resolvedOptions().locale) === 'en') return 'Multilingual';
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

interface Parts {
  language: string;
  script?: string;
  region?: string;
  variants: string[];
}

/** The language, script, region and variants of a canonical tag; null for anything else (an extension, a private-use part). */
function parse(tag: string): Parts | null {
  const subtags = tag.split('-');
  const language = subtags.shift()!.toLowerCase();
  if (!/^(?:[a-z]{2,3}|[a-z]{5,8})$/.test(language)) return null;
  const parts: Parts = { language, variants: [] };
  if (subtags[0] && /^[a-z]{4}$/i.test(subtags[0])) {
    const script = subtags.shift()!;
    parts.script = script[0].toUpperCase() + script.slice(1).toLowerCase();
  }
  if (subtags[0] && /^(?:[a-z]{2}|[0-9]{3})$/i.test(subtags[0])) parts.region = subtags.shift()!.toUpperCase();
  for (const variant of subtags) {
    const lower = variant.toLowerCase();
    if (!/^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/.test(lower) || parts.variants.includes(lower)) return null;
    parts.variants.push(lower);
  }
  return parts;
}

/**
 * The parts of a tag as ICU canonicalizes it: an alias replaced and the
 * script it brings added (`sh-RS` is `sr-Latn-RS`, `cmn` is `zh`), a
 * numeric region named by its code (`zh-344` is `zh-HK`). Null for a tag
 * ICU refuses (`en_US`) and for one parse cannot read.
 */
function partsOf(tag: string): Parts | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(tag);
    return canonical ? parse(canonical) : null;
  } catch {
    return null;
  }
}

/** The script a tag means without writing one, by ICU's likely subtags: the region's where it differs from the language's (`sr-ME` is Latin, `sr` Cyrillic). */
function likelyScript(parts: Parts): string | undefined {
  try {
    return new Intl.Locale(parts.region ? `${parts.language}-${parts.region}` : parts.language).maximize().script;
  } catch {
    return undefined;
  }
}

/** A region named as another: Google's world Arabic, `ar-XA` in Zotero Premium, is a pseudo-locale to ICU ("Pseudo-Accents"). */
const NAMED_AS: Readonly<Record<string, string>> = { XA: '001' };
/** The regions named by ICU's short form: "Hong Kong", not "Hong Kong SAR China" (中国香港特别行政区 → 香港). */
const SHORT_REGIONS = new Set(['HK', 'MO']);
/** Scripts English names in fewer words than ICU's. */
const ENGLISH_SCRIPTS: Readonly<Record<string, string>> = { Cans: 'Syllabics' };

/** `text` with the last `from` in it replaced: the qualifiers come last, after the language's own name. */
function replaceLast(text: string, from: string | undefined, to: string): string {
  if (!from || from === to) return text;
  const at = text.lastIndexOf(from);
  return at < 0 ? text : text.slice(0, at) + to + text.slice(at + from.length);
}

const titleCase = (word: string): string => word[0].toUpperCase() + word.slice(1);

/** The dialects the plugin's strings name, by variant: Azure's six (its voice list, 2026-10-18). */
const PLACES: Readonly<Record<string, () => string>> = {
  guangxi: () => t('ztts-place-guangxi'),
  henan: () => t('ztts-place-henan'),
  liaoning: () => t('ztts-place-liaoning'),
  shaanxi: () => t('ztts-place-shaanxi'),
  shandong: () => t('ztts-place-shandong'),
  sichuan: () => t('ztts-place-sichuan'),
};

/** A dialect's place from the plugin's strings; none for a variant they lack, or while they are not loaded (`t` answers the id). */
function stringsPlace(variant: string): string | undefined {
  const text = Object.prototype.hasOwnProperty.call(PLACES, variant) ? PLACES[variant]() : '';
  return text && !text.startsWith('ztts-') ? text : undefined;
}

export interface LanguageNameOptions {
  /** The locale the names are written in; the app's when none. */
  locale?: string;
  /** A dialect's place by its variant (`liaoning` → 辽宁); the plugin's strings when none, the variant in title case where that answers nothing. */
  place?(variant: string): string | undefined;
}

/**
 * The name of each of an entry's locales (issue #223): only what tells a
 * language apart from the entry's others of the same language, by the rules
 * of OpenReader's `languageNames` (xujialiu/OpenReader#300):
 *
 * - **A dialect** (a variant: `zh-CN-liaoning`) by its place alone, always:
 *   `Chinese (Liaoning)`, never `Chinese (China, LIAONING)`.
 * - **A script** for every locale of the language once one of its tags
 *   writes a script that is not the one it would mean anyway: `sr-Latn-RS`
 *   makes `Serbian (Latin)`, and `sr-RS` beside it `Serbian (Cyrillic)`.
 *   `zh-HK` means Traditional, but no Chinese tag a provider sends writes a
 *   script, so Chinese is never `Simplified` or `Traditional`.
 * - **A country** only where the language's tags hold more than one, a tag
 *   without one counting as one: `English (United States)` beside
 *   `English (United Kingdom)`, a lone `ja-JP` plain `Japanese`.
 * - Shorter words where ICU's are official ones: `Hong Kong` and `Macao`,
 *   and in English `Syllabics`.
 *
 * Unlike OpenReader, whose phone has no `Intl.DisplayNames` and reads an
 * English table, the names are ICU's own in the app's language (the owner's
 * answer of 2026-10-18): each is asked for the tag rebuilt from what tells
 * it apart, so the words and the punctuation are the locale's — 中文（香港）.
 * `mul` is Multilingual and no language's kin; a tag ICU cannot read is
 * named as it was given and counts as no language's.
 */
export function languageNames(locales: Iterable<string>, options: LanguageNameOptions = {}): Map<string, string> {
  const list = [...new Set(locales)];
  // The Player asks four times a second per tab (ui/player.ts), Azure's
  // entry with some 150 locales: the same question is answered once. The
  // places come from the plugin's strings, so whether they are loaded is
  // part of the question
  const key = options.place ? null : `${options.locale ?? ''}\u0000${hasMessageSource()}\u0000${list.join('\u0001')}`;
  const known = key === null ? undefined : answered.get(key);
  if (known) return new Map(known);
  const names = nameAll(list, options);
  if (key !== null) {
    if (answered.size >= ANSWERS_KEPT) answered.delete(answered.keys().next().value!);
    answered.set(key, names);
  }
  return new Map(names);
}

/** The answers languageNames keeps, oldest first: a few entries' lists in one or two locales. */
const answered = new Map<string, Map<string, string>>();
const ANSWERS_KEPT = 32;

function nameAll(list: readonly string[], options: LanguageNameOptions): Map<string, string> {
  const parsed = new Map<string, Parts>();
  const byLanguage = new Map<string, Parts[]>();
  for (const locale of list) {
    if (locale === MULTILINGUAL) continue;
    const parts = partsOf(locale);
    if (!parts) continue;
    parsed.set(locale, parts);
    byLanguage.set(parts.language, [...(byLanguage.get(parts.language) ?? []), parts]);
  }
  // Per language, once: whether a script or a country tells its locales apart
  const tells = new Map<string, { script: boolean; region: boolean }>();
  for (const [language, kin] of byLanguage) {
    tells.set(language, {
      script: kin.some((one) => one.script !== undefined && one.script !== likelyScript(one)),
      region: new Set(kin.map((one) => one.region)).size > 1,
    });
  }

  const at = options.locale ? [options.locale] : undefined;
  let languageNamer: Intl.DisplayNames;
  let regionNamer: Intl.DisplayNames;
  let shortRegionNamer: Intl.DisplayNames;
  let scriptNamer: Intl.DisplayNames;
  try {
    languageNamer = new Intl.DisplayNames(at, { type: 'language', languageDisplay: 'standard' });
    regionNamer = new Intl.DisplayNames(at, { type: 'region' });
    shortRegionNamer = new Intl.DisplayNames(at, { type: 'region', style: 'short' });
    scriptNamer = new Intl.DisplayNames(at, { type: 'script' });
  } catch {
    return new Map(list.map((locale) => [locale, locale === MULTILINGUAL ? languageDisplayName(locale, options.locale) : locale]));
  }
  const english = baseLanguage(languageNamer.resolvedOptions().locale) === 'en';
  const place = (variant: string): string => (options.place ?? stringsPlace)(variant) || titleCase(variant);

  const nameOf = (locale: string): string => {
    if (locale === MULTILINGUAL) return languageDisplayName(locale, options.locale);
    const parts = parsed.get(locale);
    if (!parts) return locale;
    const tell = tells.get(parts.language) ?? { script: false, region: false };
    const script = tell.script ? (parts.script ?? likelyScript(parts)) : undefined;
    const dialect = parts.variants.length > 0;
    // The region ICU is asked to name: a dialect's is a stand-in its place replaces
    const region = dialect ? (parts.region ?? 'ZZ') : tell.region && parts.region ? (NAMED_AS[parts.region] ?? parts.region) : undefined;
    const tag = [parts.language, script, region].filter(Boolean).join('-');
    let name = languageNamer.of(tag) ?? locale;
    if (region) {
      const long = regionNamer.of(region);
      if (dialect) name = replaceLast(name, long, [...parts.variants].sort().map(place).join(', '));
      else if (SHORT_REGIONS.has(region)) name = replaceLast(name, long, shortRegionNamer.of(region) ?? long ?? region);
    }
    if (script && english && ENGLISH_SCRIPTS[script]) name = replaceLast(name, scriptNamer.of(script), ENGLISH_SCRIPTS[script]);
    return name;
  };

  return new Map(
    list.map((locale) => {
      try {
        return [locale, nameOf(locale)];
      } catch {
        return [locale, locale];
      }
    }),
  );
}
