import { describe, expect, it } from 'vitest';
import { followTarget, lineWords, sameLine, type Box, type FollowInput } from '../../src/read-aloud/sentence-in-view';
import { DEFAULTS, loadSettings, PREF_PREFIX, readingLine } from '../../src/core/settings';
import { createBackup, parseBackup, applyBackup } from '../../src/core/settings-backup';
import { neverSynced, parseSharedSettings, serializeSharedSettings } from '../../src/core/settings-sync';

const viewport = { scrollTop: 1000, scrollLeft: 0, clientHeight: 1000, clientWidth: 800, scrollHeight: 8000, scrollWidth: 1600 };
const decide = (whole: Box, extra: Partial<FollowInput> = {}) => followTarget({ head: whole, whole, part: null, viewport, mode: 'outside', ...extra });

describe('auto-scroll modes', () => {
  it('does not scroll early at either edge, including the last visible pixel', () => {
    for (const box of [[10, 1000, 700, 1040], [10, 1950, 700, 2000]] as Box[]) {
      expect(decide(box)).toMatchObject({ reason: 'none', handled: true });
    }
  });
  it('centers a fitting sentence only on entry in sentence mode', () => {
    const box: Box = [10, 1750, 700, 1800];
    expect(decide(box, { mode: 'sentence', entered: true }).top).toBe(1275);
    expect(decide(box, { mode: 'sentence', entered: false }).reason).toBe('none');
    expect(decide(box, { mode: 'outside', entered: true }).reason).toBe('none');
  });
  it('centers actual clipping and adjusts horizontal clipping without premature vertical motion', () => {
    expect(decide([10, 1800, 700, 2001]).top).toBe(1400.5);
    expect(decide([820, 1500, 900, 1520])).toMatchObject({ left: 110 });
    expect(decide([820, 1500, 900, 1520]).top).toBeUndefined();
  });
  it('explicit return centers even a visible sentence in outside mode', () => {
    expect(decide([10, 1750, 700, 1800], { force: true }).top).toBe(1275);
  });
  it('starts an oversized sentence at its first line, then follows real words only outside', () => {
    const whole: Box = [10, 1000, 700, 2800];
    const head: Box = [10, 1600, 700, 1620];
    expect(decide(whole, { head, entered: true, part: [10, 2600, 60, 2620] }).top).toBe(1576);
    expect(decide(whole, { head, part: [10, 1990, 60, 2000] }).reason).toBe('none');
    expect(decide(whole, { head, part: [10, 2000, 60, 2020] }).top).toBe(1510);
    expect(decide(whole, { head, part: null, entered: false }).reason).toBe('none');
  });
  it('fits a sentence as tall as the viewport without imposing hidden margins', () => {
    expect(decide([0, 1000, 700, 2000])).toMatchObject({ fits: true, reason: 'none' });
  });
});

// Issue #155: the share of the space around the sentence left above it
describe('reading line', () => {
  const box: Box = [10, 1750, 700, 1800];
  it('places an entered sentence so that the given share of the free space lies above it', () => {
    expect(decide(box, { mode: 'sentence', entered: true, line: 10 }).top).toBe(1655);
    expect(decide(box, { mode: 'sentence', entered: true, line: 0 }).top).toBe(1750);
    expect(decide(box, { mode: 'sentence', entered: true, line: 100 }).top).toBe(800);
    expect(decide(box, { mode: 'sentence', entered: true, line: 50 }).top).toBe(1275);
  });
  it('places clipped content and an explicit return at the same line', () => {
    expect(decide([10, 1800, 700, 2001], { line: 10 }).top).toBeCloseTo(1720.1);
    expect(decide(box, { force: true, line: 10 }).top).toBe(1655);
  });
  it("places a real word of an oversized sentence at the line, and still opens it at its head", () => {
    const whole: Box = [10, 1000, 700, 2800];
    const head: Box = [10, 1600, 700, 1620];
    expect(decide(whole, { head, part: [10, 2000, 60, 2020], line: 10 }).top).toBe(1902);
    expect(decide(whole, { head, entered: true, part: null, line: 10 }).top).toBe(1576);
  });
  it('measures the line in the part a docked bar leaves uncovered', () => {
    expect(decide(box, { mode: 'sentence', entered: true, line: 10, inset: { top: 40, bottom: 0 } }).top).toBe(1619);
  });
  it('reads a missing or unusable line as 50 and clamps one out of range', () => {
    const at = (line: unknown) => decide(box, { mode: 'sentence', entered: true, line: line as number }).top;
    expect(at(undefined)).toBe(1275);
    expect(at(Number.NaN)).toBe(1275);
    expect(at('10')).toBe(1275);
    expect(at(150)).toBe(800);
    expect(at(-5)).toBe(1750);
  });
});

