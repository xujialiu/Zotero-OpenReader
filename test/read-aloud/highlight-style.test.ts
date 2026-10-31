import { describe, expect, it, vi } from 'vitest';
import {
  createHighlightStyling,
  highlightColor,
  primaryHighlightColor,
  secondaryHighlightColor,
  subtractRects,
  type HighlightStyle,
  type HighlightStylingDeps,
} from '../../src/read-aloud/highlight-style';
import { WHOLE_SEGMENT_END_SECONDS } from '../../src/read-aloud/remote-interface';
import { BR, paragraph, type Child } from './fake-dom';

const STYLE: HighlightStyle = { wordColor: '#ff0000', wordAlpha: 50, sentenceColor: '#00ff00', sentenceAlpha: 20, sentence: true };
const WORD = '#ff000080';
const SENTENCE = '#00ff0033';
const ZOTERO_SEGMENT = '#4072e573';
// What the fake manager reports while a word is being read; null models the
// gap between segments (ActiveSegmentChange(null) resets the manager).
const REAL_TIMESTAMP = { start: 0.1, end: 0.4, charStart: 0, charEnd: 5 };
const ZOTERO_SENTENCE = '#4072e54d';

describe('highlightColor', () => {
  it("appends the opacity as Zotero's constants have it", () => {
    expect(highlightColor('#4072e5', 45)).toBe(ZOTERO_SEGMENT);
    expect(highlightColor('#4072e5', 30)).toBe(ZOTERO_SENTENCE);
    expect(highlightColor('#FF0000', 50)).toBe(WORD);
    expect(highlightColor('#0f0', 20)).toBe(SENTENCE);
  });

  it('clamps the opacity and refuses anything that is not a color', () => {
    expect(highlightColor('#000000', 250)).toBe('#000000ff');
    expect(highlightColor('#000000', -5)).toBe('#00000000');
    expect(highlightColor('#000000', NaN)).toBe('#000000ff');
    expect(highlightColor('red', 50)).toBeNull();
    expect(highlightColor('#12345', 50)).toBeNull();
    expect(highlightColor('', 50)).toBeNull();
  });

  it('picks the word color for a word and the sentence color for anything coarser', () => {
    expect(primaryHighlightColor(STYLE, 'word')).toBe(WORD);
    expect(primaryHighlightColor(STYLE, 'sentence')).toBe(SENTENCE);
    expect(primaryHighlightColor(STYLE, 'paragraph')).toBe(SENTENCE);
    expect(primaryHighlightColor(STYLE, null)).toBe(SENTENCE);
    expect(secondaryHighlightColor(STYLE)).toBe(SENTENCE);
  });
});

describe('subtractRects', () => {
  // A line of a sentence, in Zotero's [x1, y1, x2, y2]
  const LINE = [10, 100, 200, 112];

  it('leaves the rectangles alone, by identity, when nothing overlaps them', () => {
    expect(subtractRects([LINE], [])).toEqual([LINE]);
    expect(subtractRects([LINE], [[300, 100, 320, 112]])[0]).toBe(LINE);
    expect(subtractRects([LINE], [[10, 200, 200, 212]])[0]).toBe(LINE);
    // Touching edges are not an overlap
    expect(subtractRects([LINE], [[200, 100, 240, 112]])[0]).toBe(LINE);
  });

  it('cuts the full height of the line, so its outline does not change as the word moves', () => {
    // A word box a little shorter than its line still takes the whole slot:
    // a strip left above or below it would change thickness with every word
    expect(subtractRects([LINE], [[80, 100, 120, 109]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
    ]);
    expect(subtractRects([LINE], [[80, 101, 120, 113]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
    ]);
  });

  it('leaves one piece for a word at either end of the line', () => {
    expect(subtractRects([LINE], [[10, 100, 60, 112]])).toEqual([[60, 100, 200, 112]]);
    expect(subtractRects([LINE], [[150, 100, 200, 112]])).toEqual([[10, 100, 150, 112]]);
  });

  it('leaves nothing when the hole spans the line, as a stand-in word does', () => {
    expect(subtractRects([LINE], [LINE])).toEqual([]);
    expect(subtractRects([LINE], [[0, 90, 300, 120]])).toEqual([]);
  });

  it("does not cut a line the hole only passes over, by Zotero's own same-line test", () => {
    // 60% of the shorter height has to overlap, as mergeLineRects has it
    expect(subtractRects([LINE], [[80, 105, 120, 130]])[0]).toBe(LINE);
    expect(subtractRects([LINE], [[80, 103, 120, 120]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
    ]);
  });

  it('cuts every hole out of every rectangle, and keeps the untouched lines', () => {
    const second = [10, 80, 200, 92];
    expect(subtractRects([LINE, second], [[80, 100, 120, 112], [30, 80, 50, 92]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
      [10, 80, 30, 92],
      [50, 80, 200, 92],
    ]);
  });

  it('drops slivers thinner than a tenth of a point, and anything that is not a rectangle', () => {
    expect(subtractRects([LINE], [[10.05, 100, 199.95, 112]])).toEqual([]);
    expect(subtractRects([LINE], [[80, 100, 120] as number[]])[0]).toBe(LINE);
    expect(subtractRects([[10, 100, 200] as number[]], [[80, 100, 120, 109]])).toEqual([[10, 100, 200]]);
  });
});

// ---- fakes of the two kinds of view, as the plugin sees them ---------------

type Position = { pageIndex: number; tag: string };
const segment = (tag: string) => ({ sourcePosition: { pageIndex: 0, tag } as Position, paragraphSourcePosition: { pageIndex: 0, tag: `${tag}-paragraph` } });

function fakePDF(granularity: string) {
  const pushed: Array<{ position: unknown; color: unknown }> = [];
  class Page {
    constructor(
      public _layer: unknown,
      public _pageIndex = 0,
    ) {}
    _pushHighlightedPosition(_items: unknown, position: unknown, color: unknown) {
      pushed.push({ position, color });
    }
  }
  class PDFView {
    _pages: Page[] = [];
    // Zotero draws a highlight only after a state was pushed to the view,
    // so the tests that draw without pushing one start from a state; a
    // view nothing was pushed to yet is `undefined`, as in Zotero
    _readAloudState: any = { popupOpen: true };
    _readAloudHighlightedPosition: unknown = null;
    _readAloudSentenceHighlightedPosition: unknown = null;
    _readAloudSentenceTimeout: unknown = null;
    // Zotero's _render is a class method and the plugin shadows it on the
    // prototype (issue #88); the paint itself is the mock, so a test can
    // count renders and see what was in place when one ran
    _painted = vi.fn();
    _render() {
      this._painted();
    }
    _effectiveReadAloudPrimaryGranularity(_state: unknown) {
      return granularity;
    }
    // Zotero's: the primary slot follows the granularity; on a segment
    // change the secondary slot gets the skip flash (handed in as
    // `state.flash` here) or null, with a two-second timer
    // Zotero's original runs in the reader's own compartment, on the real
    // view; the fake paints directly, so the Xray tests can hand it a
    // wrapper that hides prototype methods
    async setReadAloudState(state: any) {
      const previous = this._readAloudState;
      this._readAloudState = state;
      if (!state.popupOpen) {
        this._readAloudHighlightedPosition = null;
        this._readAloudSentenceHighlightedPosition = null;
        this._painted();
        return;
      }
      // Zotero skips the whole update, positions and all, without an active
      // position: the previous segment's highlights stay on screen
      if (state.activeSegment?.sourcePosition?.pageIndex === undefined) return;
      this._readAloudHighlightedPosition = granularity === 'word' ? state.activeWordSourcePosition : state.activeSegment.sourcePosition;
      if (state.activeSegment !== previous?.activeSegment) {
        this._readAloudSentenceHighlightedPosition = state.flash ?? null;
        this._readAloudSentenceTimeout = state.flash ? 42 : null;
      }
      this._painted();
    }
  }
  const view = new PDFView();
  view._pages.push(new Page(view, 0), new Page(view, 1));
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: REAL_TIMESTAMP as unknown } }, _iframeWindow: { clearTimeout: vi.fn() } };
  return { view, page: view._pages[0], nextPage: view._pages[1], pushed, reader, Page, PDFView };
}

function fakeDOM(granularity: string) {
  class DOMView {
    _spotlights = new Map<string, unknown>();
    _readAloud: any;
    setSpotlight = vi.fn((key: string, selector: unknown, _timeout: number | null = 2000) => {
      if (selector) this._spotlights.set(key, selector);
      else this._spotlights.delete(key);
    });
    _getSpotlightColor(key: string) {
      return key === 'Navigation' ? 'selection' : key === 'ReadAloudActiveSegment' ? ZOTERO_SEGMENT : ZOTERO_SENTENCE;
    }
  }
  class ReadAloud {
    state: any = { popupOpen: false }; // Zotero's DOM view pushes the initial state from its constructor
    constructor(public _view: DOMView) {}
    _effectivePrimaryGranularity(_state: unknown) {
      return granularity;
    }
    _resolveSegmentSelector = vi.fn((state: any) => ({ selectorFor: state.activeSegment }));
    setState(state: any) {
      const previous = this.state;
      this.state = state;
      if (!state.popupOpen) {
        this._view.setSpotlight('ReadAloudActiveSegment', null);
        this._view.setSpotlight('ReadAloudActiveSentence', null);
        return null;
      }
      this._view.setSpotlight(
        'ReadAloudActiveSegment',
        state.primarySelector !== undefined ? state.primarySelector : state.activeWordSourcePosition !== undefined ? state.activeWordSourcePosition : { primary: true },
        null,
      );
      if (state.activeSegment !== previous?.activeSegment) {
        const flash = state.flash ?? null;
        this._view.setSpotlight('ReadAloudActiveSentence', flash, flash ? 2000 : null);
      }
      return { lang: 'en' };
    }
  }
  const view = new DOMView();
  view._readAloud = new ReadAloud(view);
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: REAL_TIMESTAMP as unknown } }, _iframeWindow: { clearTimeout: vi.fn() } };
  return { view, helper: view._readAloud as ReadAloud, reader, DOMView, ReadAloud };
}

