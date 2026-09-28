import { describe, expect, it, vi } from 'vitest';
import { createFollowIntents } from '../../src/read-aloud/follow-intent';
import { createDOMFollow } from '../../src/read-aloud/dom-follow';
import type { WordTiming } from '../../src/core/highlight-level';

function fixture(intents = createFollowIntents()) {
  const doc: any = new EventTarget();
  const win: any = new EventTarget();
  Object.assign(win, { document: doc, innerWidth: 800, innerHeight: 1000, scrollX: 0, scrollY: 1000, scrollTo: vi.fn() });
  doc.defaultView = win;
  doc.documentElement = { scrollWidth: 800, scrollHeight: 8000, clientWidth: 800, clientHeight: 1000 };
  doc.scrollingElement = doc.documentElement;
  doc.hidden = false;
  const box = (top: number, bottom: number) => ({ left: 10, top, right: 700, bottom, width: 690, height: bottom - top });
  const ranges = new Map<any, any>();
  const range = (key: string, top: number, bottom: number) => {
    const r: any = { getBoundingClientRect: () => box(top, bottom), getClientRects: () => [box(top, bottom)], cloneRange: () => ({ ...r, collapse: vi.fn() }) };
    ranges.set(key, r); return key;
  };
  const nativeNavigate = vi.fn();
  class View {
    initialized = true; iframeWindow = win; iframeDocument = doc; flowMode = 'scrolled';
    // The view's iframe in the reader document, below a 41 px toolbar
    _iframe = { getBoundingClientRect: () => ({ top: 41, bottom: 1041 }) };
    flow = { _settleAnchorAfterProgrammaticScroll: vi.fn(), invalidate: vi.fn() };
    _readAloud: any;
    toDisplayedRange(key: any) { return ranges.get(key); }
    navigateToSelector = nativeNavigate;
    lockPositionToReadAloud() { this._readAloud.setPositionLocked(true); }
    _onManualNavigation() { this._readAloud.setPositionLocked(false); }
    _handleScroll() { if (!this._readAloud.scrolling) this._onManualNavigation(); }
    navigateToNextPage() { this._onManualNavigation(); }
    destroy() {}
  }
  const view = new View();
  const rendered = vi.fn();
  class Helper {
    state: any = null; positionLocked = true; scrolling = false; _view = view;
    setState(state: any) {
      const previous = this.state;
      this.state = state;
      if (state.active && !previous?.active) this.positionLocked = true;
      if (this.positionLocked && previous?.activeSegment !== state.activeSegment) nativeNavigate('native');
      rendered(state);
      return 'render-result';
    }
    setPositionLocked(value: boolean) { this.positionLocked = value; }
    _resolveSegmentSelector(state: any) { return state.activeSegment?.sourcePosition; }
    _positionToSelector(position: any) { return position; }
  }
  const helper = view._readAloud = new Helper();
  const reader = { _window: {}, _internalReader: { _primaryView: view } };
  let mode: 'outside' | 'sentence' | 'line' = 'outside';
  let line = 50;
  type Covered = { top: number; bottom: number };
  const deps = { intents, enabled: () => true, mode: () => mode, line: () => line, resuming: () => false, error: vi.fn(),
    wordTiming: (): WordTiming => 'real', segmentTiming: (): WordTiming => 'real', wordShown: () => true,
    covered: ((_frame: unknown, _box: Covered): Covered => ({ top: 0, bottom: 0 })) };
  const module = createDOMFollow(deps);
  const push = (key: string, word?: string) => helper.setState({ active: true, popupOpen: true, activeSegment: { position: key, sourcePosition: key }, activeWordSourcePosition: word });
  return { view, helper, module, reader, range, push, win, nativeNavigate, rendered, deps, mode: (v: typeof mode) => { mode = v; },
    line: (v: number) => { line = v; } };
}