// Issue #157: the line of text the highlighted word moves onto goes to the reading line
describe('scroll at every line', () => {
  const line = (extra: Partial<FollowInput>) => decide([10, 1750, 700, 1800], { mode: 'line', line: 30, ...extra });
  // The free space around a 20 px word line is 980 px: 294 of it above, at 30%
  const word: Box = [10, 1500, 60, 1520];

  it('takes a word as highlighted only with the Word switch on, and waits for one only when the sentence has real timings', () => {
    expect(lineWords({ wordShown: true, active: 'real', segment: 'real' })).toBe('word');
    expect(lineWords({ wordShown: true, active: 'none', segment: 'real' })).toBe('coming');
    expect(lineWords({ wordShown: true, active: 'stand-in', segment: 'stand-in' })).toBe('sentence');
    expect(lineWords({ wordShown: true, active: 'none', segment: 'stand-in' })).toBe('sentence');
    expect(lineWords({ wordShown: true, active: 'none', segment: 'none' })).toBe('sentence');
    for (const active of ['real', 'stand-in', 'none'] as const) {
      expect(lineWords({ wordShown: false, active, segment: 'real' })).toBe('sentence');
    }
  });
  it('tells a line of text by vertical overlap, a raised or lowered glyph included', () => {
    expect(sameLine(word, [70, 1502, 120, 1522])).toBe(true);
    expect(sameLine(word, [70, 1495, 80, 1505])).toBe(true);
    expect(sameLine(word, [10, 1524, 60, 1544])).toBe(false);
    expect(sameLine(word, [10, 1519, 60, 1539])).toBe(false);
  });
  it('places the first line of a sentence, then each new line, and holds still along a line', () => {
    expect(line({ words: 'word', wordLine: word, placedLine: null, entered: true })).toMatchObject({ reason: 'line', top: 1206, placedLine: word });
    const along = line({ words: 'word', wordLine: [70, 1500, 120, 1520], placedLine: word });
    expect(along).toMatchObject({ reason: 'none', handled: true });
    expect(along.top).toBeUndefined();
    expect(along.placedLine).toBeUndefined();
    const next: Box = [10, 1524, 60, 1544];
    expect(line({ words: 'word', wordLine: next, placedLine: word })).toMatchObject({ reason: 'line', top: 1230, placedLine: next });
  });
  it('places a new line even when it is already in view, and records a line already at the reading line', () => {
    expect(line({ words: 'word', wordLine: [10, 1100, 60, 1120], placedLine: word }).top).toBe(806);
    const there = decide([10, 1750, 700, 1800], { mode: 'line', line: 30, words: 'word', wordLine: word, placedLine: null,
      viewport: { ...viewport, scrollTop: 1206 } });
    expect(there).toMatchObject({ reason: 'none', placedLine: word });
    expect(there.top).toBeUndefined();
  });
  it('places the line on a return even when the line has not changed', () => {
    expect(line({ words: 'word', wordLine: word, placedLine: word, force: true })).toMatchObject({ reason: 'return', top: 1206, placedLine: word });
  });
  it('waits for the first word of a timed sentence, and a return meanwhile places its first line', () => {
    const head: Box = [10, 1600, 700, 1620];
    const waiting = line({ head, words: 'coming', entered: true });
    expect(waiting).toMatchObject({ reason: 'none', handled: true });
    expect(waiting.top).toBeUndefined();
    expect(line({ head, words: 'coming', force: true })).toMatchObject({ reason: 'return', top: 1306 });
  });
  it('scrolls at every sentence without a highlighted word', () => {
    const sentence = decide([10, 1750, 700, 1800], { mode: 'sentence', line: 30, entered: true });
    expect(sentence.top).toBe(1465);
    for (const extra of [{ words: 'sentence' as const }, { words: 'word' as const, wordLine: null }, {}]) {
      expect(line({ ...extra, entered: true })).toEqual(sentence);
      expect(line({ ...extra, entered: false }).reason).toBe('none');
    }
  });
  it('follows the lines of a sentence taller than the view instead of opening at its head', () => {
    const whole: Box = [10, 1000, 700, 2800];
    const head: Box = [10, 1600, 700, 1620];
    expect(decide(whole, { head, mode: 'line', line: 30, words: 'word', wordLine: [10, 2000, 60, 2020], placedLine: null, entered: true }))
      .toMatchObject({ reason: 'line', top: 1706, fits: false });
  });
  it('measures the line in the part a docked bar leaves uncovered, and brings a word in sideways', () => {
    expect(line({ words: 'word', wordLine: word, inset: { top: 40, bottom: 0 } }).top).toBe(1178);
    expect(line({ words: 'word', wordLine: [820, 1500, 870, 1520], placedLine: [10, 1500, 60, 1520] })).toMatchObject({ reason: 'cut', left: 80 });
  });
});

