(async () => {
  const P = 'extensions.zotero.zotero-tts.';
  const state = Zotero.ZoteroTTSRun.state.vc261;
  const fixture = state.fixtureA;
  const key = state.fixtureAVoice?.recordKey;
  const stub = state.localRun?.stubBase;
  const localVoice = 'local::af_sample';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const win = Zotero.getMainWindow();
  const readers = Zotero.Reader._readers;
  const reader = readers.find(row => row.itemID === fixture?.itemID);
  if (!reader || key !== 'user/' + fixture.key || stub !== 'http://127.0.0.1:8973' ||
      Services.prefs.getStringPref(P + 'local.baseURL') !== stub ||
      Services.prefs.getStringPref(P + 'local.headers') !== '' ||
      JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder !== false) {
    throw new Error('Fixture key, credential-free destination, or WebDAV isolation failed');
  }
  const ir = reader._internalReader;
  const rw = reader._iframeWindow;
  const callStub = async (path, method = 'POST') => {
    const response = await fetch(stub + '/control/' + path, { method });
    if (!response.ok) throw new Error('Stub control failed: ' + path);
    return response.json();
  };
  const catalog = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList())[
    Zotero.Reader._readers.indexOf(reader)];
  const engine = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers
    .find(row => row.itemID === fixture.itemID);
  const savedVoice = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices())
    .readers.find(row => row.key === key)?.saved?.voice?.id;
  const player = () => {
    const frame = rw.document.getElementById('ztts-player-frame');
    const doc = frame && Components.utils.waiveXrays(frame.contentDocument);
    const play = doc?.querySelector('.play');
    return { title: play?.title ?? null, aria: play?.getAttribute('aria-label') ?? null,
      disabled: play?.disabled ?? null };
  };
  const waitFor = async (read, accept, duration) => {
    const end = Date.now() + duration;
    do {
      const observed = await read();
      if (accept(observed)) return observed;
      await sleep(250);
    } while (Date.now() < end);
    return null;
  };
  const pressPlay = () => {
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

  const report = {};
  if (win.windowState === 2) win.restore();
  win.Zotero_Tabs.select(reader.tabID);
  await sleep(500);
  try {
    ir.toggleReadAloudPopup(false);
    await callStub('reset');
    await callStub('hold-voices?mode=pass');
    Services.prefs.setStringPref(P + 'documentVoices.' + key,
      JSON.stringify({ voice: { id: localVoice, lang: 'en' }, manual: true, ts: Date.now() }));
    Services.prefs.setBoolPref(P + 'readAloud.favoritesOnly', false);
    Services.prefs.setBoolPref(P + 'local.enabled', true);
    report.seededVoice = await savedVoice();
    const initial = await engine();
    if (report.seededVoice !== localVoice || initial?.controller?.ours || initial?.session?.playing) {
      throw new Error('Seeded fixture voice or idle reading precondition failed');
    }

    const expectTitle = 'Loading voices from Kokoro…';
    pressPlay();
    const held = await waitFor(async () => ({ listing: (await catalog())?.sources?.local,
      requests: await callStub('state', 'GET'), player: player(), engine: await engine() }),
    row => row.listing === 'loading' && row.requests.held > 0, 6000);
    if (!held) throw new Error('No confirmed held Kokoro listing for the fixture');
    let observed = held.player;
    for (let attempt = 0; attempt < 12 && observed.title !== expectTitle; attempt++) {
      await sleep(250);
      observed = player();
    }
    const afterLabel = await engine();
    const loading = (await catalog())?.sources?.local === 'loading' &&
      (await callStub('state', 'GET')).held > 0;
    report.item2 = { actual: observed, loading, noController: !afterLabel?.controller?.ours,
      noReading: !afterLabel?.session?.playing, expected: expectTitle };
    report.item2.pass = loading && report.item2.noController && report.item2.noReading &&
      observed.title === expectTitle && observed.aria === expectTitle && observed.disabled === true;
    if (!report.item2.pass) return JSON.stringify(report);

    const failed = await waitFor(catalog, row => row?.sources?.local === 'failed', 19000);
    if (!failed || await savedVoice() !== localVoice) throw new Error('Timeout setup did not settle');
    const beforeRefresh = await engine();
    await callStub('reset');
    await callStub('hold-voices?mode=pass');
    Services.prefs.setStringPref(P + 'readAloud.favoriteVoices', JSON.stringify([localVoice]));
    // One actual settings notification while the Player stays open. Retry on
    // an idle Player starts a new Play, so it cannot serve as this refresh.
    Services.prefs.setBoolPref(P + 'readAloud.favoritesOnly', true);
    const fresh = await waitFor(async () => ({ listing: (await catalog())?.sources?.local,
      requests: await callStub('state', 'GET') }),
    row => row.listing === 'loading' && row.requests.held > 0, 7000);
    if (!fresh) throw new Error('Refresh did not issue a new Kokoro listing');
    await callStub('release');
    const ready = await waitFor(catalog, row => row?.sources?.local === 'ready' && row.offered > 0, 8000);
    await sleep(1000);
    const refreshed = await engine();
    const requests = await callStub('state', 'GET');
    report.item3 = { localReady: !!ready, offered: ready?.offered ?? 0,
      before: beforeRefresh?.stats?.started, after: refreshed?.stats?.started,
      noController: !refreshed?.controller?.ours, noReading: !refreshed?.session?.playing,
      savedVoice: await savedVoice(), requests };
    report.item3.pass = report.item3.localReady && requests.voicesReleased > 0 &&
      requests.sawCredentialLikeHeader === false && Number.isInteger(report.item3.before) &&
      report.item3.before === report.item3.after && report.item3.noController &&
      report.item3.noReading && report.item3.savedVoice === localVoice;
    return JSON.stringify(report);
  } finally {
    ir.toggleReadAloudPopup(false);
    await callStub('reset');
    win.minimize();
  }
})()
