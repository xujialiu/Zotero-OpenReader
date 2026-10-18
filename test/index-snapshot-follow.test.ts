import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #188: a web snapshot read in M. A snapshot is a DOMView with Zotero's
 * own ReadAloud helper, no flowMode and no _pages. The plugin's whole
 * start-up is run over a snapshot-shaped reader, as in test/index.test.ts,
 * and Shift+R (Go to reading position) is pressed in it: README says it
 * returns once and leaves A/M unchanged.
 */
vi.setConfig({ testTimeout: 30_000 });

/** Zotero's DOM-view helper, the lock logic only (reader.js class ReadAloud, 53345-53440 of 11.0). */
class ZoteroReadAloud {
  state: any = null;
  positionLocked = true;
  scrolling = false;
  navigations = 0;
  setState(state: any) {
    const previous = this.state;
    this.state = state;
    if (state.active && !previous?.active) this.positionLocked = true;
    if (state.activeSegment && state.activeSegment !== previous?.activeSegment && !state.annotationPopup && this.positionLocked) this.navigations++;
    return null;
  }
  setPositionLocked(locked: boolean) {
    if (this.state?.active) this.positionLocked = locked;
  }
  _resolveSegmentSelector(state: any) {
    return state.activeSegment?.sourcePosition ?? null;
  }
}

function anything(): any {
  const own = new Map<PropertyKey, unknown>();
  return new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') return () => '';
      if (prop === 'length') return 0;
      if (prop === 'hasMoreElements') return () => false;
      if (!own.has(prop)) own.set(prop, anything());
      return own.get(prop);
    },
    apply: () => anything(),
    construct: () => anything(),
    set: (_target, prop, value) => (own.set(prop, value), true),
  });
}

function stub(members: Record<PropertyKey, unknown>): any {
  return new Proxy(members, {
    get(target, prop) {
      if (!(prop in target)) target[prop as string] = prop === 'then' ? undefined : anything();
      return target[prop as string];
    },
  });
}

let running: any = null;
afterEach(async () => {
  await running?.shutdown(7);
  running = null;
});

describe('Shift+R in M on a web snapshot (#188)', () => {
  it('returns to the sentence once and leaves the view alone for the sentences after it', async () => {
    const helper = new ZoteroReadAloud();
    const sentence = (n: number) => ({ id: n, position: {}, sourcePosition: `s${n}` });
    const manager: any = {
      active: true, paused: false, activeSegment: sentence(1),
      _stateChanged() {
        queueMicrotask(() => view._readAloud.setState({ popupOpen: true, active: manager.active, paused: manager.paused, activeSegment: manager.activeSegment }));
      },
    };
    const box = { left: 10, top: 2000, right: 700, bottom: 2040, width: 690, height: 40 };
    const doc: any = {
      hidden: false,
      documentElement: { scrollWidth: 800, scrollHeight: 8000, clientWidth: 800, clientHeight: 1000 },
      addEventListener() {}, removeEventListener() {},
    };
    doc.scrollingElement = doc.documentElement;
    const win: any = { scrollX: 0, scrollY: 0, innerWidth: 800, innerHeight: 1000, scrollTo: vi.fn(), addEventListener() {}, removeEventListener() {} };
    const view: any = {
      initialized: true, iframeDocument: doc, iframeWindow: win, _readAloud: helper,
      toDisplayedRange: () => ({ getClientRects: () => [box], getBoundingClientRect: () => box }),
      lockPositionToReadAloud: () => view._readAloud.setPositionLocked(true),
      navigateToSelector: vi.fn(),
    };
    const internal = {
      _readAloudManager: manager, _primaryView: view, _lastView: view,
      _lockPositionToReadAloud: () => view.lockPositionToReadAloud(),
    };
    let keydown: ((event: unknown) => void) | undefined;
    const reader = { _internalReader: internal, _iframeWindow: { addEventListener: (type: string, fn: (event: unknown) => void) => { if (type === 'keydown') keydown = fn; } } };

    const prefs = new Map<string, unknown>([['extensions.zotero.zotero-tts.readAloud.defaultAutoScroll', false]]);
    const Zotero = stub({
      Prefs: stub({ get: (key: string) => prefs.get(key) }),
      Reader: stub({ _readers: [reader] }),
    });
    vi.resetModules();
    Object.assign(globalThis, {
      Zotero,
      ADDON_DISABLE: 4, ADDON_UNINSTALL: 6,
      Components: stub({ utils: stub({ isDeadWrapper: () => false, waiveXrays: (v: unknown) => v, exportFunction: (fn: unknown) => fn, cloneInto: (v: unknown) => v }) }),
    });
    await import('../src/index');
    running = Zotero.ZoteroTTS;
    await running.startup({ id: 'zotero-tts@xujialiu.top', version: '0.0.0-test', rootURI: 'file:///plugin/' });
    expect(keydown).toBeTypeOf('function');

    // Reading in M (Default scrolling: Manual-scroll): the session is running
    view._readAloud.setState({ popupOpen: true, active: true, paused: false, activeSegment: manager.activeSegment });
    // A placement passes an options object; a bare scrollTo(x, y) stops a smooth scroll where it is
    const placements = () => win.scrollTo.mock.calls.filter((call: unknown[]) => typeof call[0] === 'object').length + helper.navigations;
    const before = placements();

    // Shift+R: Go to reading position
    keydown!({ key: 'R', code: 'KeyR', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, repeat: false, defaultPrevented: false,
      target: { tagName: 'DIV' }, preventDefault() {}, stopPropagation() {} });
    await Promise.resolve();
    expect(placements() - before).toBe(1);

    // The next sentence is read: M means the view stays where it is
    manager.activeSegment = sentence(2);
    manager._stateChanged();
    await Promise.resolve();
    expect(placements() - before, 'the view followed the next sentence although the tab is in M').toBe(1);
    expect(JSON.parse(running.diagnostics.autoScroll())).toEqual([expect.objectContaining({ kind: 'snapshot', following: false })]);
  });
});