describe('auto-scroll preference', () => {
  it('starts new documents in automatic mode by default and backs up/syncs an explicit opt-out', () => {
    const data = new Map<string, unknown>();
    const prefs = { get: (k: string) => data.get(k), set: (k: string, v: unknown) => { data.set(k, v); } };
    expect(DEFAULTS.readAloud.defaultAutoScroll).toBe(true);
    expect(loadSettings(prefs).readAloud.defaultAutoScroll).toBe(true);
    data.set(PREF_PREFIX + 'readAloud.defaultAutoScroll', false);
    const backup = parseBackup(JSON.stringify(createBackup(prefs)));
    expect(backup.settings['readAloud.defaultAutoScroll']).toBe(false);
    data.clear(); applyBackup(prefs, backup);
    expect(loadSettings(prefs).readAloud.defaultAutoScroll).toBe(false);
    expect(neverSynced('readAloud.defaultAutoScroll')).toBe(false);
    const item = { key: 'readAloud.defaultAutoScroll', value: false, ts: 1, by: 'test' };
    expect(parseSharedSettings(serializeSharedSettings([item]))).toEqual([item]);
  });
  it('defaults to line (#157), validates stored values and survives backup/restore', () => {
    const data = new Map<string, unknown>();
    const prefs = { get: (k: string) => data.get(k), set: (k: string, v: unknown) => { data.set(k, v); } };
    expect(DEFAULTS.readAloud.autoScrollMode).toBe('line');
    expect(loadSettings(prefs).readAloud.autoScrollMode).toBe('line');
    data.set(PREF_PREFIX + 'readAloud.autoScrollMode', 'unsupported');
    expect(loadSettings(prefs).readAloud.autoScrollMode).toBe('line');
    data.set(PREF_PREFIX + 'readAloud.autoScrollMode', 'sentence');
    expect(loadSettings(prefs).readAloud.autoScrollMode).toBe('sentence');
    data.set(PREF_PREFIX + 'readAloud.autoScrollMode', 'outside');
    const backup = parseBackup(JSON.stringify(createBackup(prefs)));
    expect(backup.settings['readAloud.autoScrollMode']).toBe('outside');
    data.clear();
    applyBackup(prefs, backup);
    expect(loadSettings(prefs).readAloud.autoScrollMode).toBe('outside');
    expect(neverSynced('readAloud.autoScrollMode')).toBe(false);
    const item = { key: 'readAloud.autoScrollMode', value: 'sentence', ts: 1, by: 'test' };
    expect(parseSharedSettings(serializeSharedSettings([item]))).toEqual([item]);
  });
  it('keeps the reading line at 30 by default, whole and within 0 to 100, through backup and sync', () => {
    const data = new Map<string, unknown>();
    const prefs = { get: (k: string) => data.get(k), set: (k: string, v: unknown) => { data.set(k, v); } };
    expect(DEFAULTS.readAloud.readingLine).toBe(30);
    expect(loadSettings(prefs).readAloud.readingLine).toBe(30);
    for (const [stored, read] of [[150, 100], [-5, 0], [12.6, 13], ['10', 30], [Number.NaN, 30]] as const) {
      data.set(PREF_PREFIX + 'readAloud.readingLine', stored);
      expect(loadSettings(prefs).readAloud.readingLine).toBe(read);
      expect(readingLine(stored, 30)).toBe(read);
    }
    // The geometry left without a line centers
    expect(readingLine(undefined)).toBe(50);
    expect(readingLine('10')).toBe(50);
    data.set(PREF_PREFIX + 'readAloud.readingLine', 10);
    const backup = parseBackup(JSON.stringify(createBackup(prefs)));
    expect(backup.settings['readAloud.readingLine']).toBe(10);
    data.clear();
    applyBackup(prefs, backup);
    expect(loadSettings(prefs).readAloud.readingLine).toBe(10);
    expect(neverSynced('readAloud.readingLine')).toBe(false);
    const item = { key: 'readAloud.readingLine', value: 10, ts: 1, by: 'test' };
    expect(parseSharedSettings(serializeSharedSettings([item]))).toEqual([item]);
  });
});