describe('EPUB auto-scroll', () => {
  it('keeps rendering without scrolling in manual mode and follows again when enabled', () => {
    const f = fixture(); f.deps.enabled = () => false;
    f.module.attach(f.reader); f.push(f.range('manual', 1200, 1300));
    expect(f.rendered).toHaveBeenCalled();
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    expect(f.nativeNavigate).not.toHaveBeenCalled();
    f.deps.enabled = () => true; f.module.refresh();
    expect(f.win.scrollTo).toHaveBeenCalled(); f.module.dispose();
  });
  it.each(['scrolled', 'paginated'])('keeps manual navigation through reentry and settings changes in %s', flow => {
    const f = fixture(); f.view.flowMode = flow;
    try {
      f.module.attach(f.reader); f.push(f.range('a', 100, 150)); f.view.navigateToNextPage();
      f.win.scrollTo.mockClear(); f.nativeNavigate.mockClear();
      f.range('a', -50, 0); f.win.dispatchEvent(new Event('scroll'));
      f.push(f.range('b', 100, 150)); f.win.dispatchEvent(new Event('scroll'));
      f.mode('sentence'); f.module.refresh();
      expect(f.module.automatic(f.reader)).toBe(false);
      expect(f.win.scrollTo).not.toHaveBeenCalled(); expect(f.nativeNavigate).not.toHaveBeenCalled();
    } finally { f.module.dispose(); }
  });
  it('keeps manual disengagement through a native playback-toggle lock', () => {
    const f = fixture(); f.module.attach(f.reader); f.push(f.range('a', 700, 750));
    f.view._onManualNavigation();
    f.deps.resuming = () => true;
    f.view.lockPositionToReadAloud(); f.push('a');
    expect(f.module.inspect(f.reader).following).toBe(false);
    f.deps.resuming = () => false;
    f.module.locate(f.reader, true);
    expect(f.module.inspect(f.reader).following).toBe(true);
  });
  it('preserves native rendering and centers complete ranges only when clipped', () => {
    const f = fixture(); f.module.attach(f.reader);
    expect(f.push(f.range('edge', 950, 1000))).toBe('render-result');
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.push(f.range('cut', 950, 1050));
    expect(f.win.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1500 }));
    expect(f.rendered).toHaveBeenCalledTimes(2);
    expect(f.nativeNavigate).not.toHaveBeenCalled();
  });
  it('centers each sentence once, and re-centers on explicit return', () => {
    const f = fixture(); f.mode('sentence'); f.module.attach(f.reader);
    const key = f.range('visible', 700, 750);
    f.push(key); f.push(key);
    expect(f.win.scrollTo).toHaveBeenCalledTimes(1);
    f.view.lockPositionToReadAloud(); f.push(key);
    expect(f.win.scrollTo).toHaveBeenCalledTimes(2);
  });
  it('places each sentence at the reading line and re-places it when the line changes (#155)', () => {
    const f = fixture(); f.mode('sentence'); f.line(10); f.module.attach(f.reader);
    const key = f.range('visible', 700, 750);
    f.push(key);
    // 1700 in the document, less a tenth of the 950 px the sentence leaves free
    expect(f.win.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 1605 }));
    f.push(key);
    expect(f.win.scrollTo).toHaveBeenCalledTimes(1);
    f.line(90); f.module.refresh();
    expect(f.win.scrollTo).toHaveBeenCalledTimes(2);
    expect(f.win.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 845 }));
    expect(f.module.inspect(f.reader)).toMatchObject({ mode: 'sentence', line: 90 });
    f.module.dispose();
  });
  it('turns paginated pages without regard to the reading line', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.mode('sentence'); f.module.attach(f.reader);
    f.push(f.range('page', 100, 150));
    expect(f.nativeNavigate).toHaveBeenCalledTimes(1);
    f.line(10); f.module.refresh();
    expect(f.nativeNavigate).toHaveBeenCalledTimes(1);
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.module.dispose();
  });
  it('ignores automatic scroll callbacks but keeps manual navigation disengaged across modes and sentences', () => {
    const f = fixture(); f.mode('sentence'); f.module.attach(f.reader);
    f.push(f.range('a', 700, 750)); f.view._handleScroll();
    expect(f.module.inspect(f.reader).following).toBe(true);
    f.view.navigateToNextPage(); f.win.scrollTo.mockClear();
    f.mode('outside'); f.push(f.range('b', 1100, 1200));
    expect(f.module.inspect(f.reader).following).toBe(false);
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.module.locate(f.reader, true);
    expect(f.win.scrollTo).toHaveBeenCalled();
  });
  it('keeps paginated layout and navigates only the head or a real clipped word', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.module.attach(f.reader);
    f.push(f.range('span', 0, 1800));
    expect(f.nativeNavigate).toHaveBeenCalledTimes(1);
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.push('span', f.range('word', 1100, 1120));
    expect(f.nativeNavigate).toHaveBeenCalledTimes(2);
  });
  it('uses a collapsed starting selector for paginated navigation, regardless of rectangle order', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.module.attach(f.reader);
    (f.helper as any)._collapseToStart = (selector: string) => selector + '-head';
    f.push(f.range('span', 0, 1800));
    expect(f.nativeNavigate).toHaveBeenCalledWith('span-head', expect.objectContaining({ block: 'start' }));
  });
  it('restores helper properties and methods on dispose', () => {
    const f = fixture(); const original = f.helper.setState;
    f.module.attach(f.reader); f.push(f.range('a', 700, 750));
    f.view._onManualNavigation(); f.module.dispose();
    expect(f.helper.setState).toBe(original);
    expect(f.helper.positionLocked).toBe(false);
    expect(Object.getOwnPropertyDescriptor(f.helper, 'positionLocked')?.get).toBeUndefined();
    expect(f.deps.error).not.toHaveBeenCalled();
  });
  it('does not turn a visible paginated sentence in outside mode', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.module.attach(f.reader);
    f.push(f.range('a', 900, 950));
    expect(f.nativeNavigate).not.toHaveBeenCalled();
  });
  it('defers hidden playback and recovers only the latest sentence while still following', () => {
    const f = fixture(); f.mode('sentence'); f.module.attach(f.reader);
    f.view.iframeDocument.hidden = true;
    f.push(f.range('old', 100, 120)); f.push(f.range('latest', 700, 750));
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.view.iframeDocument.hidden = false;
    f.module.refresh();
    expect(f.win.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1225 }));
    f.view._onManualNavigation(); f.win.scrollTo.mockClear();
    f.win.dispatchEvent(new Event('focus'));
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    expect(f.module.inspect(f.reader).pending).toBe(false);
  });
  it('applies a setting change while paused without restarting playback or enabling disengaged following', () => {
    const f = fixture(); f.module.attach(f.reader);
    const key = f.range('a', 700, 750); f.push(key);
    f.helper.state.paused = true; f.mode('sentence'); f.module.refresh();
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    expect(f.helper.state.paused).toBe(true);
    f.view._onManualNavigation(); f.win.scrollTo.mockClear();
    f.mode('outside'); f.module.refresh(); f.mode('sentence'); f.module.refresh();
    expect(f.win.scrollTo).not.toHaveBeenCalled();
  });
  it('treats selection-edge dragging as manual navigation but ignores ordinary pointer motion', () => {
    const f = fixture(); f.module.attach(f.reader); f.push(f.range('a', 700, 750));
    const doc = f.view.iframeDocument;
    doc.getSelection = () => ({ isCollapsed: false });
    // The registered handler is tested with a trusted-shaped event through
    // an injected EventTarget; real OS trust remains a live check.
    const handlers: Record<string, (e: any) => void> = {};
    f.module.dispose();
    doc.addEventListener = (type: string, fn: (e: any) => void) => { handlers[type] = fn; };
    const module = createDOMFollow(f.deps); module.attach(f.reader);
    handlers.pointermove({ buttons: 0, clientX: 1, clientY: 1 });
    expect(module.inspect(f.reader).following).toBe(true);
    handlers.pointermove({ buttons: 1, clientX: 1, clientY: 1 });
    expect(module.inspect(f.reader).following).toBe(false);
    module.dispose();
  });
});


