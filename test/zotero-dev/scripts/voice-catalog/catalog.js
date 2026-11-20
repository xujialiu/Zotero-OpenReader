(async () => {
  const runner = Zotero.ZoteroTTSRun;
  const { root, stubBase, expectedVersion } = runner.params;
  const P = 'extensions.zotero.zotero-tts.';
  const kit = PathUtils.join(root, 'test', 'zotero-dev', 'scripts', 'voice-catalog');
  const result = { stages: [], core: null, probes: null, remaining: null, recovery: null, pausedPlayersClosed: [] };
  delete runner.state.vc261CatalogVerified;
  if (stubBase !== 'http://127.0.0.1:8973') {
    return JSON.stringify({ failure: 'Expected the Voice catalog loopback fixture' });
  }
  let captured = false;
  let originalHeaders = null;
  const runScript = async path => JSON.parse(await (0, eval)(await IOUtils.readUTF8(PathUtils.join(kit, path))));
  const stub = async (path, method = 'GET') => {
    const response = await fetch(stubBase + '/control/' + path, { method });
    if (!response.ok) throw new Error('Loopback fixture control failed');
    return response;
  };
  try {
    const isolated = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder === false;
    const starting = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    if (!isolated) throw new Error('WebDAV isolation is not in effect');
    if (runner.state.vc261) throw new Error('An earlier Voice catalog snapshot still requires recovery');
    if (starting.version !== expectedVersion || starting.failed?.length !== 0) {
      throw new Error('Candidate startup identity did not match');
    }
    if (Services.prefs.getStringPref(P + 'local.baseURL', '') === stubBase) {
      throw new Error('A temporary Kokoro address was already set or the stub is not loopback');
    }
    const initialStub = await (await stub('state')).json();
    if (initialStub.sawCredentialLikeHeader || initialStub.held || initialStub.voicesTotal) {
      throw new Error('Loopback fixture was not fresh');
    }
    const pausedPlayers = [];
    for (const reader of Zotero.Reader._readers) {
      const internal = reader._internalReader;
      if (!internal || Components.utils.isDeadWrapper(internal)) continue;
      const manager = internal._readAloudManager;
      if (!manager?.active) continue;
      if (!manager.paused) throw new Error('A non-fixture document is actively reading');
      pausedPlayers.push(reader);
    }
    for (const reader of pausedPlayers) {
      const item = Zotero.Items.get(reader.itemID);
      const title = (item?.parentItem ?? item)?.getField('title') || 'Untitled reader';
      reader._internalReader.toggleReadAloudPopup(false);
      result.pausedPlayersClosed.push(title);
    }
    const headersPref = P+'local.headers';
    originalHeaders = { user:Services.prefs.prefHasUserValue(headersPref),
      value:Services.prefs.getStringPref(headersPref,'') };
    runner.state.vc261 = {};
    const baseline = await runScript('baseline.js');
    captured = baseline.snapshotInState && typeof baseline.positionRows === 'number';
    if (!captured) throw new Error('Private baseline was not captured');
    result.stages.push({ stage:'baseline', posRows:baseline.positionRows, version:starting.version,
      docRecords:baseline.documentVoiceKeys, webdav:baseline.webdav });
    Zotero.Debug.setStore(true);
    Services.prefs.setIntPref(P + 'readAloud.volume', 0);
    const settings = await runScript('isolate.js');
    if (settings.offWhileRepoint || settings.baseURLNow !== stubBase || settings.headersLenNow !== 0 ||
        JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder !== false) {
      throw new Error('Expected credential-free loopback configuration did not take effect');
    }
    result.stages.push({ stage:'isolation', loopback:true, headersEmpty:true, folder:false, muted:true });
    await runScript('fixture-a.js');
    await runScript('fixture-b.js');
    const planted = await runScript('seed-system.js');
    if (!planted.fixtures?.fixtureA?.matchesChosen || !planted.fixtures?.fixtureB?.matchesChosen) {
      throw new Error('Fixture Document voice setup not confirmed');
    }
    result.stages.push({ stage:'fixture ignition', savedVoicesProven:true });
    result.core = await runScript('probe-ready-start-close.js');
    if (result.core.item1?.pass && result.core.item2Start?.pass && result.core.item3Close?.pass) {
      result.probes = await runScript('probe-02-03.js');
    }
    if (result.probes?.item2?.pass && result.probes.item3?.pass) {
      result.remaining = await runScript('probe-04-06.js');
    }
  } catch (error) {
    const message = String(error?.message ?? 'Live operation failed');
    result.failure = message.length <= 300 ? message : 'Live operation failed with a long diagnostic';
  } finally {
    if (captured) {
      try {
        // Keep the credential in this call's lexical scope. Restore while
        // Kokoro is off, before the general recovery restores its switch.
        const headersPref = P+'local.headers';
        Services.prefs.setBoolPref(P+'local.enabled',false);
        const originalBase = runner.state.vc261.prefs['local.baseURL'];
        if (originalBase.user) Services.prefs.setStringPref(P+'local.baseURL',originalBase.value);
        else if (Services.prefs.prefHasUserValue(P+'local.baseURL')) Services.prefs.clearUserPref(P+'local.baseURL');
        if (originalHeaders.user) Services.prefs.setStringPref(headersPref,originalHeaders.value);
        else if (Services.prefs.prefHasUserValue(headersPref)) Services.prefs.clearUserPref(headersPref);
        result.recovery = await runScript('restore.js');
        result.recovery.headersRestored = Services.prefs.prefHasUserValue(headersPref) === originalHeaders.user &&
          Services.prefs.getStringPref(headersPref,'') === originalHeaders.value;
        result.recovery.restored = result.recovery.restored && result.recovery.headersRestored;
      }
      catch (_) { result.recovery = { restored:false, reason:'Recovery script failed' }; }
      if (result.recovery.restored) {
        delete runner.state.vc261;
        result.privateSnapshotCleared = true;
      }
    }
    try {
      result.stub = await (await stub('state')).json();
      await stub('stop', 'POST');
      result.stubStopAccepted = true;
    } catch (_) { result.stubStopAccepted = false; }
  }
  result.fullCatalogPass = result.recovery?.restored === true && result.core?.item1?.pass === true &&
    result.core.item2Start?.pass === true && result.core.item3Close?.pass === true &&
    result.probes?.item2?.pass === true && result.probes?.item3?.pass === true &&
    result.remaining?.item4?.pass === true && result.remaining?.item5?.pass === true &&
    result.remaining?.item6?.choicesPass === true;
  runner.state.vc261CatalogVerified = result.fullCatalogPass;
  return JSON.stringify(result);
})()