function styling(over: Partial<HighlightStylingDeps> = {}, style: HighlightStyle = STYLE) {
  const current = { ...style };
  const deps = {
    style: () => current,
    clearTimeout: vi.fn((reader: any, id: unknown) => reader._iframeWindow.clearTimeout(id)),
    error: vi.fn(),
    ...over,
  } satisfies HighlightStylingDeps;
  return { styling: createHighlightStyling(deps), current, deps };
}

const A = segment('a');
const B = segment('b');
const word = (seg: typeof A, n: number) => ({ pageIndex: 0, tag: `${seg.sourcePosition.tag}-w${n}` });
const pdfState = (seg: typeof A, n = 1, extra: Record<string, unknown> = {}) => ({
  popupOpen: true,
  activeSegment: seg,
  activeWordSourcePosition: word(seg, n),
  ...extra,
});

// ---- PDF --------------------------------------------------------------------

describe('PDF colors', () => {
  it("recolours Zotero's primary highlight by the unit it shows, and the secondary slot with the sentence color", () => {
    for (const [granularity, expected] of [
      ['word', WORD],
      ['sentence', SENTENCE],
      ['paragraph', SENTENCE],
    ] as const) {
      const pdf = fakePDF(granularity);
      const { styling: s } = styling();
      expect(s.attach(pdf.reader)).toBe(true);
      const primary = { pageIndex: 0, tag: 'primary' };
      const secondary = { pageIndex: 0, tag: 'secondary' };
      const other = { pageIndex: 0, tag: 'selection' };
      pdf.view._readAloudHighlightedPosition = primary;
      pdf.view._readAloudSentenceHighlightedPosition = secondary;
      pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
      pdf.page._pushHighlightedPosition([], secondary, ZOTERO_SENTENCE);
      pdf.page._pushHighlightedPosition([], other, '#ffff00');
      expect(pdf.pushed.map((p) => p.color), granularity).toEqual([expected, SENTENCE, '#ffff00']);
      expect(pdf.pushed.map((p) => p.position)).toEqual([primary, secondary, other]);
    }
  });

  it("keeps Zotero's color when the configured one is not a color", () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling({}, { ...STYLE, wordColor: 'bright red' });
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(ZOTERO_SEGMENT);
  });

  it('reads the style on every use, so the pane applies on the next highlight', () => {
    const pdf = fakePDF('word');
    const { styling: s, current } = styling();
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    current.wordColor = '#0000ff';
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD, '#0000ff80']);
  });
});

// ---- the sentence leaves the word alone -----------------------------------

describe('PDF: the secondary highlight is drawn only where the primary is not', () => {
  const SENTENCE_POS = { pageIndex: 0, rects: [[10, 100, 200, 112]] };
  const WORD_POS = { pageIndex: 0, rects: [[80, 100, 120, 110]] };
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  function drawing(over: Partial<HighlightStylingDeps> = clone) {
    const pdf = fakePDF('word');
    const { styling: s } = styling(over);
    s.attach(pdf.reader);
    return { ...pdf, styling: s };
  }
  const draw = (pdf: ReturnType<typeof fakePDF>, page = pdf.page) => {
    page._pushHighlightedPosition([], pdf.view._readAloudHighlightedPosition, ZOTERO_SEGMENT);
    page._pushHighlightedPosition([], pdf.view._readAloudSentenceHighlightedPosition, ZOTERO_SENTENCE);
  };

  it('cuts the word out of the sentence, so the word is the color that was picked', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(pdf);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD, SENTENCE]);
    expect(pdf.pushed[1].position).toEqual({
      pageIndex: 0,
      rects: [
        [10, 100, 80, 112],
        [120, 100, 200, 112],
      ],
      cloned: true,
    });
  });

  it('grows the word to the height of its line, so it fills the slot the sentence leaves', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(pdf);
    expect(pdf.pushed[0].position).toEqual({ pageIndex: 0, rects: [[80, 100, 120, 112]], cloned: true });

    // A word that already fills its line is passed on untouched
    const fits = drawing();
    fits.view._readAloudHighlightedPosition = { pageIndex: 0, rects: [[80, 100, 120, 112]] };
    fits.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(fits);
    expect(fits.pushed[0].position).toBe(fits.view._readAloudHighlightedPosition);
  });

  it('draws nothing of the sentence when the primary covers it, as a wordless voice does', () => {
    const pdf = drawing();
    // The stand-in word position of a voice without word timestamps is the
    // whole segment: Zotero's primary and our kept sentence are the same region
    pdf.view._readAloudHighlightedPosition = { pageIndex: 0, rects: [[10, 100, 200, 112]] };
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(pdf);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD]);
  });

  it('leaves the sentence untouched, by identity, on a page the primary is not on', () => {
    const pdf = drawing();
    const spanning = { pageIndex: 0, rects: [[10, 100, 200, 112]], nextPageRects: [[10, 700, 90, 712]] };
    pdf.view._readAloudHighlightedPosition = { pageIndex: 1, rects: [[20, 700, 60, 710]] };
    pdf.view._readAloudSentenceHighlightedPosition = spanning;
    draw(pdf);
    expect(pdf.pushed[1].position).toBe(spanning);

    // ... and cuts it on the page it is on, through the next page's rectangles
    draw(pdf, pdf.nextPage);
    expect(pdf.pushed[3].position).toEqual({
      pageIndex: 1,
      rects: [
        [10, 700, 20, 712],
        [60, 700, 90, 712],
      ],
      cloned: true,
    });
  });

  it('leaves a position without rectangles alone, and needs no cloning then', () => {
    const cloneIntoReader = vi.fn((_r: unknown, value: unknown) => value);
    const pdf = drawing({ cloneIntoReader });
    const primary = { pageIndex: 0, tag: 'primary' };
    const secondary = { pageIndex: 0, tag: 'secondary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.view._readAloudSentenceHighlightedPosition = secondary;
    draw(pdf);
    expect(pdf.pushed.map((p) => p.position)).toEqual([primary, secondary]);
    expect(cloneIntoReader).not.toHaveBeenCalled();
  });

  it('reports the trim in the diagnostics', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    expect((pdf.styling.inspect(pdf.reader).views as any[])[0]).toMatchObject({ secondaryTrim: { page: 0, rects: 1, holes: 1, pieces: 2 } });
  });

  it('keeps the sentence through the gap between segments, where Zotero leaves the last word drawn', async () => {
    const pdf = drawing();
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    // ActiveSegmentChange(null): no segment, no word timestamp, and Zotero's
    // own update skipped -- its stale primary is still on the page, and now
    // in the sentence color. Taking the sentence from around it would leave
    // that one word alone on the page.
    pdf.reader._internalReader._readAloudManager.activeTimestamp = null;
    await pdf.view.setReadAloudState({ popupOpen: true, activeSegment: null, activeWordSourcePosition: null });
    expect(pdf.view._readAloudHighlightedPosition).toEqual(word(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    pdf.page._pushHighlightedPosition([], pdf.view._readAloudHighlightedPosition, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
  });

  it('leaves the selection highlight and everything else alone', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    const selection = { pageIndex: 0, rects: [[10, 100, 200, 112]] };
    pdf.page._pushHighlightedPosition([], selection, '#ffff00');
    expect(pdf.pushed).toEqual([{ position: selection, color: '#ffff00' }]);
  });
});