// Issue #157: a 20 px word line leaves 980 px free, 294 of it above at 30%
describe('EPUB scroll at every line', () => {
  function lines(flow = 'scrolled') {
    const f = fixture(); f.view.flowMode = flow; f.mode('line'); f.line(30); f.module.attach(f.reader);
    const top = () => f.win.scrollTo.mock.lastCall?.[0]?.top;
    return { ...f, top };
  }
  it('places the line of each new word and holds still along a line in a scrolled EPUB', () => {
    const f = lines(); const key = f.range('s', 700, 760);
    f.push(key, f.range('w1', 700, 720));
    expect(f.top()).toBe(1406);
    f.push(key, f.range('w2', 702, 720));
    expect(f.win.scrollTo).toHaveBeenCalledTimes(1);
    f.push(key, f.range('w3', 720, 740));
    expect(f.win.scrollTo).toHaveBeenCalledTimes(2);
    expect(f.top()).toBe(1426);
    expect(f.module.inspect(f.reader)).toMatchObject({ mode: 'line', words: 'word', placedLine: [10, 1720, 700, 1740], last: { reason: 'line' } });
    f.module.dispose();
  });
  it('waits for the first word of a timed sentence, and places a wordless one as at every sentence', () => {
    const f = lines(); const key = f.range('s', 700, 760);
    f.deps.wordTiming = () => 'none';
    f.push(key);
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.deps.wordTiming = () => 'real';
    f.push(key, f.range('w1', 700, 720));
    expect(f.top()).toBe(1406);
    f.deps.wordTiming = () => 'stand-in'; f.deps.segmentTiming = () => 'stand-in';
    const next = f.range('next', 800, 860);
    f.push(next, next); f.push(next, next);
    expect(f.win.scrollTo).toHaveBeenCalledTimes(2);
    // The whole 60 px sentence: 940 px free, 282 above
    expect(f.top()).toBe(1800 - 282);
    expect(f.module.inspect(f.reader)).toMatchObject({ words: 'sentence' });
    f.module.dispose();
  });
  it('scrolls at every sentence with the Word switch off, and places the line when it comes back on', () => {
    const f = lines(); const key = f.range('s', 700, 760);
    f.deps.wordShown = () => false;
    f.push(key, f.range('w3', 720, 740)); f.push(key, f.range('w4', 740, 760));
    expect(f.win.scrollTo).toHaveBeenCalledTimes(1);
    expect(f.top()).toBe(1700 - 282);
    f.deps.wordShown = () => true; f.module.refresh();
    expect(f.win.scrollTo).toHaveBeenCalledTimes(2);
    expect(f.top()).toBe(1740 - 294);
    f.module.dispose();
  });
  it('places the line again on a return', () => {
    const f = lines(); const key = f.range('s', 700, 760);
    f.push(key, f.range('w1', 700, 720));
    f.view.lockPositionToReadAloud(); f.push(key, 'w1');
    expect(f.win.scrollTo).toHaveBeenCalledTimes(2);
    expect(f.top()).toBe(1406);
    f.module.dispose();
  });
  it('turns a paginated page only when the word leaves it, to the word', () => {
    const f = lines('paginated'); const key = f.range('span', 100, 300);
    f.push(key, f.range('pw1', 100, 120)); f.push(key, f.range('pw2', 280, 300));
    expect(f.nativeNavigate).not.toHaveBeenCalled();
    f.push(key, f.range('pw3', 1100, 1120));
    expect(f.nativeNavigate).toHaveBeenCalledTimes(1);
    expect(f.nativeNavigate).toHaveBeenLastCalledWith('pw3', expect.objectContaining({ block: 'start' }));
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.deps.wordTiming = () => 'stand-in'; f.deps.segmentTiming = () => 'stand-in';
    f.push(f.range('page', 100, 150));
    expect(f.nativeNavigate).toHaveBeenCalledTimes(2);
    expect(f.nativeNavigate).toHaveBeenLastCalledWith('page', expect.anything());
    f.module.dispose();
  });
});


