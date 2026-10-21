return (async () => {
  // Issue #197: speed keys on a tab whose Player was never opened step the Global speed.
  const R = Zotero.ZoteroTTSRun, S = R.state || (R.state = {}), P = R.params || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (t, ms = 8000, step = 70) => { const e = Date.now() + ms; while (Date.now() < e) { const v = t(); if (v) return v; await sleep(step); } return t(); };
  const gw = Services.wm.getMostRecentWindow('navigator:browser'); gw.focus(); await sleep(350);
  if (Services.focus.activeWindow !== gw) throw new Error('Zotero window is not OS-active; native input refused');
  const waive = el => Components.utils.waiveXrays(el);
  const readers = () => Zotero.Reader?._readers || [];
  const reader = slot => { for (const r of readers()) try { if (r?.itemID === slot?.itemID) return r; } catch (e) {} return null; };
  const irOf = slot => reader(slot)?._internalReader || null;
  const doc = slot => reader(slot)?._iframeWindow?.document || null;
  const frame = slot => doc(slot)?.getElementById('ztts-player-frame') || null;
  const child = slot => { const f = frame(slot); return f?.contentWindow ? waive(f.contentWindow) : null; };
  const cdoc = slot => child(slot)?.document || null;
  const idx = slot => { const r = reader(slot), l = readers(); for (let i = 0; i < l.length; i++) if (l[i] === r) return i; return -1; };
  const openedDom = slot => frame(slot)?.hidden === false && !!cdoc(slot)?.querySelector('.player');
  const view = slot => irOf(slot)?._primaryView || null;
  const clickAt = (win, x, y) => { const gw = Services.wm.getMostRecentWindow('navigator:browser'); if (Services.focus.activeWindow !== gw) gw.focus(); const ww = Components.utils.waiveXrays(win), wu = Components.utils.waiveXrays(win.windowUtils || ww.windowUtils); const scale = ww.devicePixelRatio || 1; const sx = Math.round((ww.mozInnerScreenX + x) * scale), sy = Math.round((ww.mozInnerScreenY + y) * scale); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_MOVE, 0, 0, null); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN, 0, 0, null); wu.sendNativeMouseEvent(sx, sy, wu.NATIVE_MOUSE_MESSAGE_BUTTON_UP, 0, 0, null); };
  const center = el => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  const clickHost = (slot, el) => { const [x, y] = center(el); clickAt(reader(slot)._iframeWindow, x, y); };
  const clickChild = (slot, el) => { const fb = frame(slot).getBoundingClientRect(), b = el.getBoundingClientRect(); clickAt(reader(slot)._iframeWindow, fb.left + b.left + b.width / 2, fb.top + b.top + b.height / 2); };
  const select = slot => { const r = reader(slot); if (!r) throw new Error('fixture reader gone'); try { Zotero_Tabs.select(r.tabID); } catch (e) {} try { r.focus?.(); } catch (e) {} try { view(slot)?._iframeWindow?.focus?.(); } catch (e) {} return globalThis.Zotero_Tabs?.selectedID === r.tabID; };
  const p = Services.prefs;
  const speedPercent = () => p.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.speedPercent') ? p.getIntPref('extensions.zotero.zotero-tts.readAloud.speedPercent') : null;
  // this profile has speedUp unbound (empty) and speedDown=Shift+V: bind the case's keys for the
  // press sequence and restore the whole shortcuts.* branch exactly afterwards
  const SB = 'extensions.zotero.zotero-tts.shortcuts.';
  const snapShortcuts = () => { const o = {}; try { const b = p.getBranch(SB); for (const k of b.getChildList('')) o[k] = { user: p.prefHasUserValue(SB + k), value: p.prefHasUserValue(SB + k) ? p.getStringPref(SB + k) : null }; } catch (e) {} return o; };
  const setShort = (k, v) => { if (v === null) { if (p.prefHasUserValue(SB + k)) p.clearUserPref(SB + k); } else p.setStringPref(SB + k, v); };
  const sameSnap = (a, b2) => Object.keys(a).length === Object.keys(b2).length && Object.keys(a).every(k => b2[k] && a[k].user === b2[k].user && a[k].value === b2[k].value);
  S.shortcutSnapshot = snapShortcuts();
  setShort('speedUp', 'Shift+C');
  setShort('speedDown', 'Shift+X');
  const restoreShortcuts = () => { for (const [k, v] of Object.entries(S.shortcutSnapshot || {})) setShort(k, v.user ? v.value : null); return sameSnap(S.shortcutSnapshot, snapShortcuts()); };
  const mainWin = Services.wm.getMostRecentWindow('navigator:browser');
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(mainWin)) throw new Error('nsITextInputProcessor begin failed');
  const mk = (key, code, keyCode, shift) => new mainWin.KeyboardEvent('', { key, code, keyCode, shiftKey: !!shift });
  const press = (key, code, keyCode) => { let c = 0; c += tip.keydown(mk('Shift', 'ShiftLeft', 16)); c += tip.keydown(mk(key, code, keyCode, true)); tip.keyup(mk(key, code, keyCode, true)); tip.keyup(mk('Shift', 'ShiftLeft', 16)); return c; };
  const out = { pre: {}, presses: [], opens: {} };
  // close the other fixture sessions so key routing is unambiguous
  out.closedOthers = {};
  for (const kind of ['outline', 'epub']) {
    const slot = (S.fixtures || {})[kind];
    if (slot && openedDom(slot)) { try { reader(slot)._internalReader.toggleReadAloudPopup(false); out.closedOthers[kind] = await wait(() => !openedDom(slot), 6000, 100) ? 'closed' : 'still-open'; } catch (e) { out.closedOthers[kind] = 'error: ' + String(e); } }
    else out.closedOthers[kind] = 'already-closed';
    await sleep(150);
  }
  // import + open the fresh tab, never opening its Player
  const path = (Zotero.isWin ? String(P.fixturesDir || '').replace(/\//g, '\\') : String(P.fixturesDir || '')) + (Zotero.isWin ? '\\' : '/') + 'fixture-c.pdf';
  const slotFresh = { title: 'Zotero-TTS issue 197 ' + Date.now(), itemID: null, key: null };
  const imported = await Zotero.Attachments.importFromFile({ file: path, libraryID: Zotero.Libraries.userLibraryID, title: slotFresh.title });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id) throw new Error('fixture-c import failed');
  slotFresh.itemID = item.id; slotFresh.key = item.key;
  S.fixtures = S.fixtures || {}; S.fixtures.fresh = slotFresh;
  const pending = Zotero.Reader.open(item.id, null, { openInBackground: false, allowDuplicate: false }); if (pending?.then) await pending;
  if (!(await wait(() => reader(slotFresh)?._internalReader?._readAloudManager ? reader(slotFresh) : null, 24000, 250))) throw new Error('fresh reader did not expose manager');
  select(slotFresh);
  const v = view(slotFresh), vw = v?._iframeWindow || v?.iframeWindow;
  if (!(await wait(() => globalThis.Zotero_Tabs?.selectedID === reader(slotFresh)?.tabID && vw?.document && vw.document.hidden === false && (v?._suspended ?? false) !== true, 20000))) throw new Error('fresh iframe not ready');
  await sleep(400);
  // never-opened evidence
  const m = () => irOf(slotFresh)?._readAloudManager;
  out.pre = { lang: m()?.lang ?? null, active: !!m()?.active, playerOpen: frame(slotFresh)?.hidden === false, framePresent: !!frame(slotFresh), globalSpeedPref: { user: p.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.globalSpeed'), value: p.getBoolPref('extensions.zotero.zotero-tts.readAloud.globalSpeed') }, speedPercent0: speedPercent() };
  if (out.pre.playerOpen === true) throw new Error('fresh tab Player is open; the check requires it never opened');
  const toastScan = () => {
    const hits = [];
    const scan = (root, tag) => { if (!root) return; let all; try { all = root.querySelectorAll('*'); } catch (e) { return; } for (let i = 0; i < all.length; i++) { const el = all[i]; const t = (el.textContent || '').trim(); if (/^\d+(\.\d+)?×$/.test(t) && el.children.length <= 1) hits.push(tag + ':' + waive(el).tagName + '.' + String(waive(el).className).slice(0, 30) + '=' + t); } };
    scan(doc(slotFresh), 'host'); scan(vw?.document, 'view');
    return hits.slice(0, 4);
  };
  const pressAndObserve = (key, code, keyCode, expected) => {
    const before = speedPercent();
    const t0 = Date.now();
    const keydownReturn = press(key, code, keyCode);
    let toast = null;
    while (Date.now() - t0 < 800) { const hits = toastScan(); if (hits.length) { toast = hits; break; } sleep(60); }
    const after = speedPercent();
    return { key: 'Shift+' + key, expected, keydownReturn, toast, speedPercentBefore: before, speedPercentAfter: after, msToToast: toast ? Date.now() - t0 : null };
  };
  // three Shift+C
  for (const exp of ['1.50×', '1.55×', '1.60×']) out.presses.push(pressAndObserve('C', 'KeyC', 67, exp));
  // three Shift+X
  for (const exp of ['1.55×', '1.50×', '1.45×']) out.presses.push(pressAndObserve('X', 'KeyX', 88, exp));
  out.speedPercentAfterKeys = speedPercent();
  // open the Player now; it must read the last speed shown
  const tb = doc(slotFresh).getElementById('ztts-player-toggle') || doc(slotFresh).querySelector('button[aria-controls="ztts-player-frame"]');
  if (!tb) throw new Error('player toggle button missing on fresh tab');
  clickHost(slotFresh, tb);
  if (!(await wait(() => frame(slotFresh)?.hidden === false && !!cdoc(slotFresh)?.querySelector('.player'), 10000, 100))) throw new Error('fresh Player did not open');
  const play = cdoc(slotFresh).querySelector('.play');
  clickChild(slotFresh, play);
  await wait(() => m()?.paused === true, 6000);
  await sleep(300);
  out.opens = { playerOpened: true, paused: m()?.paused === true, speedLabel: cdoc(slotFresh).querySelector('[data-adjust="speed"] .adjust-value')?.textContent ?? null, managerSpeed: m()?.speed ?? null, speedPercentFinal: speedPercent(), globalSpeedPrefAfter: { user: p.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.globalSpeed'), value: p.getBoolPref('extensions.zotero.zotero-tts.readAloud.globalSpeed') } };
  const ups = out.presses.slice(0, 3), downs = out.presses.slice(3);
  out.shortcutsRestored = restoreShortcuts();
  out.allOk = out.presses.length === 6
    && ups.every((r, i) => r.toast && r.toast.some(t => t.includes(r.expected)) && r.speedPercentAfter === 145 + (i + 1) * 5)
    && downs.every((r, i) => r.toast && r.toast.some(t => t.includes(r.expected)) && r.speedPercentAfter === 160 - (i + 1) * 5)
    && out.opens.speedLabel !== null && out.opens.paused === true && out.shortcutsRestored === true;
  return JSON.stringify(out, null, 1);
})()
