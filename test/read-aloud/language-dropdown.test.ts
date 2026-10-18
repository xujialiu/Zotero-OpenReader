import { describe, expect, it } from 'vitest';
import { baseLanguage, languageDisplayName, languageNames } from '../../src/read-aloud/language-dropdown';

// The Player's language dropdown and the voice browser's language column
// (issue #223): every locale its own language, named by only what tells it
// apart from the entry's others of the same language — OpenReader's rules
// (xujialiu/OpenReader#300), in the app's language.

const named = (locales: string[], locale = 'en') => Object.fromEntries(languageNames(locales, { locale }));

describe('baseLanguage', () => {
  it('is the tag up to its first hyphen', () => {
    expect(baseLanguage('en-US')).toBe('en');
    expect(baseLanguage('zh-Hans-CN')).toBe('zh');
    expect(baseLanguage('mul')).toBe('mul');
  });
});

describe('languageNames', () => {
  // Azure's Chinese, as its voice list sends them (OpenReader#300's evidence)
  const AZURE_CHINESE = [
    'zh-CN', 'zh-HK', 'zh-TW', 'zh-CN-guangxi', 'zh-CN-henan', 'zh-CN-liaoning',
    'zh-CN-shaanxi', 'zh-CN-shandong', 'zh-CN-sichuan', 'yue-CN', 'wuu-CN',
  ];

  it('names Azure’s Chinese each by what tells it apart: a dialect by its place, Hong Kong as Hong Kong', () => {
    expect(named(AZURE_CHINESE)).toEqual({
      'zh-CN': 'Chinese (China)',
      'zh-HK': 'Chinese (Hong Kong)',
      'zh-TW': 'Chinese (Taiwan)',
      'zh-CN-guangxi': 'Chinese (Guangxi)',
      'zh-CN-henan': 'Chinese (Henan)',
      'zh-CN-liaoning': 'Chinese (Liaoning)',
      'zh-CN-shaanxi': 'Chinese (Shaanxi)',
      'zh-CN-shandong': 'Chinese (Shandong)',
      'zh-CN-sichuan': 'Chinese (Sichuan)',
      'yue-CN': 'Cantonese',
      'wuu-CN': 'Wu Chinese',
    });
  });

  it('names a country only where the language’s locales hold more than one', () => {
    expect(named(['en-US', 'en-GB', 'de-DE', 'ja-JP'])).toEqual({
      'en-US': 'English (United States)',
      'en-GB': 'English (United Kingdom)',
      'de-DE': 'German',
      'ja-JP': 'Japanese',
    });
    expect(named(['en-US'])).toEqual({ 'en-US': 'English' });
    // A locale without a country counts as one of its own
    expect(named(['en', 'en-US'])).toEqual({ en: 'English', 'en-US': 'English (United States)' });
    expect(named(['en-US', 'en-HK'])).toEqual({ 'en-US': 'English (United States)', 'en-HK': 'English (Hong Kong)' });
  });

  it('names a dialect’s place even when it is the entry’s only one of its language', () => {
    expect(named(['zh-CN-sichuan'])).toEqual({ 'zh-CN-sichuan': 'Chinese (Sichuan)' });
    expect(named(['zh-CN', 'zh-CN-sichuan'])).toEqual({ 'zh-CN': 'Chinese', 'zh-CN-sichuan': 'Chinese (Sichuan)' });
    expect(named(['ca-ES-valencia', 'ca-ES'])).toEqual({ 'ca-ES-valencia': 'Catalan (Valencia)', 'ca-ES': 'Catalan' });
  });

  it('names a script that is not the usual one even alone, and the usual one only beside it', () => {
    expect(named(['sr-RS', 'sr-Latn-RS'])).toEqual({ 'sr-RS': 'Serbian (Cyrillic)', 'sr-Latn-RS': 'Serbian (Latin)' });
    expect(named(['iu-Cans-CA', 'iu-Latn-CA'])).toEqual({ 'iu-Cans-CA': 'Inuktitut (Syllabics)', 'iu-Latn-CA': 'Inuktitut (Latin)' });
    expect(named(['sr-Latn-RS'])).toEqual({ 'sr-Latn-RS': 'Serbian (Latin)' });
    expect(named(['uz-Latn-UZ'])).toEqual({ 'uz-Latn-UZ': 'Uzbek' });
    // An alias brings its script: sh is Serbian in Latin
    expect(named(['sh-RS'])).toEqual({ 'sh-RS': 'Serbian (Latin)' });
    // No Chinese tag a provider sends writes a script, and a written usual one tells nothing
    expect(named(['zh-Hant-TW', 'zh-CN'])).toEqual({ 'zh-Hant-TW': 'Chinese (Taiwan)', 'zh-CN': 'Chinese (China)' });
    expect(named(['zh-Hans', 'zh-Hant'])).toEqual({ 'zh-Hans': 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)' });
  });

  it('names script and place both where both differ', () => {
    expect(named(['sr-RS', 'sr-Latn-RS', 'sr-ME'])).toEqual({
      'sr-RS': 'Serbian (Cyrillic, Serbia)',
      'sr-Latn-RS': 'Serbian (Latin, Serbia)',
      'sr-ME': 'Serbian (Latin, Montenegro)',
    });
  });

  it('shortens Macao as it does Hong Kong, numeric codes too', () => {
    expect(named(['zh-HK', 'zh-MO', 'zh-CN'])).toEqual({ 'zh-HK': 'Chinese (Hong Kong)', 'zh-MO': 'Chinese (Macao)', 'zh-CN': 'Chinese (China)' });
    expect(named(['zh-344', 'zh-446'])).toEqual({ 'zh-344': 'Chinese (Hong Kong)', 'zh-446': 'Chinese (Macao)' });
  });

  // Zotero Premium's Arabic (api.zotero.org/tts/voices, 2026-10-18): 25 voices
  // under Google's ar-XA, whose region ICU names the pseudo-locale "Pseudo-Accents"
  it('names Zotero’s ar-XA as the world’s Arabic beside Saudi Arabia’s', () => {
    expect(named(['ar-XA', 'ar-SA'])).toEqual({ 'ar-XA': 'Arabic (world)', 'ar-SA': 'Arabic (Saudi Arabia)' });
    expect(named(['ar-XA'])).toEqual({ 'ar-XA': 'Arabic' });
    expect(named(['ar-SA', 'ar-EG'])).toEqual({ 'ar-SA': 'Arabic (Saudi Arabia)', 'ar-EG': 'Arabic (Egypt)' });
  });

  it('names Multilingual as such, and lets it count as no language’s', () => {
    expect(named(['mul', 'en-US'])).toEqual({ mul: 'Multilingual', 'en-US': 'English' });
    expect(named(['mul'], 'zh-CN')).toEqual({ mul: '多语种' });
  });

  it('gives back a tag it cannot read, and does not let it count as another of its language', () => {
    expect(named(['en_US', 'zh-CN-u-co-pinyin', 'zh-CN'])).toEqual({ en_US: 'en_US', 'zh-CN-u-co-pinyin': 'zh-CN-u-co-pinyin', 'zh-CN': 'Chinese' });
  });

  it('counts a locale listed twice once', () => {
    expect([...languageNames(['en-US', 'en-US'], { locale: 'en' })]).toEqual([['en-US', 'English']]);
  });

  // The owner's answer of 2026-10-18: the names follow Zotero's language
  it('writes the names in the app’s language, with its own words and punctuation', () => {
    const places: Record<string, string> = { liaoning: '辽宁', sichuan: '四川' };
    const zh = Object.fromEntries(
      languageNames(['zh-CN', 'zh-HK', 'zh-TW', 'zh-CN-liaoning', 'zh-CN-sichuan', 'sr-RS', 'sr-Latn-RS', 'en-US', 'en-HK'], {
        locale: 'zh-CN',
        place: (variant) => places[variant],
      }),
    );
    expect(zh).toEqual({
      'zh-CN': '中文（中国）',
      'zh-HK': '中文（香港）',
      'zh-TW': '中文（台湾）',
      'zh-CN-liaoning': '中文（辽宁）',
      'zh-CN-sichuan': '中文（四川）',
      'sr-RS': '塞尔维亚语（西里尔文）',
      'sr-Latn-RS': '塞尔维亚语（拉丁文）',
      'en-US': '英语（美国）',
      'en-HK': '英语（香港）',
    });
  });

  it('takes a dialect’s place from the plugin’s strings, and writes one they lack in title case', () => {
    // The en-US file names Azure's six; any other variant is spelled from its tag
    expect(named(['zh-CN-liaoning', 'zh-CN-xinjiang'])).toEqual({ 'zh-CN-liaoning': 'Chinese (Liaoning)', 'zh-CN-xinjiang': 'Chinese (Xinjiang)' });
    expect(Object.fromEntries(languageNames(['zh-CN-xinjiang'], { locale: 'zh-CN', place: () => undefined }))).toEqual({ 'zh-CN-xinjiang': '中文（Xinjiang）' });
  });
});

describe('languageDisplayName', () => {
  it('writes the region in full — never "American English" — and Multilingual in English', () => {
    expect(languageDisplayName('en-US', 'en')).toBe('English (United States)');
    expect(languageDisplayName('en', 'en')).toBe('English');
    expect(languageDisplayName('mul', 'en')).toBe('Multilingual');
    expect(languageDisplayName('mul', 'en-GB')).toBe('Multilingual');
  });

  it('follows the app locale', () => {
    expect(languageDisplayName('en-US', 'zh-CN')).toBe('英语（美国）');
    expect(languageDisplayName('mul', 'zh-CN')).toBe('多语种');
  });

  it('falls back to the tag itself for one ICU cannot name', () => {
    expect(languageDisplayName('not a tag', 'en')).toBe('not a tag');
  });
});
