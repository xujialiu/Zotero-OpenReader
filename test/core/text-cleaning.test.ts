import { describe, expect, it } from 'vitest';
import { findReplacements, mapTimestampsToDocument, type Replacement } from '../../src/core/replacements';
import { prepareDocumentSpeech, TEXT_CLEANING_RULES, type TextCleaningContext, type TextCleaningRule } from '../../src/core/text-cleaning';

const prepare = (text: string) => prepareDocumentSpeech(text, [], { stripBrackets: false });

describe('Text cleaning speech preparation (issue #240)', () => {
  it('maintains only the Chinese-whitespace rule, explicitly applicable to every document and Provider', () => {
    expect(TEXT_CLEANING_RULES).toMatchObject([
      { id: 'chinese-whitespace', scope: { documentTypes: 'all', providers: 'all' } },
    ]);
    expect(TEXT_CLEANING_RULES).toHaveLength(1);
  });

  it('enforces both scope dimensions and never broadens a restricted rule when metadata is missing', () => {
    const rules: TextCleaningRule[] = [{
      ...TEXT_CLEANING_RULES[0],
      scope: { documentTypes: ['pdf'], providers: ['system'] },
    }];
    const run = (context: TextCleaningContext) => prepareDocumentSpeech('中 文', [], { stripBrackets: false, context, rules }).text;
    expect(run({ documentType: 'pdf', provider: 'system' })).toBe('中文');
    expect(run({ documentType: 'epub', provider: 'system' })).toBe('中 文');
    expect(run({ documentType: 'pdf', provider: 'azure' })).toBe('中 文');
    expect(run({ documentType: 'pdf' })).toBe('中 文');
    expect(run({ provider: 'system' })).toBe('中 文');
    expect(run({})).toBe('中 文');
    expect(prepare('中 文').text).toBe('中文');
    expect(prepareDocumentSpeech('中 文', [], { rules: [{ ...rules[0], scope: { documentTypes: [], providers: 'all' } }] }).text).toBe('中 文');
    expect(prepareDocumentSpeech('中 文', [], { rules: [{ ...rules[0], scope: { documentTypes: 'all', providers: [] } }] }).text).toBe('中 文');
    expect(prepareDocumentSpeech('中 文', [], { context: { documentType: 'pdf' }, rules: [{ ...rules[0], scope: { documentTypes: ['pdf'], providers: 'all' } }] }).text).toBe('中文');
    expect(prepareDocumentSpeech('中 文', [], { context: { provider: 'system' }, rules: [{ ...rules[0], scope: { documentTypes: 'all', providers: ['system'] } }] }).text).toBe('中文');
  });

  it('preserves supplementary Han and maps real word ranges through every whitespace variant', () => {
    const text = '𠀀 \u3000中\t\n文\u00a0字';
    const prepared = prepare(text);
    expect(prepared.text).toBe('𠀀中文字');
    expect(prepared.cleaning).toEqual([{ id: 'chinese-whitespace', removed: 5 }]);
    const timestamps = Object.freeze([
      Object.freeze({ start: 0, end: 1, charStart: 0, charEnd: 2 }),
      Object.freeze({ start: 1, end: 2, charStart: 2, charEnd: 4 }),
      Object.freeze({ start: 2, end: 3, charStart: 4, charEnd: 5 }),
    ]);
    expect(mapTimestampsToDocument(timestamps, prepared.pieces)).toEqual([
      { start: 0, end: 1, charStart: 0, charEnd: 2 },
      { start: 1, end: 2, charStart: 4, charEnd: 8 },
      { start: 2, end: 3, charStart: 9, charEnd: 10 },
    ]);
    expect(timestamps[1]).toEqual({ start: 1, end: 2, charStart: 2, charEnd: 4 });
  });

  it('matches Replacements on the original and leaves Read as opaque while cleaning after bracket removal', () => {
    const text = '中 文 [测 试]';
    const rows: Replacement[] = [{ text: '中 文', readAs: '甲 乙 [保 留]', mode: 'exact', matchCase: true }];
    const { spans } = findReplacements(text, rows);
    const prepared = prepareDocumentSpeech(text, spans);
    expect(prepared.text).toBe('甲 乙 [保 留] 测试');
    expect(mapTimestampsToDocument([
      { start: 0, end: 1, charStart: 5, charEnd: 6 },
      { start: 1, end: 2, charStart: 10, charEnd: 12 },
    ], prepared.pieces)).toEqual([
      { start: 0, end: 1, charStart: 0, charEnd: 3 },
      { start: 1, end: 2, charStart: 5, charEnd: 8 },
    ]);
    expect(prepareDocumentSpeech('中 [文]', []).text).toBe('中文');
    expect(prepare('中 [文]').text).toBe('中 [文]');
    const empty = findReplacements('中 X文', [{ text: 'X', readAs: '', mode: 'exact', matchCase: true }]);
    expect(prepareDocumentSpeech('中 X文', empty.spans).text).toBe('中 文');
  });

  it.each(['', ' \t中\n ', 'BNN 结构', '第 3 章', 'hello, world', '中文, 测试', '“ ”', 'A < 5 and B > 3'])('leaves %j byte-for-byte unchanged', (text) => {
    const prepared = prepare(text);
    expect(prepared.text).toBe(text);
    expect(prepared.changed).toBe(false);
    expect(prepared.cleaning).toEqual([]);
  });

  it.each(Array.from('，。！？；：、（）【】《》〈〉「」『』“”‘’〔〕［］｛｝…—·'))('cleans beside the supported Chinese punctuation %s', (punctuation) => {
    expect(prepare(`${punctuation} 中 文 ${punctuation}`).text).toBe(`${punctuation}中文${punctuation}`);
  });

  it('keeps leading and trailing whitespace and handles a long run without changing the Han characters', () => {
    const prepared = prepare(' \t中' + ' '.repeat(100_000) + '文\n ');
    expect(prepared.text).toBe(' \t中文\n ');
    expect(prepared.cleaning).toEqual([{ id: 'chinese-whitespace', removed: 100_000 }]);
  });

  it('cleans Han next to Chinese punctuation but not punctuation-only, Latin or numeric gaps', () => {
    expect(prepare('中文 ， 测试； BNN 结构，第 3 章。你好， “世界”').text)
      .toBe('中文，测试； BNN 结构，第 3 章。你好， “世界”');
  });
});
