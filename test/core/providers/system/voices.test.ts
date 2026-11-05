import { describe, expect, it } from 'vitest';
import type { SystemVoiceRecord } from '../../../../src/core/providers/system/protocol';
import { localeForSystemVoice, readVoiceRecords, systemVoiceIdFor, toVoiceInfo, zoteroVoiceId } from '../../../../src/core/providers/system/voices';

/**
 * The nine voices this Windows 11 machine reports, measured 2026-08-29:
 * three through System.Speech and six through WinRT, which together are
 * exactly what `speechSynthesis.getVoices()` lists in Zotero — one for one.
 */
const INSTALLED: SystemVoiceRecord[] = [
  { id: 'sapi5/TTS_MS_EN-US_DAVID_11.0', name: 'Microsoft David Desktop', desc: 'Microsoft David Desktop - English (United States)', lang: 'en-US' },
  { id: 'sapi5/TTS_MS_EN-US_ZIRA_11.0', name: 'Microsoft Zira Desktop', desc: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US' },
  { id: 'sapi5/TTS_MS_ZH-CN_HUIHUI_11.0', name: 'Microsoft Huihui Desktop', desc: 'Microsoft Huihui Desktop - Chinese (Simplified)', lang: 'zh-CN' },
  { id: 'onecore/MSTTS_V110_enUS_DavidM', name: 'Microsoft David', desc: 'Microsoft David - English (United States)', lang: 'en-US' },
  { id: 'onecore/MSTTS_V110_enUS_ZiraM', name: 'Microsoft Zira', desc: 'Microsoft Zira - English (United States)', lang: 'en-US' },
  { id: 'onecore/MSTTS_V110_enUS_MarkM', name: 'Microsoft Mark', desc: 'Microsoft Mark - English (United States)', lang: 'en-US' },
  { id: 'onecore/MSTTS_V110_zhCN_HuihuiM', name: 'Microsoft Huihui', desc: 'Microsoft Huihui - Chinese (Simplified, PRC)', lang: 'zh-CN' },
  { id: 'onecore/MSTTS_V110_zhCN_YaoyaoM', name: 'Microsoft Yaoyao', desc: 'Microsoft Yaoyao - Chinese (Simplified, PRC)', lang: 'zh-CN' },
  { id: 'onecore/MSTTS_V110_zhCN_KangkangM', name: 'Microsoft Kangkang', desc: 'Microsoft Kangkang - Chinese (Simplified, PRC)', lang: 'zh-CN' },
];

/** The ids the reader publishes for the same nine, read out of Zotero 10.0.2-beta.1 the same day. */
const ZOTERO_IDS = [
  'local-urn:moz-tts:sapi:Microsoft David - English (United States)?en-US',
  'local-urn:moz-tts:sapi:Microsoft Mark - English (United States)?en-US',
  'local-urn:moz-tts:sapi:Microsoft Zira - English (United States)?en-US',
  'local-urn:moz-tts:sapi:Microsoft Huihui - Chinese (Simplified, PRC)?zh-CN',
  'local-urn:moz-tts:sapi:Microsoft Kangkang - Chinese (Simplified, PRC)?zh-CN',
  'local-urn:moz-tts:sapi:Microsoft Yaoyao - Chinese (Simplified, PRC)?zh-CN',
  'local-urn:moz-tts:sapi:Microsoft David Desktop - English (United States)?en-US',
  'local-urn:moz-tts:sapi:Microsoft Zira Desktop - English (United States)?en-US',
  'local-urn:moz-tts:sapi:Microsoft Huihui Desktop - Chinese (Simplified)?zh-CN',
];

describe('toVoiceInfo', () => {
  it('omits Microsoft and the language while keeping Desktop voices distinct', () => {
    expect(toVoiceInfo(INSTALLED[3])).toEqual({ id: 'onecore/MSTTS_V110_enUS_DavidM', label: 'David', locale: 'en-US' });
    expect(toVoiceInfo(INSTALLED[0]).label).toBe('David Desktop');
  });

  it.each([
    { id: 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1', name: 'Microsoft Andrew', expected: 'Andrew (Natural HD)' },
    { id: 'sapi5/Edge-en-US-AndrewNeural', name: 'Microsoft Andrew Online', expected: 'Andrew Online (Natural)' },
    { id: 'sapi5/Edge-en-US-AndrewMultilingualNeural', name: 'Microsoft AndrewMultilingual Online', expected: 'AndrewMultilingual Online (Natural)' },
  ])('displays $expected without changing the Windows voice identity', ({ id, name, expected }) => {
    const desc = `Microsoft ${expected} - English (United States)`;
    const record = { id, name, desc, lang: 'en-US' };
    expect(toVoiceInfo(record)).toEqual({ id, label: expected, locale: 'en-US' });
    expect(record).toEqual({ id, name, desc, lang: 'en-US' });
    expect(zoteroVoiceId(record)).toBe(`local-urn:moz-tts:sapi:${desc}?en-US`);
  });

  it('drops localized language suffixes without losing the voice quality', () => {
    expect(toVoiceInfo({ id: 'sapi5/AndrewHD', name: 'Microsoft Andrew', desc: 'Microsoft Andrew (Natural HD) - 英语（美国）', lang: 'en-US' }).label).toBe('Andrew (Natural HD)');
  });

  it('uses a Microsoft plain name when its description is missing', () => {
    expect(toVoiceInfo({ id: 'sapi5/David', name: 'Microsoft David Desktop', desc: '', lang: 'en-US' }).label).toBe('David Desktop');
  });

  it('leaves other vendors and macOS display names unchanged', () => {
    expect(toVoiceInfo({ id: 'sapi5/Acme', name: 'Acme Voice', desc: 'Acme Voice - English', lang: 'en-US' }).label).toBe('Acme Voice');
    expect(toVoiceInfo({ id: 'osx/test', name: 'Microsoft Example', desc: 'Microsoft Example - English', lang: 'en-US' }).label).toBe('Microsoft Example');
  });

  it('falls back to the description, then the id, rather than publishing a blank label', () => {
    expect(toVoiceInfo({ id: 'sapi5/X', name: '', desc: 'Some Voice - English', lang: 'en-US' }).label).toBe('Some Voice - English');
    expect(toVoiceInfo({ id: 'sapi5/X', name: '', desc: '', lang: 'en-US' }).label).toBe('sapi5/X');
  });

  it('keeps the id as the engine token, which no display language can change', () => {
    for (const record of INSTALLED) expect(toVoiceInfo(record).id).toMatch(/^(sapi5|onecore)\/[A-Za-z0-9._-]+$/);
  });
});

describe('localeForSystemVoice', () => {
  it('passes Windows’ own tag through', () => {
    expect(localeForSystemVoice({ lang: 'zh-CN' })).toBe('zh-CN');
    expect(localeForSystemVoice({ lang: 'de' })).toBe('de');
  });

  it('never publishes an empty locale', () => {
    expect(localeForSystemVoice({ lang: '  ' })).toBe('en-US');
  });
});

describe('zoteroVoiceId', () => {
  it('rebuilds every id the reader publishes for these voices, exactly', () => {
    expect(INSTALLED.map(zoteroVoiceId).sort()).toEqual([...ZOTERO_IDS].sort());
  });
});

describe('systemVoiceIdFor', () => {
  it('finds the installed voice behind one of Zotero’s ids', () => {
    expect(systemVoiceIdFor(ZOTERO_IDS[0], INSTALLED)).toBe('onecore/MSTTS_V110_enUS_DavidM');
    // The Desktop entry is a different voice, and maps to the SAPI token
    expect(systemVoiceIdFor(ZOTERO_IDS[6], INSTALLED)).toBe('sapi5/TTS_MS_EN-US_DAVID_11.0');
  });

  it('answers null rather than guessing, for a voice that is not installed here', () => {
    expect(systemVoiceIdFor('local-urn:moz-tts:sapi:Microsoft Hazel - English (Great Britain)?en-GB', INSTALLED)).toBeNull();
    // Right voice, wrong language: still not the same id
    expect(systemVoiceIdFor('local-urn:moz-tts:sapi:Microsoft David - English (United States)?en-GB', INSTALLED)).toBeNull();
    expect(systemVoiceIdFor('system::onecore/MSTTS_V110_enUS_DavidM', INSTALLED)).toBeNull();
    expect(systemVoiceIdFor('', INSTALLED)).toBeNull();
  });

  it('never matches a record with no description, which could only match by accident', () => {
    expect(systemVoiceIdFor('local-urn:moz-tts:sapi:?en-US', [{ id: 'sapi5/X', name: 'X', desc: '', lang: 'en-US' }])).toBeNull();
  });
});

describe('readVoiceRecords', () => {
  it('takes what the helper sent and drops what is not a voice', () => {
    const raw = [INSTALLED[0], { name: 'no id' }, null, 'nonsense', { id: 'sapi5/Y' }];
    expect(readVoiceRecords(raw)).toEqual([INSTALLED[0], { id: 'sapi5/Y', name: '', desc: '', lang: '' }]);
  });

  it('reads a missing list as no voices, not as a crash', () => {
    expect(readVoiceRecords(undefined)).toEqual([]);
    expect(readVoiceRecords({})).toEqual([]);
  });
});

// Issue #23: on macOS Gecko's id is the identifier itself, with no language
// suffix (`urn:moz-tts:osx:<identifier>`, measured against all 191 voices
// of this Mac on 2026-09-06), and the identifier is the plugin's id too
describe('macOS ids (issue #23)', () => {
  const SAMANTHA: SystemVoiceRecord = { id: 'osx/com.apple.voice.compact.en-US.Samantha', name: 'Samantha', desc: 'Samantha', lang: 'en-US' };
  const SOUMYA: SystemVoiceRecord = { id: 'osx/com.apple.voice.compact.kn-IN.Alpana', name: 'Soumya', desc: 'Soumya', lang: 'kn-IN' };

  it('rebuilds Gecko’s osx id from the identifier alone', () => {
    expect(zoteroVoiceId(SAMANTHA)).toBe('local-urn:moz-tts:osx:com.apple.voice.compact.en-US.Samantha');
    // The display name is not in the id, and does not need to be
    expect(zoteroVoiceId(SOUMYA)).toBe('local-urn:moz-tts:osx:com.apple.voice.compact.kn-IN.Alpana');
  });

  it('finds the installed voice behind one, and nothing behind a Windows-shaped id', () => {
    expect(systemVoiceIdFor('local-urn:moz-tts:osx:com.apple.voice.compact.en-US.Samantha', [SOUMYA, SAMANTHA])).toBe(SAMANTHA.id);
    expect(systemVoiceIdFor('local-urn:moz-tts:sapi:Samantha?en-US', [SAMANTHA])).toBeNull();
    expect(systemVoiceIdFor('local-urn:moz-tts:osx:com.apple.voice.compact.en-US.Samantha?en-US', [SAMANTHA])).toBeNull();
  });

  it('labels by the display name and keeps the identifier as the id', () => {
    expect(toVoiceInfo(SOUMYA)).toEqual({ id: 'osx/com.apple.voice.compact.kn-IN.Alpana', label: 'Soumya', locale: 'kn-IN' });
  });

  it('has no Zotero id for a Windows record without a description', () => {
    expect(zoteroVoiceId({ id: 'sapi5/X', desc: '', lang: 'en-US' })).toBeNull();
  });
});