describe('PDF sentence under the word', () => {
  it('keeps the current sentence in the secondary slot through the word updates of a segment', async () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    expect(pdf.view._painted).toHaveBeenCalledTimes(2);
    await pdf.view.setReadAloudState(pdfState(A, 2));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    // One render per update is Zotero's own; nothing to redraw for us
    expect(pdf.view._painted).toHaveBeenCalledTimes(3);
    await pdf.view.setReadAloudState(pdfState(B, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(B.sourcePosition);
  });

  it("cancels the timer of Zotero's own flash of the same sentence, so it stays", async () => {
    const pdf = fakePDF('word');
    const { styling: s, deps } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A, 1, { flash: A.sourcePosition, lastSkipGranularity: 'sentence' }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    expect(deps.clearTimeout).toHaveBeenCalledWith(pdf.reader, 42);
    expect(pdf.reader._iframeWindow.clearTimeout).toHaveBeenCalledWith(42);
  });

  it('leaves a paragraph flash alone until it expires, then restores the sentence', async () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const paragraph = A.paragraphSourcePosition;
    await pdf.view.setReadAloudState(pdfState(A, 1, { flash: paragraph, lastSkipGranularity: 'paragraph' }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(paragraph);
    // Zotero's timer blanks the slot
    pdf.view._readAloudSentenceHighlightedPosition = null;
    await pdf.view.setReadAloudState(pdfState(A, 2, { lastSkipGranularity: 'paragraph' }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('does nothing in sentence mode, with the popup closed, or for a sentence without a page', async () => {
    const sentenceMode = fakePDF('sentence');
    styling().styling.attach(sentenceMode.reader);
    await sentenceMode.view.setReadAloudState(pdfState(A));
    expect(sentenceMode.view._readAloudSentenceHighlightedPosition).toBeNull();

    const closed = fakePDF('word');
    styling().styling.attach(closed.reader);
    await closed.view.setReadAloudState({ ...pdfState(A), popupOpen: false });
    expect(closed.view._readAloudSentenceHighlightedPosition).toBeNull();

    const pageless = fakePDF('word');
    styling().styling.attach(pageless.reader);
    await pageless.view.setReadAloudState(pdfState({ ...A, sourcePosition: { tag: 'no-page' } as any }));
    expect(pageless.view._readAloudSentenceHighlightedPosition).toBeNull();
  });

  it('takes its highlight back when the switch is turned off, and nothing else', async () => {
    const pdf = fakePDF('word');
    const { styling: s, current } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    current.sentence = false;
    await pdf.view.setReadAloudState(pdfState(A, 2));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBeNull();

    // A flash Zotero set itself is not ours to remove
    await pdf.view.setReadAloudState(pdfState(B, 1, { flash: B.paragraphSourcePosition }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(B.paragraphSourcePosition);
  });

  it('returns what Zotero returned and logs a failure of its own part without breaking the update', async () => {
    const pdf = fakePDF('word');
    const error = vi.fn();
    const { styling: s } = styling({
      error,
      style: () => {
        throw new Error('prefs gone');
      },
    });
    s.attach(pdf.reader);
    await expect(pdf.view.setReadAloudState(pdfState(A))).resolves.toBeUndefined();
    expect(pdf.view._readAloudHighlightedPosition).toEqual(word(A, 1));
    expect(error).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ---- EPUB / snapshot ----------------------------------------------------------

describe('DOM view colors', () => {
  it('recolours the two Read Aloud spotlights and nothing else', () => {
    const dom = fakeDOM('word');
    const { styling: s } = styling();
    expect(s.attach(dom.reader)).toBe(true);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSentence')).toBe(SENTENCE);
    expect(dom.view._getSpotlightColor('Navigation')).toBe('selection');

    const sentenceMode = fakeDOM('sentence');
    styling().styling.attach(sentenceMode.reader);
    expect(sentenceMode.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
  });

  it("keeps Zotero's color when the configured one is not a color", () => {
    const dom = fakeDOM('word');
    styling({}, { ...STYLE, sentenceColor: '' }).styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSentence')).toBe(ZOTERO_SENTENCE);
  });
});

describe('DOM view sentence under the word', () => {
  const domState = (seg: typeof A, extra: Record<string, unknown> = {}) => ({ popupOpen: true, activeSegment: seg, ...extra });

  it('keeps the sentence spotlight, resolving the selector once per segment', () => {
    const dom = fakeDOM('word');
    const { styling: s } = styling();
    s.attach(dom.reader);
    expect(dom.helper.setState(domState(A))).toEqual({ lang: 'en' });
    const selector = dom.view._spotlights.get('ReadAloudActiveSentence');
    expect(selector).toEqual({ selectorFor: A });
    expect(dom.view.setSpotlight).toHaveBeenCalledWith('ReadAloudActiveSentence', selector, null);
    dom.helper.setState(domState(A));
    dom.helper.setState(domState(A));
    expect(dom.helper._resolveSegmentSelector).toHaveBeenCalledTimes(1);
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBe(selector);
    dom.helper.setState(domState(B));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: B });
    expect(dom.helper._resolveSegmentSelector).toHaveBeenCalledTimes(2);
  });

  it("replaces Zotero's flash of the same sentence at once, but lets a paragraph flash expire first", () => {
    const dom = fakeDOM('word');
    styling().styling.attach(dom.reader);
    const sentenceFlash = { flashOf: 'a' };
    dom.helper.setState(domState(A, { flash: sentenceFlash, lastSkipGranularity: 'sentence' }));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });

    const paragraphFlash = { flashOf: 'b-paragraph' };
    dom.helper.setState(domState(B, { flash: paragraphFlash, lastSkipGranularity: 'paragraph' }));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBe(paragraphFlash);
    // Zotero's timer removes it
    dom.view._spotlights.delete('ReadAloudActiveSentence');
    dom.helper.setState(domState(B, { lastSkipGranularity: 'paragraph' }));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: B });
  });

  it('does nothing in sentence mode or with the popup closed, and takes its spotlight back when switched off', () => {
    const sentenceMode = fakeDOM('sentence');
    styling().styling.attach(sentenceMode.reader);
    sentenceMode.helper.setState(domState(A));
    expect(sentenceMode.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);

    const dom = fakeDOM('word');
    const { styling: s, current } = styling();
    s.attach(dom.reader);
    dom.helper.setState(domState(A));
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(true);
    current.sentence = false;
    dom.helper.setState(domState(A));
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    current.sentence = true;
    dom.helper.setState({ ...domState(A), popupOpen: false });
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
  });
});

// ---- EPUB / snapshot: the sentence drawn around the word ------------------------

const HEAD = 'ZoteroTTSSentenceHead';
const TAIL = 'ZoteroTTSSentenceTail';

/**
 * A DOM view whose selectors are `{ from, to }` character ranges of one text
 * node, so the pieces the sentence is cut into can be read back as text.
 * `toDisplayedRange` sits on the prototype, where Zotero has it, so the
 * plugin can shadow it; `_getSpotlightColor` throws on an unknown key, as
 * Zotero's does.
 */
function fakeRangeDOM(text: string, granularity = 'word') {
  const NODE = { text };
  class FakeRange {
    startContainer = NODE;
    endContainer = NODE;
    constructor(
      public startOffset: number,
      public endOffset: number,
    ) {}
    get collapsed() {
      return this.startOffset >= this.endOffset;
    }
    cloneRange() {
      return new FakeRange(this.startOffset, this.endOffset);
    }
    setStart(node: unknown, offset: number) {
      if (node !== NODE) throw new Error('WrongDocumentError');
      this.startOffset = offset;
      if (this.endOffset < offset) this.endOffset = offset;
    }
    setEnd(node: unknown, offset: number) {
      if (node !== NODE) throw new Error('WrongDocumentError');
      this.endOffset = offset;
      if (this.startOffset > offset) this.startOffset = offset;
    }
    comparePoint(node: unknown, offset: number) {
      if (node !== NODE) throw new Error('WrongDocumentError');
      return offset < this.startOffset ? -1 : offset > this.endOffset ? 1 : 0;
    }
    toString() {
      return text.slice(this.startOffset, this.endOffset);
    }
  }
  class DOMView {
    _spotlights = new Map<string, unknown>();
    _readAloud: any;
    _renderAnnotations = vi.fn();
    setSpotlight = vi.fn((key: string, selector: unknown, _timeout: number | null = 2000) => {
      if (selector) this._spotlights.set(key, selector);
      else this._spotlights.delete(key);
      this._renderAnnotations();
    });
    _getSpotlightColor(key: string) {
      if (key === 'ReadAloudActiveSegment') return ZOTERO_SEGMENT;
      if (key === 'ReadAloudActiveSentence') return ZOTERO_SENTENCE;
      throw new Error('Unknown highlight key: ' + key);
    }
    toDisplayedRange(selector: any) {
      return selector && typeof selector.from === 'number' ? new FakeRange(selector.from, selector.to) : null;
    }
  }
  class ReadAloud {
    state: any = { popupOpen: false }; // Zotero's DOM view pushes the initial state from its constructor
    constructor(public _view: DOMView) {}
    _effectivePrimaryGranularity(_state: unknown) {
      return granularity;
    }
    _resolveSegmentSelector = vi.fn((state: any) => state.activeSegment?.selector ?? null);
    setState(state: any) {
      const previous = this.state;
      this.state = state;
      if (!state.popupOpen) {
        this._view.setSpotlight('ReadAloudActiveSegment', null);
        this._view.setSpotlight('ReadAloudActiveSentence', null);
        return null;
      }
      // Without an active segment Zotero touches nothing: the last word's
      // spotlight stays on screen
      if (!state.activeSegment) return null;
      this._view.setSpotlight('ReadAloudActiveSegment', state.activeWordSourcePosition ?? null, null);
      if (state.activeSegment !== previous?.activeSegment) {
        const flash = state.flash ?? null;
        this._view.setSpotlight('ReadAloudActiveSentence', flash, flash ? 2000 : null);
      }
      return null;
    }
  }
  const view = new DOMView();
  view._readAloud = new ReadAloud(view);
  const manager = { activeTimestamp: null as unknown };
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: manager }, _iframeWindow: { clearTimeout: vi.fn() } };
  /** What the view would draw for a spotlight of ours, as text. */
  const drawn = (key: string) => {
    const selector = view._spotlights.get(key);
    if (selector === undefined) return undefined;
    const range = view.toDisplayedRange(selector);
    return range === null ? null : String(range);
  };
  return { view, helper: view._readAloud as ReadAloud, reader, manager, drawn, DOMView };
}

describe('EPUB and snapshot: the sentence is drawn around the word', () => {
  // The same sentence twice, so a word position can land on the wrong copy
  const TEXT = 'In truth, I lean away. I lean away.';
  const SEGMENT = { selector: { from: 0, to: 22 }, text: 'In truth, I lean away.' };
  const LEAN = { from: 12, to: 16 };
  const AWAY = { from: 17, to: 21 };

  interface Reading {
    /** The word's characters in the segment, when they are not the selector's own. */
    chars?: [number, number];
    /** The whole-segment timestamp of a voice without word timings. */
    standIn?: boolean;
    state?: Record<string, unknown>;
  }

  function reader(granularity = 'word') {
    const dom = fakeRangeDOM(TEXT, granularity);
    const { styling: s, current } = styling();
    s.attach(dom.reader);
    const read = (word: unknown, { chars, standIn, state }: Reading = {}) => {
      const [charStart, charEnd] = chars ?? [(word as any).from ?? 0, (word as any).to ?? 0];
      dom.manager.activeTimestamp = standIn ? { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart, charEnd } : { start: 0.1, end: 0.4, charStart, charEnd };
      return dom.helper.setState({ popupOpen: true, activeSegment: SEGMENT, activeWordSourcePosition: word, ...state });
    };
    return { ...dom, styling: s, current, read };
  }

  it('cuts the sentence into the piece before and the piece after the word', () => {
    const dom = reader();
    dom.read(LEAN);
    expect(dom.drawn(HEAD)).toBe('In truth, I ');
    expect(dom.drawn(TAIL)).toBe(' away.');
    // The whole sentence is no longer drawn under the word
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    expect(dom.view._getSpotlightColor(HEAD)).toBe(SENTENCE);
    expect(dom.view._getSpotlightColor(TAIL)).toBe(SENTENCE);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });

  it('follows the word without touching the spotlight map or drawing an extra frame', () => {
    const dom = reader();
    dom.read(LEAN);
    const [head, tail] = [dom.view._spotlights.get(HEAD), dom.view._spotlights.get(TAIL)];
    const renders = dom.view._renderAnnotations.mock.calls.length;
    dom.read(AWAY);
    expect(dom.view._spotlights.get(HEAD)).toBe(head);
    expect(dom.view._spotlights.get(TAIL)).toBe(tail);
    expect(dom.drawn(HEAD)).toBe('In truth, I lean ');
    expect(dom.drawn(TAIL)).toBe('.');
    // Zotero's own render of the moved word, and none of ours
    expect(dom.view._renderAnnotations.mock.calls.length).toBe(renders + 1);
  });

  it('draws neither piece where the word covers the whole sentence, as a wordless voice does', () => {
    const dom = reader();
    dom.read({ from: 0, to: 22 }, { standIn: true });
    expect(dom.view._spotlights.has(HEAD)).toBe(true);
    expect(dom.drawn(HEAD)).toBeNull();
    expect(dom.drawn(TAIL)).toBeNull();
  });

  it('draws the whole sentence, once, when the word is not inside it', () => {
    // The word position resolves to the right text in the wrong place (issue #4)
    const dom = reader();
    dom.read({ from: 25, to: 29 }, { chars: [12, 16] });
    expect(dom.drawn(HEAD)).toBe('In truth, I lean away.');
    expect(dom.drawn(TAIL)).toBeNull();
  });

  it('draws the whole sentence in the head when the word position resolves to nothing', () => {
    const dom = reader();
    dom.read({ nothing: true }, { chars: [12, 16] });
    expect(dom.drawn(HEAD)).toBe('In truth, I lean away.');
    expect(dom.drawn(TAIL)).toBeNull();
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    // No rewrite shows the word, so Zotero's primary is painted transparent
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe('#00000000');
  });

  it('keeps the pieces through a push without a word, drawing the sentence whole', () => {
    const dom = reader();
    dom.read(LEAN);
    dom.manager.activeTimestamp = null;
    dom.helper.setState({ popupOpen: true, activeSegment: SEGMENT, activeWordSourcePosition: null });
    expect(dom.drawn(HEAD)).toBe('In truth, I lean away.');
    expect(dom.drawn(TAIL)).toBeNull();
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
  });

  it('keeps the pieces around the last word through the gap between segments', () => {
    const dom = reader();
    dom.read(LEAN);
    // ActiveSegmentChange(null): Zotero keeps the last word's spotlight, now
    // in the sentence color, and the sentence has to stay around it
    dom.manager.activeTimestamp = null;
    dom.helper.setState({ popupOpen: true, activeSegment: null, activeWordSourcePosition: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBe(LEAN);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
    expect(dom.drawn(HEAD)).toBe('In truth, I ');
    expect(dom.drawn(TAIL)).toBe(' away.');
  });

  it('takes the pieces back when the switch goes off, the popup closes, or the granularity changes', () => {
    const off = reader();
    off.read(LEAN);
    expect(off.view._spotlights.has(HEAD)).toBe(true);
    off.current.sentence = false;
    off.read(LEAN);
    expect(off.view._spotlights.has(HEAD)).toBe(false);
    expect(off.view._spotlights.has(TAIL)).toBe(false);

    const closed = reader();
    closed.read(LEAN);
    closed.helper.setState({ popupOpen: false, activeSegment: SEGMENT, activeWordSourcePosition: LEAN });
    expect(closed.view._spotlights.has(HEAD)).toBe(false);
    expect(closed.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);

    const sentenceMode = reader('sentence');
    sentenceMode.read(LEAN);
    expect(sentenceMode.view._spotlights.has(HEAD)).toBe(false);
  });

  it("drops Zotero's own flash of the same sentence, which would draw it over the word again", () => {
    const dom = reader();
    dom.read(LEAN, { state: { flash: SEGMENT.selector, lastSkipGranularity: 'sentence' } });
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    expect(dom.drawn(HEAD)).toBe('In truth, I ');
  });

  it('takes the pieces back on dispose, so the reader is never left asking for a color of ours', () => {
    const dom = reader();
    dom.read(LEAN);
    expect(dom.view._renderAnnotations).toHaveBeenCalled();
    dom.styling.dispose();
    expect(dom.view._spotlights.has(HEAD)).toBe(false);
    expect(dom.view._spotlights.has(TAIL)).toBe(false);
    // Zotero's own method is back, and nothing left in the map throws in it
    for (const key of dom.view._spotlights.keys()) expect(() => dom.view._getSpotlightColor(key)).not.toThrow();
  });

  it('reports the pieces in the diagnostics', () => {
    const dom = reader();
    dom.read(LEAN);
    expect((dom.styling.inspect(dom.reader).views as any[])[0]).toMatchObject({
      kind: 'dom',
      sentencePieces: { head: 'In truth, I ', tail: ' away.' },
    });
  });

  it('leaves the sentence in one piece when toDisplayedRange is not where it can be patched', () => {
    // Another Zotero version: nothing resolves a piece, so none is put out
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = REAL_TIMESTAMP;
    (dom.view as any).toDisplayedRange = vi.fn(() => ({ toString: () => 'anything' }));
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A, activeWordSourcePosition: { word: true } });
    expect(dom.view._spotlights.has(HEAD)).toBe(false);
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });
});

describe('a document stored decomposed (NFD), issue #74', () => {
  // Zotero hands the segment text NFC-normalized (reader.js, the deltaMap);
  // the DOM keeps the document's own form, so the two spell "începe"
  // differently while showing the same letters
  const NFC = 'Această poveste începe.';
  const NFD = NFC.normalize('NFD');
  const SEGMENT = { selector: { from: 0, to: NFD.length }, text: NFC };
  const INCEPE = { from: NFD.indexOf('i\u0302ncepe'), to: NFD.indexOf('i\u0302ncepe') + 'i\u0302ncepe'.length };
  const CHARS: [number, number] = [NFC.indexOf('începe'), NFC.indexOf('începe') + 'începe'.length];

  function reader() {
    const dom = fakeRangeDOM(NFD, 'word');
    const { styling: s } = styling();
    s.attach(dom.reader);
    const read = (word: unknown) => {
      dom.manager.activeTimestamp = { start: 0.1, end: 0.4, charStart: CHARS[0], charEnd: CHARS[1] };
      return dom.helper.setState({ popupOpen: true, activeSegment: SEGMENT, activeWordSourcePosition: word });
    };
    return { ...dom, read };
  }

  it('keeps the word in the word color and the sentence around it, though the forms differ', () => {
    expect(NFD).not.toBe(NFC);
    expect(INCEPE.from).toBeGreaterThan(0);
    const dom = reader();
    dom.read(INCEPE);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
    expect(dom.drawn(HEAD)).toBe('Această poveste '.normalize('NFD'));
    expect(dom.drawn(TAIL)).toBe('.');
  });

  it('shows the primary again as soon as the granularity leaves word, without a popup close', () => {
    const dom = reader();
    // A word position that resolves to nothing is painted transparent, rightly
    dom.read({ nothing: true });
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe('#00000000');
    // Settings → Highlight current → Sentence, the popup still open: the primary is the sentence now
    dom.helper._effectivePrimaryGranularity = () => 'sentence';
    dom.read(SEGMENT.selector);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
  });
});

// ---- what the reader hands an exported function ---------------------------------

/**
 * The reader calls the patched methods with `this` and arguments behind Xray
 * wrappers: a plain object's own properties are visible, its prototype's
 * methods are not, and assignments land on the wrapper. Modelled with a
 * proxy; `waiveXrays` maps it back to the real object.
 */
function xrays() {
  const targets = new WeakMap<object, object>();
  const wrappers = new WeakMap<object, object>();
  const wrap = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (targets.has(obj)) return obj;
    const existing = wrappers.get(obj);
    if (existing) return existing;
    const proxy: object = new Proxy(obj, {
      get: (t, k) => (Object.prototype.hasOwnProperty.call(t, k) ? wrap((t as any)[k]) : undefined),
      set: () => true,
    });
    wrappers.set(obj, proxy);
    targets.set(proxy, obj);
    return proxy;
  };
  const waiveXrays = (value: unknown) => (value && typeof value === 'object' ? (targets.get(value) ?? value) : value);
  return { wrap, waiveXrays };
}

describe('behind Xray wrappers', () => {
  it('the bug: without waiving, the primary highlight falls back to the sentence color and the sentence is never kept', async () => {
    const pdf = fakePDF('word');
    const { wrap } = xrays();
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const state = pdfState(A);
    await pdf.view.setReadAloudState.call(wrap(pdf.view), wrap(state));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBeNull();
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition.call(wrap(pdf.page), [], wrap(primary), ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
  });

  it('waives them: the word color is found and the sentence is kept, on the real view', async () => {
    const pdf = fakePDF('word');
    const { wrap, waiveXrays } = xrays();
    const { styling: s } = styling({ waiveXrays });
    s.attach(pdf.reader);
    const state = pdfState(A);
    await pdf.view.setReadAloudState.call(wrap(pdf.view), wrap(state));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition.call(wrap(pdf.page), [], wrap(primary), ZOTERO_SEGMENT);
    pdf.page._pushHighlightedPosition.call(wrap(pdf.page), [], wrap(A.sourcePosition), ZOTERO_SENTENCE);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD, SENTENCE]);
    // The original still receives what the reader passed
    expect(pdf.pushed[0].position).toBe(wrap(primary));
    expect((s.inspect(pdf.reader).views as any[])[0]).toMatchObject({ granularity: 'word', sentenceSlot: 'ours' });
  });

  it('waives them in the EPUB and snapshot views too', () => {
    const dom = fakeDOM('word');
    const { wrap, waiveXrays } = xrays();
    styling({ waiveXrays }).styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor.call(wrap(dom.view), 'ReadAloudActiveSegment')).toBe(WORD);
    const state = { popupOpen: true, activeSegment: A };
    dom.helper.setState.call(wrap(dom.helper), wrap(state));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });
});

// ---- attaching ------------------------------------------------------------------

describe('attach / dispose', () => {
  it("exports every patched function into the reader's compartment, patches once, and restores on dispose", async () => {
    const pdf = fakePDF('word');
    const exportFunction = vi.fn((fn: (...args: any[]) => any, _target: object) => fn);
    const { styling: s } = styling({ exportFunction });
    const originalPush = pdf.Page.prototype._pushHighlightedPosition;
    const originalSet = pdf.PDFView.prototype.setReadAloudState;
    const originalRender = pdf.PDFView.prototype._render;
    expect(s.attach(pdf.reader)).toBe(true);
    expect(s.attach(pdf.reader)).toBe(true);
    expect(exportFunction).toHaveBeenCalledTimes(3);
    expect(exportFunction.mock.calls.map((c) => c[1])).toEqual([pdf.Page.prototype, pdf.PDFView.prototype, pdf.PDFView.prototype]);
    expect(pdf.Page.prototype._pushHighlightedPosition).not.toBe(originalPush);
    expect(pdf.PDFView.prototype._render).not.toBe(originalRender);

    s.dispose();
    expect(pdf.Page.prototype._pushHighlightedPosition).toBe(originalPush);
    expect(pdf.PDFView.prototype.setReadAloudState).toBe(originalSet);
    expect(pdf.PDFView.prototype._render).toBe(originalRender);
    await pdf.view.setReadAloudState(pdfState(A));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBeNull();
  });

  it('covers a split view through the shared prototype, and the SDT views', () => {
    const dom = fakeDOM('word');
    const second = new dom.DOMView();
    second._readAloud = new dom.ReadAloud(second);
    (dom.reader._internalReader as any)._secondaryView = second;
    styling().styling.attach(dom.reader);
    expect(second._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });

  it('tolerates a reader without views', () => {
    const { styling: s } = styling();
    expect(s.attach({ _internalReader: {} })).toBe(false);
    expect(s.attach(null)).toBe(false);
  });

  // A view has no page before pdf.js has rendered one — the first half
  // second of a tab, a minimized window, a tab hidden for a minute — and
  // Page.prototype is reached only through a page (issue #88)
  it('attaches to a PDF view before its first page, and the colors land with that page, before it is painted (issue #88)', async () => {
    const pdf = fakePDF('word');
    pdf.view._pages.length = 0;
    const debug = vi.fn();
    const exportFunction = vi.fn((fn: (...args: any[]) => any, _target: object) => fn);
    const { styling: s, deps } = styling({ debug, exportFunction });
    const originalPush = pdf.Page.prototype._pushHighlightedPosition;
    expect(s.attach(pdf.reader)).toBe(true);
    expect(debug).toHaveBeenCalledWith('highlight style attached to a PDF view without pages, the colors follow its first page');
    expect(pdf.Page.prototype._pushHighlightedPosition).toBe(originalPush);
    expect(exportFunction.mock.calls.map((c) => c[1])).toEqual([pdf.PDFView.prototype, pdf.PDFView.prototype]);
    expect((s.inspect(pdf.reader).views as any[])[0]).toMatchObject({ kind: 'pdf', patched: false, awaitingPage: true, pages: 0 });
    // A second attach — the popup's open — has nothing to add
    expect(s.attach(pdf.reader)).toBe(true);
    expect(exportFunction).toHaveBeenCalledTimes(2);

    // Zotero's _handlePageRendered creates the page, pushes it and renders
    // the view in one go: the shadow has to be in place for that very paint
    let patchedWhenPainted: boolean | null = null;
    pdf.view._painted.mockImplementation(() => {
      patchedWhenPainted = pdf.Page.prototype._pushHighlightedPosition !== originalPush;
    });
    pdf.view._pages.push(new pdf.Page(pdf.view, 0));
    pdf.view._render();
    expect(patchedWhenPainted).toBe(true);
    expect(debug).toHaveBeenCalledWith('highlight style attached to a PDF view at its first page');
    expect(exportFunction.mock.calls.map((c) => c[1])).toEqual([pdf.PDFView.prototype, pdf.PDFView.prototype, pdf.Page.prototype]);
    expect((s.inspect(pdf.reader).views as any[])[0]).toMatchObject({ patched: true, awaitingPage: false, pages: 1 });

    // From here the page draws in the user's colors, and a later render patches nothing again
    await pdf.view.setReadAloudState(pdfState(A));
    pdf.view._pages[0]._pushHighlightedPosition([], pdf.view._readAloudHighlightedPosition, ZOTERO_SEGMENT);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD]);
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    pdf.view._render();
    expect(exportFunction).toHaveBeenCalledTimes(3);
    expect(deps.error).not.toHaveBeenCalled();
  });

  it('finishes a split view through the shared prototypes: the page half lands once, for both views (issue #88)', () => {
    const pdf = fakePDF('word');
    pdf.view._pages.length = 0;
    const second = new pdf.PDFView();
    (pdf.reader._internalReader as any)._secondaryView = second;
    const exportFunction = vi.fn((fn: (...args: any[]) => any, _target: object) => fn);
    const { styling: s } = styling({ exportFunction });
    expect(s.attach(pdf.reader)).toBe(true);
    expect(exportFunction).toHaveBeenCalledTimes(2);
    // The second view gets its first page first
    second._pages.push(new pdf.Page(second, 3));
    second._render();
    expect(exportFunction).toHaveBeenCalledTimes(3);
    expect(exportFunction.mock.calls[2][1]).toBe(pdf.Page.prototype);
    const views = s.inspect(pdf.reader).views as any[];
    expect(views.map((v) => [v.patched, v.awaitingPage, v.pages])).toEqual([
      [true, false, 0],
      [true, false, 1],
    ]);
    // The first view's own first page renders through the prototype already patched
    pdf.view._pages.push(new pdf.Page(pdf.view, 0));
    pdf.view._render();
    expect(exportFunction).toHaveBeenCalledTimes(3);
  });

  it('describes what it sees in a reader, as plain data', async () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A));
    const report = s.inspect(pdf.reader);
    expect(report.style).toEqual(STYLE);
    expect(report.views).toEqual([
      {
        kind: 'pdf',
        patched: true,
        awaitingPage: false,
        pages: 2,
        method: 'function',
        granularity: 'word',
        activeWordTimestamp: 'real',
        primaryShown: true,
        state: { popupOpen: true, highlightGranularity: null, segmentGranularity: null, segment: true, segmentPage: 0, wordPosition: true },
        sentenceSlot: 'ours',
        secondaryTrim: null,
      },
    ]);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(s.inspect(null)).toEqual({ views: [], style: STYLE });
  });

  it('answers a view that never received a state without calling Zotero, and logs no error (issue #39)', () => {
    const pdf = fakePDF('word');
    // Zotero's own method reads the state's fields unguarded, and a PDF
    // view holds no state until its reader first pushes one (the popup's
    // open, or a manager state change): it throws on undefined
    pdf.view._readAloudState = undefined;
    pdf.view._effectiveReadAloudPrimaryGranularity = (state: any) => (state.highlightGranularity === 'word' ? 'word' : 'sentence');
    const debug = vi.fn();
    const { styling: s, deps } = styling({ debug });
    const report = s.inspect(pdf.reader);
    expect(report.views).toEqual([
      {
        kind: 'pdf',
        patched: false,
        awaitingPage: false,
        pages: 2,
        method: 'function',
        granularity: null,
        activeWordTimestamp: 'real',
        primaryShown: false,
        state: null,
        sentenceSlot: 'empty',
        secondaryTrim: null,
      },
    ]);
    expect(deps.error).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith('highlight: effective granularity null (method function; state missing)');
    // A second call is as quiet as the first
    s.inspect(pdf.reader);
    expect(deps.error).not.toHaveBeenCalled();
  });

  it('leaves a view it does not recognize alone', () => {
    const reader = { _internalReader: { _primaryView: { something: 'else' } } };
    const { styling: s, deps } = styling();
    expect(s.attach(reader)).toBe(false);
    expect(deps.error).not.toHaveBeenCalled();
  });
});

