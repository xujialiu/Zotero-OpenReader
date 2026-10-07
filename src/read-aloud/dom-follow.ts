/** EPUB following with explicit input intent and whole-range geometry (#93). */
import { autoScrollMode, readingLine } from '../core/settings';
import { followTarget, lineInputs, lineWords, RETARGET_MS, type Box, type LineWords, type SentenceInViewDeps } from './sentence-in-view';
import { createFollowIntents, type FollowIntent } from './follow-intent';

interface Owned {
  intent: FollowIntent;
  reader: any; view: any; helper: any;
  active: boolean; paused: boolean; force: boolean;
  key: string | null; mode: string; line: number; pending: boolean; reason: string;
  last: { at: number; top?: number; left?: number; reason: string } | null;
  /** Scroll at every line (#157): the regime the sentence was last placed in, the line placed last, and what it had to follow. */
  regime: 'line' | 'sentence' | null; placedLine: Box | null; words: LineWords | null;
  navigating: number; undo: Array<() => void>;
}

export function createDOMFollow(deps: SentenceInViewDeps) {
  const intents = deps.intents ?? createFollowIntents();
  const records = new Map<any, Owned>();
  const dead = (v: any) => !!deps.isDead?.(v);
  const waive = (v: any): any => deps.waiveXrays ? deps.waiveXrays(v) : v;
  const exported = (fn: (...args: any[]) => any, target: any) => deps.exportFunction ? deps.exportFunction(fn, target) : fn;
  let disposed = false;

  function shadow(r: Owned, object: any, name: string, make: (original: any) => (...args: any[]) => any) {
    if (typeof object[name] !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    const wrapper = exported(make(object[name]), object);
    object[name] = wrapper;
    r.undo.push(() => {
      if (dead(object) || object[name] !== wrapper) return;
      if (descriptor) Object.defineProperty(object, name, descriptor);
      else delete object[name];
    });
  }

  function disengage(source: Owned, reason: string) {
    if (source.navigating) return;
    const wasAutomatic = source.intent.automatic;
    source.intent.automatic = false;
    for (const r of records.values()) {
      if (r.reader !== source.reader || dead(r.view)) continue;
      if (!wasAutomatic && !r.force && !r.pending) continue;
      r.force = false; r.pending = false; r.reason = reason;
      const win = r.view.iframeWindow;
      win.scrollTo(win.scrollX, win.scrollY);
    }
  }

  function navigateManually(r: Owned, original: any, self: any, args: any[]) {
    if (r.navigating) return Reflect.apply(original, self, args);
    disengage(r, 'navigation');
    return Reflect.apply(original, self, args);
  }

  function visible(r: Owned) {
    return !r.view._suspended && !r.view.iframeDocument.hidden && r.reader._window?.windowState !== 2;
  }

  function rects(range: any): Box[] {
    const list = range?.getClientRects();
    const boxes: Box[] = [];
    for (let i = 0; list && i < list.length; i++) {
      const b = list[i];
      if (b.width || b.height) boxes.push([b.left, b.top, b.right, b.bottom]);
    }
    return boxes;
  }
  /**
   * What a docked bar covers of the window, `height` px tall (#135). None for
   * a paginated EPUB: a page cannot scroll out from under a bar, and Zotero's
   * page margin (40 px, 20 px below 800 px wide) is what the bar mostly covers.
   */
  function insetOf(r: Owned, height: number): { top: number; bottom: number } {
    const frame = r.view._iframe;
    const box = deps.covered && r.view.flowMode !== 'paginated' ? frame?.getBoundingClientRect?.() : null;
    if (!box) return { top: 0, bottom: 0 };
    const y = Number(box.top);
    return deps.covered!(frame, { top: y, bottom: y + height });
  }
  const union = (boxes: Box[]): Box => [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];

  function navigate(r: Owned, selector: any) {
    const options = { ifNeeded: false, block: 'start', behavior: 'smooth', skipHistory: true };
    // A whole range's left/top edge need not be its reading-order start
    // in RTL or vertical pagination. Use Zotero's starting-character probe.
    const target = r.helper._collapseToStart?.(selector) ?? selector;
    r.navigating++;
    try { r.view.navigateToSelector(target, deps.cloneInto ? deps.cloneInto(r.view.iframeDocument.documentElement, options) : options); }
    finally { r.navigating--; }
  }

  function run(r: Owned, state = waive(r.helper.state)) {
    if (deps.enabled?.() === false && !(r.force && r.reason === 'explicit')) return;
    if (disposed || dead(r.view) || !state?.active || !state.popupOpen || state.annotationPopup || !r.view.initialized) return;
    if (state.paused && !r.force) return;
    if (!r.intent.automatic && !r.force) return;
    if (!visible(r)) { r.pending = true; return; }
    const selector = r.helper._resolveSegmentSelector(state);
    if (!selector) return;
    const key = JSON.stringify(selector);
    const mode = autoScrollMode(deps.mode?.());
    const line = readingLine(deps.line?.());
    const entered = r.key !== key;
    // A new reading line re-places the sentence as a new style does; pages have no line (#155)
    const changedMode = r.mode !== mode || (r.view.flowMode !== 'paginated' && r.line !== line);
    const reset = r.pending || changedMode || r.force;
    if (reset) r.last = null;
    if (entered || changedMode) { r.regime = null; r.placedLine = null; }
    let range = r.view.toDisplayedRange(selector);
    // Unmounted EPUB sections have no displayed range. Native navigation
    // mounts the section before highlighting; remeasure the complete range.
    if (!range) { navigate(r, selector); range = r.view.toDisplayedRange(selector); }
    const boxes = rects(range);
    if (!boxes.length) { r.pending = true; return; }
    const win = r.view.iframeWindow;
    const doc = r.view.iframeDocument;
    const root = doc.scrollingElement ?? doc.documentElement;
    const width = doc.documentElement.clientWidth || win.innerWidth;
    const height = doc.documentElement.clientHeight || win.innerHeight;
    const whole = union(boxes);
    let part: Box | null = null;
    let wordLine: Box | null = null;
    let wordSelector: any = null;
    if (deps.wordTiming?.(r.reader) === 'real' && state.activeWordSourcePosition) {
      wordSelector = r.helper._positionToSelector(state.activeWordSourcePosition);
      const words = rects(wordSelector && r.view.toDisplayedRange(wordSelector));
      // The line a word starts on: a hyphenated word's first rect (#157)
      if (words.length) { part = union(words); wordLine = words[0]; }
    }
    const lines = mode === 'line'
      ? lineInputs(r, lineWords({ wordShown: deps.wordShown?.() ?? true, active: deps.wordTiming?.(r.reader) ?? 'none',
        segment: deps.segmentTiming?.(r.reader) ?? 'none' }), wordLine)
      : null;
    r.words = lines?.words ?? null;
    const fresh = lines ? lines.entered : entered || changedMode;
    const outside = (b: Box) => b[0] < 0 || b[1] < 0 || b[2] > width || b[3] > height;
    if (r.view.flowMode === 'paginated') {
      // A spread-crossing sentence cannot fit on one page. Start at its
      // first rect, then turn only for a real word that leaves the spread.
      const fits = whole[2] - whole[0] <= width && whole[3] - whole[1] <= height;
      // At every line, a highlighted word turns to its own page when it leaves this one (#157)
      const target = lines?.words === 'word' && part ? (r.force || outside(part) ? wordSelector : null) :
        lines?.words === 'coming' ? (r.force ? selector : null) :
        r.force || (fresh && (mode !== 'outside' || !fits || outside(whole))) ? selector :
        !fits ? (part && outside(part) ? wordSelector : null) : outside(whole) ? selector : null;
      if (target) {
        navigate(r, target);
        r.last = { at: Date.now(), reason: 'page' };
      }
    } else {
      const translate = (b: Box): Box => [b[0] + win.scrollX, b[1] + win.scrollY, b[2] + win.scrollX, b[3] + win.scrollY];
      const target = followTarget({ head: translate(boxes[0]), whole: translate(whole), part: part && translate(part),
        viewport: { scrollTop: win.scrollY, scrollLeft: win.scrollX, clientWidth: width, clientHeight: height,
          scrollHeight: root.scrollHeight, scrollWidth: root.scrollWidth }, mode, line, entered: fresh, force: r.force,
        inset: insetOf(r, height),
        ...(lines ? { words: lines.words, wordLine: lines.wordLine && translate(lines.wordLine), placedLine: r.placedLine } : {}) });
      if (target.placedLine) r.placedLine = target.placedLine;
      const now = deps.now?.() ?? Date.now();
      if (target.reason !== 'none' && !(r.last && r.last.top === target.top && r.last.left === target.left && now - r.last.at < RETARGET_MS)) {
        const options: Record<string, unknown> = { behavior: 'smooth' };
        if (target.top !== undefined) options.top = target.top;
        if (target.left !== undefined) options.left = target.left;
        win.scrollTo(deps.cloneInto ? deps.cloneInto(doc.documentElement, options) : options);
        // Keep EPUB's user anchor and cached visible sections in sync.
        r.view.flow?._settleAnchorAfterProgrammaticScroll?.();
        r.view.flow?.invalidate?.();
        r.last = { at: now, top: target.top, left: target.left, reason: target.reason };
      }
    }
    r.key = key; r.mode = mode; r.line = line; r.force = false; r.pending = false;
  }

  const attempt = (r: Owned, state?: any) => { try { run(r, state); } catch (e) { deps.error(e); } };

  function listen(r: Owned, target: any, name: string, fn: (e: any) => void, capture = true) {
    if (!target?.addEventListener) return;
    const listener = exported((event: any) => { try { if (!dead(r.view)) fn(waive(event)); } catch (e) { deps.error(e); } }, target);
    target.addEventListener(name, listener, capture);
    r.undo.push(() => { if (!dead(target)) target.removeEventListener(name, listener, capture); });
  }

  function own(r: Owned, key: 'positionLocked' | 'scrolling', value: boolean) {
    const descriptor = Object.getOwnPropertyDescriptor(r.helper, key);
    if (descriptor?.configurable === false || descriptor?.get || descriptor?.set) throw new Error(`OpenReader: cannot own EPUB ${key}`);
    Object.defineProperty(r.helper, key, { configurable: true, enumerable: true,
      get: exported(() => value, r.helper), set: exported(() => {}, r.helper) });
    r.undo.push(() => {
      if (dead(r.helper)) return;
      const restored = key === 'positionLocked' ? r.intent.automatic : false;
      if (descriptor) Object.defineProperty(r.helper, key, { ...descriptor, value: restored });
      else { delete r.helper[key]; r.helper[key] = restored; }
    });
  }

  function release(r: Owned) {
    records.delete(r.view);
    for (const undo of r.undo.reverse()) { try { undo(); } catch (e) { deps.error(e); } }
  }

  function attach(reader: any): boolean {
    if (disposed) return false;
    intents.get(reader);
    for (const r of records.values()) if (dead(r.view)) release(r);
    let attached = false;
    for (const raw of [reader?._internalReader?._primaryView, reader?._internalReader?._secondaryView]) {
      const view = waive(raw);
      // Scope is EPUB: snapshots and Reading Mode keep native following.
      if (!view || dead(view) || !['scrolled', 'paginated'].includes(view.flowMode) || !view._readAloud || !view.iframeDocument) continue;
      if (records.has(view)) { attached = true; continue; }
      const helper = waive(view._readAloud);
      const state = waive(helper.state);
      const r: Owned = { reader, view, helper, intent: intents.get(reader),
        active: !!state?.active, paused: !!state?.paused, force: false, key: null, mode: autoScrollMode(deps.mode?.()), line: readingLine(deps.line?.()),
        pending: false, reason: 'initial', last: null, navigating: 0, undo: [], regime: null, placedLine: null, words: null };
      try {
        own(r, 'positionLocked', false);
        // Native scroll handlers are already bound. This flag bypasses only
        // their scroll-based unlock; semantic/manual input still disengages.
        own(r, 'scrolling', true);
        shadow(r, helper, 'setPositionLocked', original => function(this: any, locked: boolean) {
          if (locked && deps.resuming?.(r.reader)) return Reflect.apply(original, this, [locked]);
          if (locked && r.intent.automatic) { r.force = true; r.reason = 'explicit'; }
          else if (!locked && !r.navigating) disengage(r, 'navigation');
          return Reflect.apply(original, this, [locked]);
        });
        shadow(r, helper, 'setState', original => function(this: any, rawState: any) {
          const state = waive(rawState);
          if (state?.active && !r.active) { r.key = null; r.last = null; r.reason = 'session'; }
          if (state?.active && r.active && r.paused && !state.paused) {
            r.force = r.intent.automatic; r.last = null; r.reason = 'resume';
          }
          if (state?.paused && !r.paused) {
            r.pending = false; r.force = false;
            const win = r.view.iframeWindow; win.scrollTo(win.scrollX, win.scrollY);
          }
          r.active = !!state?.active; r.paused = !!state?.paused;
          if (!r.active || !state.popupOpen) { r.force = false; r.pending = false; }
          // Mount/navigate before native spotlight rendering, as Zotero does.
          attempt(r, rawState);
          return Reflect.apply(original, this, [rawState]);
        });
        shadow(r, view, 'navigate', original => function(this: any, ...args: any[]) {
          if (!waive(args[1])?.skipHistory) return navigateManually(r, original, this, args);
          return Reflect.apply(original, this, args);
        });
        for (const name of ['navigateBack', 'navigateForward', 'navigateToNextPage', 'navigateToPreviousPage', 'navigateToFirstPage', 'navigateToLastPage', 'findNext', 'findPrevious']) {
          shadow(r, view, name, original => function(this: any, ...args: any[]) {
            return navigateManually(r, original, this, args);
          });
        }
        shadow(r, view, 'destroy', original => function(this: any, ...args: any[]) {
          release(r); return Reflect.apply(original, this, args);
        });
        const win = view.iframeWindow, doc = view.iframeDocument;
        const content = (e: any) => !e.target?.closest?.('input, textarea, select, button, [contenteditable="true"], [role="dialog"], [role="menu"]');
        listen(r, doc, 'wheel', e => { if (e.isTrusted !== false && !e.ctrlKey && !e.metaKey && (e.deltaX || e.deltaY) && content(e)) disengage(r, 'wheel'); });
        listen(r, doc, 'touchmove', e => { if (e.isTrusted !== false && !e.defaultPrevented && e.touches?.length === 1 && content(e)) { disengage(r, 'touch'); } });
        listen(r, doc, 'keydown', e => {
          if (e.isTrusted !== false && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey &&
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(e.key) && content(e)) { disengage(r, 'keyboard'); }
        });
        listen(r, doc, 'pointerdown', e => {
          if (e.isTrusted === false || e.button !== 0 || !content(e)) return;

          const root = doc.documentElement;
          if ((root.scrollHeight > root.clientHeight && e.clientX >= root.clientWidth) ||
            (root.scrollWidth > root.clientWidth && e.clientY >= root.clientHeight)) disengage(r, 'scrollbar');
        });
        listen(r, doc, 'pointermove', e => {
          if (e.isTrusted === false || !e.buttons || !content(e) || doc.getSelection?.()?.isCollapsed !== false) return;
          if (e.clientX < 20 || e.clientY < 20 || e.clientX > win.innerWidth - 20 || e.clientY > win.innerHeight - 20) disengage(r, 'selection');
        });
        const restore = () => { if (r.paused && !r.force) return; if (r.intent.automatic || r.force) { r.pending = true; attempt(r); } };
        for (const name of ['resize', 'focus', 'pageshow']) listen(r, win, name, restore);
        listen(r, doc, 'visibilitychange', restore);
        if (reader._window) for (const name of ['sizemodechange', 'focus']) listen(r, reader._window, name, restore);
        records.set(view, r); attached = true;
      } catch (e) { release(r); deps.error(e); }
    }
    return attached;
  }

  return {
    attach,
    refresh() { for (const r of records.values()) if (!dead(r.view)) attempt(r); },
    /** The tab retains its choice independently of the reading session. */
    automatic(reader: any): boolean | null {
      const view = waive(reader?._internalReader?._lastView ?? reader?._internalReader?._primaryView);
      const r = dead(view) ? undefined : records.get(view);
      return r ? r.intent.automatic : null;
    },
    locate(reader: any, automatic = false): void {
      if (automatic) intents.get(reader).automatic = true;
      for (const r of records.values()) if (r.reader === reader && !dead(r.view)) {
        r.reason = 'explicit'; r.force = true; r.last = null; attempt(r);
      }
    },
    manual(reader: any): void {
      for (const r of records.values()) if (r.reader === reader && !dead(r.view)) {
        disengage(r, 'player');
      }
      intents.get(reader).automatic = false;
    },
    inspect(reader: any): Record<string, unknown> {
      const view = waive(reader?._internalReader?._lastView ?? reader?._internalReader?._primaryView);
      const r = records.get(view);
      return r ? { kind: 'epub', patched: true, following: r.intent.automatic, paused: r.paused, pending: r.pending, mode: autoScrollMode(deps.mode?.()),
        line: readingLine(deps.line?.()), flow: r.view.flowMode, reason: r.reason, last: r.last, words: r.words, placedLine: r.placedLine,
        covered: insetOf(r, r.view.iframeDocument.documentElement.clientHeight || r.view.iframeWindow.innerHeight) } : { kind: 'dom', patched: false };
    },
    dispose() { disposed = true; for (const r of [...records.values()]) release(r); },
  };
}
