(async () => {
  const P = 'extensions.zotero.zotero-tts.';
  const native = 'extensions.zotero.reader.readAloudVoices';
  const state = Zotero.ZoteroTTSRun.state.vc261;
  const stubBase = state.localRun?.stubBase;
  const local = 'local::af_sample';
  const system = state.systemVoice?.id;
  const win = Zotero.getMainWindow();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const A = Zotero.Reader._readers.find(row => row.itemID === state.fixtureA?.itemID);
  const B = Zotero.Reader._readers.find(row => row.itemID === state.fixtureB?.itemID);
  if (!A || !B || !system?.startsWith('system::') || stubBase !== 'http://127.0.0.1:8973' ||
      Services.prefs.getStringPref(P + 'local.baseURL') !== stubBase ||
      Services.prefs.getStringPref(P + 'local.headers') !== '' ||
      JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder !== false) {
    throw new Error('Fixture setup or isolated provider guard failed');
  }
  const itemKey = r => r === A ? state.fixtureA.key : state.fixtureB.key;
  const recordKey = r => 'user/' + itemKey(r);
  const manager = r => r._internalReader._readAloudManager;
  const close = r => r._internalReader.toggleReadAloudPopup(false);
  const saved = async r => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices()).readers
    .find(row => row.key === recordKey(r))?.saved?.voice?.id;
  const seed = r => Services.prefs.setStringPref(P + 'documentVoices.' + recordKey(r),
    JSON.stringify({ voice: { id: r === A ? local : system, lang: 'en' }, manual: true, ts: Date.now() }));
  const engine = async r => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers
    .find(row => row.itemID === r.itemID);
  const list = async r => JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList())[
    Zotero.Reader._readers.indexOf(r)];
  const playerWindow = r => {
    const frame = r._iframeWindow.document.getElementById('ztts-player-frame');
    return frame?.contentWindow && Components.utils.waiveXrays(frame.contentWindow);
  };
  const status = r => playerWindow(r)?.document?.querySelector('.status-button')?.title || '';
  const providers = r => Array.from(manager(r).tiers || [], value => String(value));
  const stub = async (path, method = 'POST') => {
    const response = await fetch(stubBase + '/control/' + path, { method });
    if (!response.ok) throw new Error('Loopback fixture control did not respond');
    const data = await response.json();
    if (data.sawCredentialLikeHeader) throw new Error('Loopback fixture saw a credential-like header');
    return data;
  };
  const wait = async (get, accept, duration = 6500) => {
    const end = Date.now() + duration;
    do {
      const row = await get();
      if (accept(row)) return row;
      await sleep(200);
    } while (Date.now() < end);
    return null;
  };
  const select = async r => {
    win.Zotero_Tabs.select(r.tabID);
    await sleep(450);
  };
  const play = r => {
    const rw = r._iframeWindow;
    const tip = Components.classes['@mozilla.org/text-input-processor;1']
      .createInstance(Components.interfaces.nsITextInputProcessor);
    const event = (key, code, keyCode, shiftKey = true) => new rw.KeyboardEvent('',
      { key, code, keyCode, shiftKey, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(rw);
    try {
      tip.keydown(event('Shift', 'ShiftLeft', 16));
      tip.keydown(event(' ', 'Space', 32));
      tip.keyup(event(' ', 'Space', 32));
      tip.keyup(event('Shift', 'ShiftLeft', 16, false));
    } finally { tip.endInputTransaction?.(); }
  };
  const started = row => row?.stats?.started ?? 0;
  const speaking = (row, voice) => !!row?.controller?.ours && row.session?.playing === true && row.session.voice === voice;
  const held = async r => ({ sources:(await list(r))?.sources, stub:await stub('state', 'GET') });
  const report = {};

  if (win.windowState === 2) win.restore();
  try {
    close(A);
    close(B);
    Services.prefs.setBoolPref(P + 'readAloud.favoritesOnly', false);
    Services.prefs.setBoolPref(P + 'local.enabled', true);
    seed(A);
    seed(B);
    if (await saved(A) !== local || await saved(B) !== system) throw new Error('Test voice seeds did not read back');
    await stub('reset');
    await stub('hold-voices?mode=pass');
    const initialA = started(await engine(A));
    await select(A);
    play(A);
    const waitA = await wait(() => held(A), row => row.sources?.local === 'loading' && row.stub.held > 0);
    if (!waitA) throw new Error('Item 4 did not get A into a held wait');
    await select(B);
    if (started(await engine(A)) !== initialA) throw new Error('A started before B was played');
    play(B);
    const speakingB = await wait(() => engine(B), row => speaking(row, system));
    const beforeRelease = await held(A);
    if (!speakingB || !beforeRelease.stub.held) throw new Error('B did not start System while the earlier request was held');
    const timeBefore = speakingB.session.playbackTime;
    const released = await stub('release');
    await sleep(650);
    const stillB = await engine(B);
    const afterA = await engine(A);
    const continuedB = speaking(stillB, system) && started(stillB) === started(speakingB);
    report.item4 = { earlierWait: true, released: released.released,
      aStartedBefore: initialA, aStartedAfter: started(afterA),
      aController: !!afterA?.controller?.ours, bStillSpeaking: continuedB,
      bClockAdvanced: stillB?.session?.playbackTime > timeBefore ||
        stillB?.session?.position > speakingB.session.position };
    if (!(released.released > 0 && initialA === started(afterA) && !afterA?.controller?.ours && continuedB)) {
      report.item4.pass = false;
      return JSON.stringify(report);
    }

    await stub('reset');
    await stub('hold-voices?mode=pass');
    // Hold a real new refresh for the already open Player. Both approved
    // fixture voices remain eligible, down to B's currently speaking voice.
    Services.prefs.setStringPref(P + 'readAloud.favoriteVoices', JSON.stringify([local, system]));
    Services.prefs.setBoolPref(P + 'readAloud.favoritesOnly', true);
    await select(A);
    const openA = !!A._internalReader._state?.readAloudState?.popupOpen || !!manager(A).active;
    report.item4.aOpenBeforeReverse = openA;
    const readyForReverse = openA ? await wait(() => held(A), row =>
      row.sources?.local === 'loading' && row.stub.held > 0) : null;
    if (openA && !readyForReverse) {
      report.item4.reverseSetup = await held(A);
      throw new Error('The test refresh did not hold a new Kokoro request for A');
    }
    if (!speaking(await engine(B), system) || await saved(A) !== local) {
      throw new Error('B was no longer speaking before the new explicit Play');
    }
    if (openA) {
      const button = playerWindow(A)?.document?.querySelector('.play');
      if (!button || button.disabled) throw new Error('A had no usable Play button after its earlier wait was superseded');
      button.click();
    } else play(A);
    const secondWait = await wait(() => held(A), row => row.sources?.local === 'loading' && row.stub.held > 0);
    await wait(() => !!manager(B).paused, paused => paused, 1200);
    const pausedB = !((await engine(B))?.session?.playing) && !!manager(B).paused;
    report.item4.reverseHeld = !!secondWait;
    report.item4.bPausedBeforeRelease = pausedB;
    report.item4.aControllerBeforeRelease = !!(await engine(A))?.controller?.ours;
    if (!secondWait) {
      report.item4.reverseSetup = await held(A);
      throw new Error('Item 4 reverse request never reached the held state');
    }
    await stub('hold-voices?mode=fail');
    await stub('release');
    const failedA = await wait(() => list(A), row => row?.sources?.local === 'failed');
    const namedA = await wait(() => status(A), message => message.includes('Kokoro'));
    report.item4.aFailed = !!failedA;
    report.item4.aError = namedA;
    report.item4.bStayedPaused = !((await engine(B))?.session?.playing) && !!manager(B).paused;
    report.item4.aVoicePreserved = await saved(A) === local;
    report.item4.pass = pausedB && !report.item4.aControllerBeforeRelease && !!failedA && !!namedA &&
      report.item4.bStayedPaused && report.item4.aVoicePreserved;
    if (!report.item4.pass) return JSON.stringify(report);

    close(A);
    close(B);
    await stub('reset');
    await stub('hold-voices?mode=pass');
    Services.prefs.setStringPref(P + 'local.baseURL', stubBase);
    Services.prefs.setStringPref(P + 'readAloud.favoriteVoices', JSON.stringify([local]));
    Services.prefs.setBoolPref(P + 'readAloud.favoritesOnly', true);
    const initialFilter = started(await engine(A));
    play(A);
    const pending = await wait(() => held(A), row => row.sources?.local === 'loading' &&
      row.sources.system === 'ready' && row.stub.held > 0);
    if (!pending) throw new Error('Item 5 did not establish simultaneous System-ready and Kokoro-pending');
    const pendingSystem = providers(A).includes('system');
    await stub('hold-voices?mode=fail');
    await stub('release');
    const failed = await wait(() => list(A), row => row?.sources?.local === 'failed');
    const named = await wait(() => status(A), message => message.includes('Kokoro'));
    const failedSystem = providers(A).includes('system');
    const choices = await saved(A) === local &&
      JSON.stringify(JSON.parse(Services.prefs.getStringPref(P + 'readAloud.favoriteVoices'))) === JSON.stringify([local]);
    await stub('reset');
    await stub('hold-voices?mode=empty');
    Services.prefs.setStringPref(P + 'readAloud.favoriteVoices', JSON.stringify([local], null, 1));
    const emptyHeld = await wait(() => held(A), row => row.sources?.local === 'loading' && row.stub.held > 0);
    if (!emptyHeld) throw new Error('Item 5 empty listing refresh was not issued');
    await stub('release');
    const empty = await wait(() => list(A), row => row?.sources?.local === 'ready' && providers(A).includes('system'));
    const filterEngine = await engine(A);
    report.item5 = { pendingSystem, failedSystem, failed:!!failed, named, choicesPreserved:choices,
      emptySystem:!!empty, startsUnchanged:initialFilter === started(filterEngine),
      noController: !filterEngine?.controller?.ours, filterStillOn:Services.prefs.getBoolPref(P + 'readAloud.favoritesOnly') };
    report.item5.pass = !pendingSystem && !failedSystem && !!failed && !!named && choices && !!empty &&
      report.item5.startsUnchanged && report.item5.noController && report.item5.filterStillOn;
    if (!report.item5.pass) return JSON.stringify(report);

    close(A);
    await stub('reset');
    await stub('hold-voices?mode=pass');
    Services.prefs.setBoolPref(P + 'readAloud.favoritesOnly', false);
    const nativeState = () => [Services.prefs.prefHasUserValue(native), Services.prefs.getStringPref(native, '')];
    const previousNative = nativeState();
    if (await saved(A) !== local) throw new Error('Item 6 fixture save no longer named the permitted voice');
    play(A);
    const voiceHeld = await wait(() => held(A), row => row.sources?.local === 'loading' && row.stub.held > 0);
    if (!voiceHeld) throw new Error('Item 6 did not issue a new catalog request');
    await stub('release');
    const restoredLocal = await wait(() => engine(A), row => speaking(row, local));
    if (!restoredLocal) throw new Error('Item 6 did not restore the saved fixture voice');
    const command = async (action, value) => {
      const child = playerWindow(A);
      if (typeof child?.zttsCommand !== 'function') throw new Error('Player command transport is not available');
      await child.zttsCommand(action, value);
      await sleep(450);
    };
    await command('play');
    await command('provider', 'system');
    await command('locale', 'en-US');
    await command('voice', system);
    const chosen = await wait(() => saved(A), id => id === system);
    const unchanged = JSON.stringify(nativeState()) === JSON.stringify(previousNative);
    report.item6 = { localRestored:restoredLocal.session.voice, explicitPick:chosen,
      nativeUnchanged:unchanged, otherReaderCount:Zotero.Reader._readers.filter(row => row !== A && row !== B).length,
      handBack: 'requires dedicated disable and native reopening check' };
    report.item6.choicesPass = !!chosen && unchanged;
    return JSON.stringify(report);
  } catch (error) {
    report.rigFailure = String(error?.message ?? 'Live probe failed');
    return JSON.stringify(report);
  } finally {
    close(A);
    close(B);
    await stub('reset');
    win.minimize();
  }
})()