// ---- the whole-segment stand-in (a voice without word timestamps) ----------

describe('word mode with the whole-segment stand-in timestamp', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const real = { start: 0.1, end: 0.4, charStart: 0, charEnd: 5 };

  it('PDF: the primary is the sentence, so it takes the sentence color, and the sentence is still kept', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
    // The primary may hold a selector that fails only at render time (broken
    // CFI), which is undetectable here — so the slot is kept regardless
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('PDF: a real word timestamp keeps the word color and the kept sentence', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = real;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(WORD);
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('DOM: the primary spotlight takes the sentence color, and the sentence spotlight is kept too', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
    dom.helper.setState({ popupOpen: true, activeSegment: A });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });

  it('DOM: a real word timestamp keeps the word color', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = real;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });

  // What the highlight key's toast asks (issue #67): the same reading demote() makes
  it('wordTiming() says what the manager holds: a real word, the stand-in, or nothing', () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling();
    pdf.reader._internalReader._readAloudManager.activeTimestamp = real;
    expect(s.wordTiming(pdf.reader)).toBe('real');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    expect(s.wordTiming(pdf.reader)).toBe('stand-in');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = null;
    expect(s.wordTiming(pdf.reader)).toBe('none');
    expect(s.wordTiming(null)).toBe('none');
    expect(s.wordTiming({})).toBe('none');
  });

  // Scroll at every line (#157): whether the sentence being read will have a word, before its first
  it("segmentTiming() says what the active segment's clip carries: real timings, the stand-in, or none", () => {
    const pdf = fakePDF('word');
    const { styling: s, deps } = styling();
    const segment = { text: 'One sentence.' };
    let timings: unknown = [real, { ...real, start: 0.4, end: 0.8 }];
    const getTimestampsForSegment = vi.fn(() => timings);
    Object.assign(pdf.reader._internalReader._readAloudManager, { _activeSegment: segment, _controller: { getTimestampsForSegment } });
    expect(s.segmentTiming(pdf.reader)).toBe('real');
    expect(getTimestampsForSegment).toHaveBeenLastCalledWith(segment);
    timings = [whole];
    expect(s.segmentTiming(pdf.reader)).toBe('stand-in');
    for (timings of [null, []]) expect(s.segmentTiming(pdf.reader)).toBe('none');
    (pdf.reader._internalReader._readAloudManager as any)._activeSegment = null;
    expect(s.segmentTiming(pdf.reader)).toBe('none');
    expect(s.segmentTiming(null)).toBe('none');
    expect(s.segmentTiming({})).toBe('none');
    getTimestampsForSegment.mockImplementation(() => { throw new Error('dead'); });
    (pdf.reader._internalReader._readAloudManager as any)._activeSegment = segment;
    expect(s.segmentTiming(pdf.reader)).toBe('none');
    expect(deps.error).toHaveBeenCalled();
  });
});