describe('EPUB under a docked bar (#135)', () => {
  it('scrolls a sentence out from under the Top bar and the Bottom bar in a scrolled EPUB', () => {
    const top = fixture(); const covered = vi.fn(() => ({ top: 34, bottom: 0 })); top.deps.covered = covered;
    top.module.attach(top.reader);
    top.push(top.range('high', 10, 40));
    // The window's box in the reader document: the iframe's top, the document's client height
    expect(covered).toHaveBeenCalledWith(top.view._iframe, { top: 41, bottom: 1041 });
    // 966 px left uncovered: its center on the sentence's, 34 px below the window's top
    expect(top.win.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1025 - 483 - 34 }));
    expect(top.module.inspect(top.reader)).toMatchObject({ covered: { top: 34, bottom: 0 } });
    const bottom = fixture(); bottom.deps.covered = () => ({ top: 0, bottom: 34 });
    bottom.module.attach(bottom.reader);
    bottom.push(bottom.range('edge', 950, 1000));
    expect(bottom.win.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1975 - 483 }));
  });
  it('leaves a paginated EPUB alone: a page cannot scroll out from under a bar', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.deps.covered = () => ({ top: 34, bottom: 0 });
    f.module.attach(f.reader);
    f.push(f.range('a', 10, 40));
    expect(f.nativeNavigate).not.toHaveBeenCalled();
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    expect(f.module.inspect(f.reader)).toMatchObject({ covered: { top: 0, bottom: 0 } });
  });
  it('keeps manual intent regardless of whether a bar covers the sentence', () => {
    vi.useFakeTimers();
    for (const covered of [{ top: 0, bottom: 0 }, { top: 0, bottom: 34 }]) {
      const f = fixture(); f.deps.covered = () => covered;
      f.module.attach(f.reader); f.push(f.range('a', 100, 150)); f.view.navigateToNextPage();
      f.range('a', 970, 995); f.win.dispatchEvent(new Event('scroll')); vi.runAllTimers();
      expect(f.module.inspect(f.reader).following).toBe(false);
      f.module.dispose();
    }
    vi.runAllTimers(); vi.useRealTimers();
  });
});


