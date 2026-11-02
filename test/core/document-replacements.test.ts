import { describe, expect, it } from 'vitest';
import {
  createDocumentReplacements,
  documentReplacementSettings,
  readGlobalReplacements,
  writeGlobalReplacements,
} from '../../src/core/document-replacements';
import type { Replacement } from '../../src/core/replacements';
import { DEFAULTS, PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { applyBackup, createBackup, parseBackup, serializeBackup } from '../../src/core/settings-backup';
import { mergeSharedSettings, SYNCABLE_KEYS } from '../../src/core/settings-sync';

function prefs(): PrefsBackend & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return { values, get: (key) => values.get(key), set: (key, value) => { values.set(key, value); },
    keys: (prefix) => [...values.keys()].filter((key) => key.startsWith(prefix)) };
}

const row = (text: string, readAs: string): Replacement => ({ text, readAs, mode: 'exact', matchCase: true });

describe('global replacements', () => {
  it('are one setting, empty by default, that the backup and the sync carry whole', () => {
    expect(DEFAULTS.readAloud.replacements).toBe('[]');
    expect(SYNCABLE_KEYS).toContain('readAloud.replacements');
    const p = prefs();
    expect(readGlobalReplacements(p)).toEqual([]);
    writeGlobalReplacements(p, [row('IL-6', 'interleukin six')]);
    expect(readGlobalReplacements(p)).toEqual([row('IL-6', 'interleukin six')]);
    const target = prefs();
    applyBackup(target, parseBackup(serializeBackup(createBackup(p))));
    expect(readGlobalReplacements(target)).toEqual([row('IL-6', 'interleukin six')]);
  });
});

describe('document replacements', () => {
  it('keep one record per document, timed, and pulse the sync on a save', () => {
    const p = prefs();
    let now = 100;
    const documents = createDocumentReplacements(p, () => now);
    expect(documents.get('user/ABCDEFGH')).toBeNull();
    documents.save('user/ABCDEFGH', [row('IL', 'I L')]);
    expect(documents.get('user/ABCDEFGH')).toEqual({ rows: [row('IL', 'I L')], ts: 100 });
    // A clock that went back still moves the record forward
    now = 50;
    expect(documents.save('user/ABCDEFGH', []).ts).toBe(101);
    expect(documents.get('user/ABCDEFGH')).toEqual({ rows: [], ts: 101 });
    expect(Number(p.get(PREF_PREFIX + 'documentReplacementsChanged'))).toBe(2);
    expect(() => documents.save('nonsense', [])).toThrow();
    expect(documentReplacementSettings(p)).toEqual({ 'documentReplacements.user/ABCDEFGH': JSON.stringify({ rows: [], ts: 101 }) });
  });

  it('are backed up and restored, and a malformed record is ignored', () => {
    const source = prefs(), target = prefs();
    createDocumentReplacements(source, () => 100).save('group-23/ABCDEFGH', [row('IL', 'I L')]);
    applyBackup(target, parseBackup(serializeBackup(createBackup(source))));
    expect(createDocumentReplacements(target).get('group-23/ABCDEFGH')).toEqual({ rows: [row('IL', 'I L')], ts: 100 });
    const parsed = parseBackup(JSON.stringify({ format: 'zotero-tts-settings', settings: {
      'documentReplacements.user/ABCDEFGH': '{bad', 'documentReplacements.__proto__': '{"rows":[],"ts":5}', 'readAloud.volume': 80,
    } }));
    expect(parsed.settings).toEqual({ 'readAloud.volume': 80 });
    expect(parsed.ignored).toHaveLength(2);
  });

  it('sync per document, the newer record winning whole, an emptied list included', () => {
    const key = 'documentReplacements.user/ABCDEFGH', other = 'documentReplacements.user/BCDEFGHJ';
    const mine = JSON.stringify({ rows: [row('IL', 'I L')], ts: 100 });
    const emptied = JSON.stringify({ rows: [], ts: 200 });
    const plan = mergeSharedSettings({ values: { [key]: mine }, stamps: {}, machine: 'a' }, [
      { key, value: emptied, ts: 200, by: 'b' }, { key: other, value: mine, ts: 100, by: 'b' },
    ]);
    expect(plan.adopt.map((item) => [item.key, item.value])).toEqual([[key, emptied], [other, mine]]);
    const older = mergeSharedSettings({ values: { [key]: emptied }, stamps: {}, machine: 'a' }, [{ key, value: mine, ts: 100, by: 'b' }]);
    expect(older.adopt).toEqual([]);
    expect(older.pushed).toContain(key);
    expect(older.items.find((item) => item.key === key)?.value).toBe(emptied);
  });

  it('converge on a tie', () => {
    const key = 'documentReplacements.user/ABCDEFGH';
    const a = JSON.stringify({ rows: [row('a', 'x')], ts: 100 });
    const b = JSON.stringify({ rows: [row('b', 'x')], ts: 100 });
    const left = mergeSharedSettings({ values: { [key]: a }, stamps: {}, machine: 'a' }, [{ key, value: b, ts: 100, by: 'b' }]);
    const right = mergeSharedSettings({ values: { [key]: b }, stamps: {}, machine: 'b' }, [{ key, value: a, ts: 100, by: 'a' }]);
    expect(left.items.find((item) => item.key === key)?.value).toBe(right.items.find((item) => item.key === key)?.value);
  });
});