// ---- issue #2: the gap between segments -----------------------------------

describe('the gap between segments (no active timestamp, stale primary still drawn)', () => {
  it('PDF: keeps the stale primary in the sentence color instead of flashing the word color', () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = null;
    styling().styling.attach(pdf.reader);
    const stale = { pageIndex: 0, tag: 'the old sentence' };
    pdf.view._readAloudHighlightedPosition = stale;
    pdf.page._pushHighlightedPosition([], stale, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
  });

  it('DOM: the primary spotlight takes the sentence color during the gap', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = null;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
  });
});

// ---- issue #3: the primary fails to resolve (broken CFI in an EPUB) --------

describe('word mode with a stand-in whose primary position fails to resolve', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };

  it('PDF: puts the sentence into the secondary slot when the primary is not drawn', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState({ ...pdfState(A, 1), activeWordSourcePosition: null });
    expect(pdf.view._readAloudHighlightedPosition).toBeNull();
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('PDF: keeps the slot when the primary resolves again — a doubled tint beats going dark', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState({ ...pdfState(A, 1), activeWordSourcePosition: null });
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    await pdf.view.setReadAloudState(pdfState(A, 2));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('DOM: sets the sentence spotlight when the primary spotlight is not drawn', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A, primarySelector: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBeUndefined();
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });

  it('DOM: keeps the sentence spotlight while the primary is drawn as well', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBeTruthy();
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });
});