describe('persistent manual EPUB follow (#153)', () => {
  it.each(['scrolled', 'paginated'])('keeps manual across sessions and supports one-time return in %s', flow => {
    const f = fixture(); f.view.flowMode = flow; f.module.attach(f.reader);
    f.push(f.range('a', 1200, 1300)); f.module.manual(f.reader);
    f.helper.setState({ ...f.helper.state, paused: true });
    f.win.scrollTo.mockClear(); f.nativeNavigate.mockClear();
    f.helper.setState({ ...f.helper.state, paused: false });
    f.helper.setState({ active: false, popupOpen: false }); f.push(f.range('b', 1400, 1500));
    expect(f.module.automatic(f.reader)).toBe(false);
    expect(f.win.scrollTo).not.toHaveBeenCalled(); expect(f.nativeNavigate).not.toHaveBeenCalled();
    f.module.locate(f.reader);
    expect(f.module.automatic(f.reader)).toBe(false);
    expect(flow === 'scrolled' ? f.win.scrollTo : f.nativeNavigate).toHaveBeenCalled();
    f.helper.setState({ ...f.helper.state, paused: true });
    f.module.locate(f.reader, true);
    expect(f.module.automatic(f.reader)).toBe(true); expect(f.helper.state.paused).toBe(true);
    f.module.dispose();
  });
});


it('keeps the EPUB default snapshot through a change received before playback', () => {
  let initial = false;
  const intents = createFollowIntents(() => initial);
  const first = fixture(intents); first.module.attach(first.reader);
  initial = true;
  const second = fixture(intents); second.module.attach(second.reader);
  try {
    first.push(first.range('first', 2000, 2100)); second.push(second.range('second', 2000, 2100));
    expect(first.module.automatic(first.reader)).toBe(false);
    expect(first.win.scrollTo).not.toHaveBeenCalled();
    expect(second.module.automatic(second.reader)).toBe(true);
    expect(second.win.scrollTo).toHaveBeenCalled();
    first.module.locate(first.reader, true); second.module.manual(second.reader);
    expect(first.module.automatic(first.reader)).toBe(true);
    expect(second.module.automatic(second.reader)).toBe(false);
  } finally { first.module.dispose(); second.module.dispose(); }
});