// ---- issue #3 root cause: the resolver cannot resolve the generated CFI ----

describe('repairing a sentence selector the resolver cannot resolve', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'Wine and hazelnut country, somewhere.' };
  const BROKEN = { type: 'FragmentSelector', conformsTo: 'cfi', value: 'epubcfi(/6/16!/4/4/12/3,:32,:168)' };
  const REPAIRED_VALUE = 'epubcfi(/6/16!/4/4/12/1,:32,:168)';

  function repairableDOM() {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ ...BROKEN })) as never;
    // Like the real reader: an object not cloned into its compartment is unreadable
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) =>
      sel?.cloned && sel.value === REPAIRED_VALUE ? { toString: () => 'Wine  and hazelnut country, somewhere.' } : null,
    );
    return dom;
  }

  it('rewrites the text step until the displayed text matches the sentence, cloning the selector for the reader', () => {
    const dom = repairableDOM();
    const cloneIntoReader = vi.fn((_reader: unknown, value: unknown) => ({ ...(value as object), cloned: true }));
    styling({ cloneIntoReader }).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, primarySelector: null });
    const slot = dom.view._spotlights.get('ReadAloudActiveSentence') as any;
    expect(slot?.value).toBe(REPAIRED_VALUE);
    expect(slot?.cloned).toBe(true);
    expect(cloneIntoReader).toHaveBeenCalledWith(dom.reader, expect.objectContaining({ value: REPAIRED_VALUE }));
  });

  it('sets nothing when no rewrite shows the sentence text — never a wrong highlight', () => {
    const dom = repairableDOM();
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) =>
      sel?.cloned && sel.value === REPAIRED_VALUE ? { toString: () => 'a completely different passage' } : null,
    );
    styling({ cloneIntoReader: (_r, value) => ({ ...(value as object), cloned: true }) }).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, primarySelector: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBeUndefined();
  });

  it('leaves a selector that resolves as it is', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    (dom.view as any).toDisplayedRange = vi.fn(() => ({ toString: () => 'anything' }));
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });
});

// ---- issue #4: the selector resolves, but to the wrong text node -----------

describe('a sentence selector that resolves to the wrong text', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'In truth, I lean away.' };
  const WRONG = 'epubcfi(/6/16!/4/4/26/3,:0,:22)';
  const RIGHT = 'epubcfi(/6/16!/4/4/26/1,:0,:22)';

  function misresolvingDOM() {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.value === WRONG) return { toString: () => 'turning to syrup in the' };
      if (sel?.cloned && sel.value === RIGHT) return { toString: () => 'In truth,  I lean away.' };
      if (sel?.primary) return { toString: () => 'turning to syrup in the' };
      return null;
    });
    return dom;
  }
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  it('rewrites the selector when the displayed text is not the sentence, though it resolves', () => {
    const dom = misresolvingDOM();
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG });
    const slot = dom.view._spotlights.get('ReadAloudActiveSentence') as any;
    expect(slot?.value).toBe(RIGHT);
  });

  it('repairs the misplaced stand-in word position, so the primary lands right in the sentence color', () => {
    const dom = misresolvingDOM();
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: { type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG } });
    const primary = dom.view._spotlights.get('ReadAloudActiveSegment') as any;
    expect(primary?.value).toBe(RIGHT);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);

    const good = fakeDOM('word');
    good.reader._internalReader._readAloudManager.activeTimestamp = whole;
    good.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: RIGHT })) as never;
    (good.view as any).toDisplayedRange = vi.fn((sel: any) => (sel?.value === RIGHT || sel?.primary ? { toString: () => 'In truth, I lean away.' } : null));
    styling(clone).styling.attach(good.reader);
    good.helper.setState({ popupOpen: true, activeSegment: SEG });
    expect(good.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
  });
});

describe('a real word whose position resolves to the wrong text', () => {
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'In truth, I lean away.' };
  const real = { start: 0.4, end: 0.7, charStart: 12, charEnd: 16 }; // "lean"
  const WRONG_WORD = 'epubcfi(/6/16!/4/4/26/3,:12,:16)';
  const RIGHT_WORD = 'epubcfi(/6/16!/4/4/26/1,:12,:16)';
  const SENT = 'epubcfi(/6/16!/4/4/26/1,:0,:22)';
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  function domReading(rightWordResolves: boolean) {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = real;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: SENT })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.value === WRONG_WORD) return { toString: () => 'syru' };
      if (sel?.value === RIGHT_WORD && (rightWordResolves ? true : false)) return { toString: () => 'lean' };
      if (sel?.value === SENT) return { toString: () => 'In truth, I lean away.' };
      return null;
    });
    styling(clone).styling.attach(dom.reader);
    return dom;
  }

  it('repairs the word position before Zotero draws it, so the word color lands on the right word', () => {
    const dom = domReading(true);
    const state = { popupOpen: true, activeSegment: SEG, activeWordSourcePosition: { type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_WORD } };
    dom.helper.setState(state);
    const primary = dom.view._spotlights.get('ReadAloudActiveSegment') as any;
    expect(primary?.value).toBe(RIGHT_WORD);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });

  it('paints the primary transparent when no rewrite shows the active word', () => {
    const dom = domReading(false);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: { type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_WORD } });
    const primary = dom.view._spotlights.get('ReadAloudActiveSegment') as any;
    expect(primary?.value).toBe(WRONG_WORD);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe('#00000000');
  });

  it('leaves a correct word position untouched, with the word color', () => {
    const dom = domReading(true);
    const right = { type: 'FragmentSelector', conformsTo: 'cfi', value: RIGHT_WORD };
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: right });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBe(right);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });
});

describe('a sentence spanning two text nodes (range endpoints in different nodes)', () => {
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'I have seen cousins pulled into secondary.' };
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const WRONG_CROSS = 'epubcfi(/6/16!/4/4/26,/3:64,/5:130)';
  const RIGHT_CROSS = 'epubcfi(/6/16!/4/4/26,/1:64,/3:130)';
  const PROBE_1 = 'epubcfi(/6/16!/4/4/26/1,:0,:1)';
  // The paragraph: [pagebreak span, textA, inline span, textB]
  const PARENT = { childNodes: [{ nodeType: 1 }, { nodeType: 3 }, { nodeType: 1 }, { nodeType: 3 }] };
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  it('maps the spec text steps through the real child structure and repairs both endpoints', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_CROSS })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.cloned && sel.value === PROBE_1) return { toString: (): string => 'I', startContainer: { parentNode: PARENT } };
      if (sel?.cloned && sel.value === RIGHT_CROSS) return { toString: (): string => 'I have  seen cousins pulled into secondary.' };
      return null;
    });
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: null });
    const slot = dom.view._spotlights.get('ReadAloudActiveSentence') as any;
    expect(slot?.value).toBe(RIGHT_CROSS);
  });

  it('sets nothing when the repaired range does not show the sentence', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_CROSS })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.cloned && sel.value === PROBE_1) return { toString: (): string => 'I', startContainer: { parentNode: PARENT } };
      if (sel?.cloned && sel.value === RIGHT_CROSS) return { toString: (): string => 'some other passage entirely' };
      return null;
    });
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBeUndefined();
  });
});

// ---- A <br> or an inline image inside the sentence (issue #209) -------------------

describe('a sentence holding an unspaced <br/> or an inline image with alt text (issue #209)', () => {
  const HEAD_KEY = 'ZoteroTTSSentenceHead';

  /**
   * Zotero's Segment text for a paragraph: the document worker keeps a <br>
   * as a '\n' text node and an inline <img> as its alt text, neither with a
   * place in the document (Zotero 10.0.6 worker.js 165321-165329), and
   * addSegment collapses white space and trims.
   */
  const segmentTextOf = (children: Child[]) =>
    children
      .map((c) => (typeof c === 'string' ? c : 'br' in c ? '\n' : 'img' in c ? (c.source ?? c.img['aria-label'] ?? c.img.alt ?? '') : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

  /**
   * A DOM view over one paragraph. Selectors are the CFI ranges Zotero
   * writes for a sentence, `epubcfi(P,/a:x,/b:y)`, resolved as its resolver
   * does: text step n is the (n-1)/2-th text node. The range Zotero hands
   * over runs from the first to the last text node and holds nothing for a
   * <br> or an <img> (reader.js EPUBPositionMapper / SnapshotPositionMapper).
   */
  function reading(children: Child[], timestamp: Record<string, unknown>) {
    const p = paragraph(children);
    const selector = (a: number, x: number, b: number, y: number) => ({ value: `epubcfi(/6/2!/4/2,/${a}:${x},/${b}:${y})` });
    class DOMView {
      _spotlights = new Map<string, unknown>();
      _readAloud: any;
      setSpotlight(key: string, sel: unknown) {
        if (sel) this._spotlights.set(key, sel);
        else this._spotlights.delete(key);
      }
      _getSpotlightColor(key: string) {
        if (key === 'ReadAloudActiveSegment') return ZOTERO_SEGMENT;
        throw new Error('Unknown highlight key: ' + key);
      }
      toDisplayedRange(sel: any) {
        const m = /^epubcfi\([^,]*,\/(\d+):(\d+),\/(\d+):(\d+)\)$/.exec(String(sel?.value ?? ''));
        const start = m ? p.texts[(Number(m[1]) - 1) / 2] : undefined;
        const end = m ? p.texts[(Number(m[3]) - 1) / 2] : undefined;
        return m && start && end ? p.range(start, Number(m[2]), end, Number(m[4])) : null;
      }
    }
    class ReadAloud {
      state: any = { popupOpen: false };
      constructor(public _view: DOMView) {}
      _effectivePrimaryGranularity() {
        return 'word';
      }
      _resolveSegmentSelector(state: any) {
        return state.activeSegment?.selector ?? null;
      }
      setState(state: any) {
        this.state = state;
        if (!state.popupOpen || !state.activeSegment) return null;
        this._view.setSpotlight('ReadAloudActiveSegment', state.activeWordSourcePosition);
        return null;
      }
    }
    const view = new DOMView();
    view._readAloud = new ReadAloud(view);
    const error = vi.fn();
    const s = createHighlightStyling({ style: () => STYLE, error });
    s.attach({ _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: timestamp } } });
    const last = p.texts.length - 1;
    const whole = selector(1, 0, 2 * last + 1, p.texts[last].data.length);
    /** Zotero pushes the Segment (first to last text node) and the active word's position. */
    const read = (word: 'whole sentence' | { from: number; to: number }, segment = { selector: whole, text: segmentTextOf(children) }) =>
      view._readAloud.setState({
        popupOpen: true,
        activeSegment: segment,
        activeWordSourcePosition: word === 'whole sentence' ? segment.selector : selector(1, word.from, 1, word.to),
      });
    /** What the view would draw for a slot of ours, as text. */
    const drawn = (key: string) => {
      const sel = view._spotlights.get(key);
      return sel === undefined ? undefined : String(view.toDisplayedRange(sel));
    };
    return { view, error, read, drawn, selector, segmentText: segmentTextOf(children) };
  }

  const standIn = (children: Child[]) => ({ start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: segmentTextOf(children).length });

  describe.each([
    ['an unspaced <br/>', ['Roses are red,', BR, 'Violets are blue.']],
    ['an inline <img> with alt text', ['Roses are red, ', { img: { alt: 'violets' } }, ' are blue.']],
    ['an inline <img> with an aria-label', ['Roses are red, ', { img: { 'aria-label': 'violets', alt: 'v.png' } }, ' are blue.']],
    // The EPUB view relabels every image "Zoom In" (reader.js 55590-55601); Zotero read the file's alt
    ['an EPUB image the reader relabeled', ['Roses are red, ', { img: { 'aria-label': 'Zoom In', alt: 'violets' }, source: 'violets' }, ' are blue.']],
    ['an EPUB image whose own aria-label the reader replaced', ['Roses are red, ', { img: { 'aria-label': 'Zoom In', alt: 'v.png' }, source: 'violets' }, ' are blue.']],
    ['(control) a <br/> followed by a newline', ['Roses are red,', BR, '\nViolets are blue.']],
  ] as Array<[string, Child[]]>)('%s, at the default highlight levels', (_name, children) => {
    it('a voice without word timing: the sentence is highlighted, not painted transparent', () => {
      const r = reading(children, standIn(children));
      r.read('whole sentence');
      expect(r.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
      expect(r.error).not.toHaveBeenCalled();
    });

    it('a voice with word timings: the sentence is drawn around the word', () => {
      // "are", characters 6-9 of "Roses are red, ..."
      const r = reading(children, { start: 0.1, end: 0.4, charStart: 6, charEnd: 9 });
      r.read({ from: 6, to: 9 });
      expect(r.drawn(HEAD_KEY)).toBe('Roses ');
      expect(r.error).not.toHaveBeenCalled();
    });
  });

  it('still refuses a sentence position on the wrong text beside a <br/> (issue #4)', () => {
    const children: Child[] = ['Roses are red,', BR, 'Violets are blue.'];
    const r = reading(children, { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 17 });
    // The Segment is the second line, but its position lands on the first
    r.read('whole sentence', { selector: r.selector(1, 0, 1, 14), text: 'Violets are blue.' });
    expect(r.view._getSpotlightColor('ReadAloudActiveSegment')).toBe('#00000000');
  });
});

/**
 * A DOM view for positions Zotero names but the page does not show as
 * written. Zotero's helper draws the word position as the primary, the
 * plugin keeps the sentence around it.
 */
function positionsView(toDisplayedRange: (sel: any) => unknown, timestamp: Record<string, unknown>) {
  class DOMView {
    _spotlights = new Map<string, unknown>();
    _readAloud: any;
    setSpotlight(key: string, sel: unknown) {
      if (sel) this._spotlights.set(key, sel);
      else this._spotlights.delete(key);
    }
    _getSpotlightColor(key: string) {
      if (key === 'ReadAloudActiveSegment') return ZOTERO_SEGMENT;
      throw new Error('Unknown highlight key: ' + key);
    }
    toDisplayedRange(sel: any) {
      return toDisplayedRange(sel);
    }
  }
  class ReadAloud {
    state: any = { popupOpen: false };
    constructor(public _view: DOMView) {}
    _effectivePrimaryGranularity() {
      return 'word';
    }
    _resolveSegmentSelector(state: any) {
      return state.activeSegment?.selector ?? null;
    }
    setState(state: any) {
      this.state = state;
      if (!state.popupOpen || !state.activeSegment) return null;
      this._view.setSpotlight('ReadAloudActiveSegment', state.activeWordSourcePosition);
      return null;
    }
  }
  const view = new DOMView();
  view._readAloud = new ReadAloud(view);
  const error = vi.fn();
  const cloneIntoReader = vi.fn((_reader: unknown, value: unknown) => value);
  createHighlightStyling({ style: () => STYLE, error, cloneIntoReader }).attach({
    _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: timestamp } },
  });
  const read = (segment: { selector: unknown; text: string }, word: unknown) =>
    view._readAloud.setState({ popupOpen: true, activeSegment: segment, activeWordSourcePosition: word });
  /** What the view draws for a slot, as text; null when it resolves to nothing. */
  const drawn = (key: string) => {
    const sel = view._spotlights.get(key);
    if (sel === undefined) return undefined;
    const range = view.toDisplayedRange(sel);
    return range == null ? null : String(range);
  };
  const primary = () => ({ color: view._getSpotlightColor('ReadAloudActiveSegment'), text: drawn('ReadAloudActiveSegment') });
  return { view, error, cloneIntoReader, read, drawn, primary };
}

const wholeOf = (text: string) => ({ start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: text.length });

describe('a one-character span in an EPUB, which Zotero writes as a point CFI (issue #235)', () => {
  // Zotero writes `epubcfi(P:o)` when a span is one character and
  // `epubcfi(P,:o,:e)` otherwise (Zotero 10.0.6 reader.js:62321-62353); the
  // view resolves a point to an empty range (EpubCFI.toRange sets no end,
  // reader.js:47006-47054). The Segment's own position comes from the same
  // mapper, so a one-character Segment is a point too.
  const PATH = '/6/2!/4/14';
  const TEXT = 'A plain sentence follows.';
  const cfi = (value: string) => ({ type: 'FragmentSelector', conformsTo: 'cfi', value });
  /** One paragraph whose only text node is text step /1, resolved as the EPUB view does. */
  function epub(text: string) {
    const p = paragraph([text]);
    const node = p.texts[0];
    const at = `epubcfi(${PATH}/1`;
    return (sel: any) => {
      const v = String(sel?.value ?? '');
      if (!v.startsWith(at)) return null;
      const range = /^,:(\d+),:(\d+)\)$/.exec(v.slice(at.length));
      if (range) return p.range(node, Number(range[1]), node, Number(range[2]));
      const point = /^:(\d+)\)$/.exec(v.slice(at.length));
      return point ? p.range(node, Number(point[1]), node, Number(point[1])) : null;
    };
  }
  const sentence = { selector: cfi(`epubcfi(${PATH}/1,:0,:${TEXT.length})`), text: TEXT };

  it('(control) a word of several characters, a range CFI, is drawn in the word color inside the sentence', () => {
    const r = positionsView(epub(TEXT), { start: 0.1, end: 0.4, charStart: 2, charEnd: 7 });
    r.read(sentence, cfi(`epubcfi(${PATH}/1,:2,:7)`));
    expect(r.primary()).toEqual({ color: WORD, text: 'plain' });
    expect(r.drawn(HEAD)).toBe('A ');
  });

  it('draws the word "A" in the word color, the sentence around it', () => {
    const r = positionsView(epub(TEXT), { start: 0, end: 0.1, charStart: 0, charEnd: 1 });
    r.read(sentence, cfi(`epubcfi(${PATH}/1:0)`));
    expect(r.primary()).toEqual({ color: WORD, text: 'A' });
    expect((r.view._spotlights.get('ReadAloudActiveSegment') as any).value).toBe(`epubcfi(${PATH}/1,:0,:1)`);
    expect(r.drawn(TAIL)).toBe(' plain sentence follows.');
    expect(r.cloneIntoReader).toHaveBeenCalled();
    expect(r.error).not.toHaveBeenCalled();
  });

  it('draws a one-character Segment, a heading "7", in the sentence color with a voice without word timing', () => {
    const r = positionsView(epub('7'), wholeOf('7'));
    const seven = { selector: cfi(`epubcfi(${PATH}/1:0)`), text: '7' };
    r.read(seven, seven.selector);
    expect(r.primary()).toEqual({ color: SENTENCE, text: '7' });
  });

  it('repairs a point that also names the wrong text step, through the text-step rewrites (issue #4)', () => {
    const r = positionsView(epub(TEXT), { start: 0, end: 0.1, charStart: 0, charEnd: 1 });
    r.read(sentence, cfi(`epubcfi(${PATH}/3:0)`));
    expect(r.primary()).toEqual({ color: WORD, text: 'A' });
  });

  it('still paints the primary transparent when the character at the point is not the word', () => {
    const r = positionsView(epub(TEXT), { start: 0, end: 0.1, charStart: 0, charEnd: 1 });
    // "A" is being read, but the point is at "p"
    r.read(sentence, cfi(`epubcfi(${PATH}/1:2)`));
    expect(r.primary().color).toBe('#00000000');
  });
});

describe("the last block of a web snapshot, named from the source while the view appends its own elements (issue #236)", () => {
  // Zotero names a block `:last-child` / `:last-of-type` from the source
  // file (reader.js:62854-62872, worker.js:166654-166687), and resolves it
  // with `body.querySelector` on the live page (reader.js:60569-60609),
  // whose body ends with the view's annotation overlay and Read Aloud's
  // jump button, two `<div>`s (reader.js:53721-53734, 44897).
  const LAST = 'The last paragraph ends here.';
  /** The live body: the source's children, then the view's two `<div>`s. */
  function snapshot(source: Array<{ tag: string; text: string }>) {
    const live = [...source, { tag: 'div', text: '' }, { tag: 'div', text: '' }].map((el) => ({ ...el, p: paragraph([el.text]) }));
    /** `body > tag:pseudo`, as querySelector answers on the live body. */
    const select = (value: string) => {
      const m = /^body > (\w+)(?::([\w-]+)(?:\((\d+)\))?)?$/.exec(value);
      if (!m) return null;
      const [, tag, pseudo, nArg] = m;
      const n = Number(nArg);
      const of = live.filter((e) => e.tag === tag);
      const pick = {
        undefined: of[0],
        'last-child': live[live.length - 1],
        'last-of-type': of[of.length - 1],
        'nth-child': live[n - 1],
        'nth-last-child': live[live.length - n],
        'nth-last-of-type': of[of.length - n],
      }[String(pseudo)];
      return pick && pick.tag === tag ? pick : null;
    };
    return (sel: any) => {
      if (sel?.type !== 'CssSelector') return null;
      const el = select(String(sel.value));
      if (!el) return null;
      const node = el.p.texts[0];
      const ref = sel.refinedBy;
      return ref ? el.p.range(node, ref.start, node, ref.end) : el.p.range(node, 0, node, node.data.length);
    };
  }
  const SOURCE = [{ tag: 'h1', text: 'Title.' }, { tag: 'p', text: 'One.' }, { tag: 'p', text: 'Two.' }, { tag: 'p', text: LAST }];
  const css = (value: string, refinedBy?: { start: number; end: number }) => ({
    type: 'CssSelector',
    value,
    ...(refinedBy ? { refinedBy: { type: 'TextPositionSelector', ...refinedBy } } : {}),
  });

  it('(control) a block named by its index is drawn: the word, the sentence around it', () => {
    const r = positionsView(snapshot(SOURCE), { start: 0.1, end: 0.4, charStart: 0, charEnd: 3 });
    r.read({ selector: css('body > p:nth-child(3)'), text: 'Two.' }, css('body > p:nth-child(3)', { start: 0, end: 3 }));
    expect(r.primary()).toEqual({ color: WORD, text: 'Two' });
  });

  it('draws the word of the last paragraph in the word color, and the sentence around it', () => {
    const r = positionsView(snapshot(SOURCE), { start: 0.1, end: 0.4, charStart: 4, charEnd: 8 });
    r.read({ selector: css('body > p:last-child'), text: LAST }, css('body > p:last-child', { start: 4, end: 8 }));
    expect(r.primary()).toEqual({ color: WORD, text: 'last' });
    expect((r.view._spotlights.get('ReadAloudActiveSegment') as any).refinedBy).toEqual({ type: 'TextPositionSelector', start: 4, end: 8 });
    expect([r.drawn(HEAD), r.drawn(TAIL)]).toEqual(['The ', ' paragraph ends here.']);
    expect(r.error).not.toHaveBeenCalled();
  });

  it('draws the last paragraph in the sentence color with a voice without word timing', () => {
    const r = positionsView(snapshot(SOURCE), wholeOf(LAST));
    const seg = { selector: css('body > p:last-child'), text: LAST };
    r.read(seg, seg.selector);
    expect(r.primary()).toEqual({ color: SENTENCE, text: LAST });
  });

  it('finds the last <div> of the source, which `div:last-of-type` no longer names', () => {
    const source = [{ tag: 'div', text: 'Nav.' }, { tag: 'p', text: 'Body.' }, { tag: 'div', text: LAST }, { tag: 'p', text: 'Footer.' }];
    const r = positionsView(snapshot(source), wholeOf(LAST));
    const seg = { selector: css('body > div:last-of-type'), text: LAST };
    r.read(seg, seg.selector);
    expect(r.primary()).toEqual({ color: SENTENCE, text: LAST });
  });

  it('keeps the rest of the name when the last block is a wrapper: `body > div:last-child > p:nth-child(2)`', () => {
    // The article sits in the source's last <div>; on the live page that name points at the view's last <div>
    const second = paragraph(['Second paragraph of the article.']);
    const r = positionsView((sel: any) => {
      if (sel?.value !== 'body > div:nth-last-child(3) > p:nth-child(2)') return null;
      const node = second.texts[0];
      return second.range(node, 0, node, node.data.length);
    }, wholeOf('Second paragraph of the article.'));
    const seg = { selector: css('body > div:last-child > p:nth-child(2)'), text: 'Second paragraph of the article.' };
    r.read(seg, seg.selector);
    expect(r.primary()).toEqual({ color: SENTENCE, text: 'Second paragraph of the article.' });
    expect((r.view._spotlights.get('ReadAloudActiveSegment') as any).value).toBe('body > div:nth-last-child(3) > p:nth-child(2)');
  });

  it('still paints the primary transparent when no block counted back shows the text being read', () => {
    const r = positionsView(snapshot(SOURCE), wholeOf('Not on this page.'));
    const seg = { selector: css('body > p:last-child'), text: 'Not on this page.' };
    r.read(seg, seg.selector);
    expect(r.primary().color).toBe('#00000000');
  });
});
