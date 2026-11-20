(async () => {
  const run = Zotero.ZoteroTTSRun;
  const { root, authorizedReaderTitle, expectedVersion } = run.params;
  const kit = PathUtils.join(root, 'test', 'zotero-dev', 'scripts', 'voice-catalog');
  const P = 'extensions.zotero.zotero-tts.';
  const nativePref = 'extensions.zotero.reader.readAloudVoices';
  const addonID = 'zotero-tts@xujialiu.top';
  const nativeA = 'vc261-fixture-native-a';
  const nativeB = 'vc261-fixture-native-b';
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon = await AddonManager.getAddonByID(addonID);
  const cu = Components.utils;
  const win = Zotero.getMainWindow();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = { steps: [], handBack: null, recovery: null, owner: null };
  let captured = false;
  let owner = null;
  let ownerClosed = false;
  let fixture = null;
  let removeTransport = null;
  let stopTracingNativeLoad = null;
  let testMadeAddonInactive = false;
  const wait = async (get, accept, ms = 8000) => {
    const end = Date.now() + ms;
    do {
      const value = await get();
      if (accept(value)) return value;
      await sleep(250);
    } while (Date.now() < end);
    return null;
  };
  const runScript = async path => JSON.parse(await (0, eval)(await IOUtils.readUTF8(PathUtils.join(kit, path))));
  const startupMatches = () => {
    try {
      const s = JSON.parse(Zotero.ZoteroTTS?.diagnostics.startup() || 'null');
      return s?.version === expectedVersion && s?.failed?.length === 0;
    } catch (_) { return false; }
  };
  const isolated = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder === false;
  const liveReaders = () => Zotero.Reader._readers.filter(reader => {
    try { return !!reader._internalReader && !cu.isDeadWrapper(reader._internalReader); }
    catch (_) { return false; }
  });
  const nativeState = () => [Services.prefs.prefHasUserValue(nativePref), Services.prefs.getStringPref(nativePref, '')];
  const position = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()).readers
    .find(row => row.itemID === fixture.itemID)?.stored ?? null;
  const snapshot = async () => {
    const names = ['local.enabled','compatible.enabled','fish.enabled','system.enabled',
      'readAloud.favoritesOnly','readAloud.volume','readAloud.memory',nativePref,P+'webdav.enabled'];
    const read = name => {
      const full = name.startsWith('extensions.zotero.') ? name : P + name;
      const type = Services.prefs.getPrefType(full);
      return { user:Services.prefs.prefHasUserValue(full),
        type:type===32?'string':type===64?'int':type===128?'bool':'none',
        value:type===32?Services.prefs.getStringPref(full):type===64?Services.prefs.getIntPref(full):
          type===128?Services.prefs.getBoolPref(full):null };
    };
    const branch = Services.prefs.getBranch(P+'documentVoices.');
    const docVoices = Object.fromEntries(branch.getChildList('').map(key=>[key,read(P+'documentVoices.'+key)]));
    const saved = { prefs:Object.fromEntries(names.map(name=>[name,read(name)])),docVoices,
      winState:{before:{selectedTab:win.Zotero_Tabs.selectedID}},debug:{storing:!!Zotero.Debug.storing},
      positionRowsBaseline:JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()).database.rows };
    if (typeof saved.positionRowsBaseline!=='number') throw new Error('Position baseline unavailable');
    run.state.vc261=saved;
    return {rows:saved.positionRowsBaseline,docCount:Object.keys(docVoices).length};
  };

  try {
    if (!run.state.vc261CatalogVerified) {
      return JSON.stringify({ blocked:'Earlier Voice catalog checks did not pass' });
    }
    if (run.params.handBackFixtureTitle) run.params.fixtureTitle = run.params.handBackFixtureTitle;
    if (!addon?.isActive || !startupMatches() || !(await isolated()) || run.state.vc261) {
      throw new Error('Expected installed build, empty test snapshot and WebDAV isolation');
    }
    const readers = liveReaders();
    if (readers.length > 1) throw new Error('More than the authorized reader is open');
    if (readers.length === 1) {
      const reader = readers[0];
      const item = Zotero.Items.get(reader.itemID);
      const title = (item?.parentItem ?? item)?.getField('title');
      const tabIndex = win.Zotero_Tabs._tabs.findIndex(tab => tab.id === reader.tabID);
      if (title !== authorizedReaderTitle || tabIndex < 0 || reader._internalReader._readAloudManager?.active) {
        throw new Error('Open reader is not the authorized idle tab');
      }
      owner = { itemID:reader.itemID, tabID:reader.tabID, tabIndex,
        selected:win.Zotero_Tabs.selectedID === reader.tabID };
    }
    const baseline = await snapshot();
    captured = true;
    result.steps.push({ name:'baseline', positionRows:baseline.rows, docRecords:baseline.docCount,
      credentialPrefsExcluded:true });
    if (owner) {
      win.Zotero_Tabs.close(owner.tabID);
      ownerClosed = true;
      if (!await wait(() => liveReaders().length === 0, Boolean)) throw new Error('Authorized reader did not close');
    }

    Zotero.Debug.setStore(true);
    Services.prefs.setIntPref(P + 'readAloud.volume', 0);
    for (const key of ['local.enabled','compatible.enabled','fish.enabled','readAloud.favoritesOnly']) {
      Services.prefs.setBoolPref(P+key,false);
    }
    Services.prefs.setBoolPref(P+'system.enabled',true);
    if (win.windowState === 2) win.restore();
    const opened = await runScript('fixture-a.js');
    if (!opened.ready?.manager) throw new Error('Fixture reader did not become ready');
    const owned = run.state.vc261.fixtureA;
    fixture = liveReaders().find(reader => reader.itemID === owned.itemID);
    if (!fixture || liveReaders().some(reader => reader !== fixture)) throw new Error('A non-fixture reader is still open');
    const rw = fixture._iframeWindow;
    const internal = cu.waiveXrays(fixture._internalReader);
    const manager = cu.waiveXrays(internal._readAloudManager);
    const approved = 'system::osx/com.apple.voice.compact.en-US.Samantha';
    const listed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.defaultVoice()).rows
      .some(row => row.id === approved);
    if (!listed) throw new Error('Expected approved System voice is missing');
    const documentKey = 'user/' + owned.key;
    Services.prefs.setStringPref(P + 'documentVoices.' + documentKey,
      JSON.stringify({ voice:{id:approved,lang:'en'}, manual:true, ts:Date.now() }));
    const saved = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices()).readers
      .find(row => row.key === documentKey)?.saved?.voice?.id;
    if (saved !== approved) throw new Error('Fixture saved voice was not the approved System voice');

    const history = JSON.parse(nativeState()[1] || '{}');
    history.en = { region:'US', voice:nativeB, speed:1, tierVoices:{ standard:nativeB } };
    Services.prefs.setStringPref(nativePref, JSON.stringify(history));
    const seededNative = JSON.stringify(nativeState());
    win.Zotero_Tabs.select(fixture.tabID);
    await sleep(450);
    const tip = Components.classes['@mozilla.org/text-input-processor;1']
      .createInstance(Components.interfaces.nsITextInputProcessor);
    const event = (key, code, keyCode, shiftKey = true) => new rw.KeyboardEvent('',
      { key, code, keyCode, shiftKey, bubbles:true, cancelable:true });
    tip.beginInputTransactionForTests(rw);
    try {
      tip.keydown(event('Shift','ShiftLeft',16));
      tip.keydown(event(' ','Space',32));
      tip.keyup(event(' ','Space',32));
      tip.keyup(event('Shift','ShiftLeft',16,false));
    } finally { tip.endInputTransaction?.(); }
    const active = await wait(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers
      .find(row => row.itemID === fixture.itemID), row => row?.controller?.ours &&
        row?.session?.playing && row.session.voice === approved, 12000);
    if (!active) throw new Error('The owned plugin Player did not start the approved voice');
    // Pausing leaves the Player open for the disable and samples the held Position.
    internal.toggleReadAloudPaused(true);
    const held = await wait(position, value => !!value, 5000);
    const readyToDisable = { nonemptyPosition:!!held, popupOpen:!!internal._state.readAloudState.popupOpen,
      managerActive:!!manager.active, nativeSeedUnchanged:JSON.stringify(nativeState()) === seededNative };
    result.steps.push({ name:'disable precondition', ...readyToDisable });
    if (!Object.values(readyToDisable).every(Boolean)) throw new Error('The hand-back precondition did not settle');
    result.steps.push({ name:'fixture', systemChoice:approved, nonemptyPosition:true, pluginPlayerOpen:true,
      nativeSeedUnchanged:true });

    // Wrap the native Reader transport for the owned fixture only. Actual
    // disable, Zotero voice resolution, and reopening still run normally.
    // No account or metered audio request can come from this transport.
    const method = '_getReadAloudRemoteInterface';
    let holder = Object.getPrototypeOf(fixture);
    while (holder && !Object.getOwnPropertyDescriptor(holder, method)) holder = Object.getPrototypeOf(holder);
    const descriptor = holder && Object.getOwnPropertyDescriptor(holder, method);
    if (typeof descriptor?.value !== 'function') throw new Error('Native transport factory was not located');
    const activity = { installed:0, lists:0, audio:0 };
    const voices = {
      voices: { standard:[{ voices:{[nativeA]:{label:'Fixture native A'},[nativeB]:{label:'Fixture native B'}},
        locales:{'en-US':[nativeA,nativeB]}, segmentGranularity:'sentence', sentenceDelay:0, cacheVersion:1 }] },
      standardCreditsRemaining:null, premiumCreditsRemaining:null, devMode:false,
    };
    const wrapped = function(targetWindow) {
      const base = Reflect.apply(descriptor.value, this, [targetWindow]);
      if (this.itemID !== owned.itemID) return base;
      activity.installed++;
      const answer = value => new targetWindow.Promise(resolve => resolve(cu.cloneInto(value,targetWindow)));
      return { ...base, vc261FixtureNative:true,
        getVoices: () => { activity.lists++; return answer(voices); },
        getAudio: () => { activity.audio++; return answer({error:'network'}); },
        getCreditsRemaining: () => answer({ standardCreditsRemaining:null, premiumCreditsRemaining:null }),
        resetCredits: () => answer({ standardCreditsRemaining:null, premiumCreditsRemaining:null }),
      };
    };
    Object.defineProperty(holder,method,{ ...descriptor,value:wrapped });
    removeTransport = () => Object.defineProperty(holder,method,descriptor);
    const savedNativePosition = JSON.stringify(internal._state.readAloudState.savedPosition ?? null);

    if (liveReaders().some(reader => reader !== fixture)) throw new Error('A non-fixture reader opened before disable');
    testMadeAddonInactive = true;
    await addon.disable();
    if (!await wait(async () => (await AddonManager.getAddonByID(addonID))?.isActive === false,
        Boolean)) throw new Error('Addon disable did not settle');
    await sleep(400);
    const closed = !internal._state.readAloudState.popupOpen && !manager.active;
    const addonInactive = (await AddonManager.getAddonByID(addonID)).isActive === false;
    const noPluginFrame = !rw.document.getElementById('ztts-player-frame');
    const nativeRemote = cu.waiveXrays(manager._options.remoteInterface);
    const nativeInterface = !!nativeRemote?.vc261FixtureNative;
    const noImplicitAudio = activity.audio === 0 && !manager._controller;
    const nativeBeforeReopen = JSON.stringify(nativeState()) === seededNative;
    const nativePositionPreserved = JSON.stringify(internal._state.readAloudState.savedPosition ?? null) === savedNativePosition;
    const nativeDeactivateRestored = !Object.hasOwn(manager,'deactivate') &&
      manager.deactivate===Object.getPrototypeOf(manager).deactivate;
    result.handBack = { closed, addonInactive, noPluginFrame, nativeInterface, noImplicitAudio,
      nativeBeforeReopen, nativePositionPreserved, nativeDeactivateRestored };
    if (!(closed && addonInactive && noPluginFrame && nativeInterface && noImplicitAudio && nativeBeforeReopen)) {
      result.handBack.pass = false;
    } else {
      // Build the fixture response in the reader compartment. The native
      // chooser still awaits it and applies the real persisted choices.
      const nativeWindow = cu.waiveXrays(rw);
      nativeRemote.getVoices = Reflect.apply(nativeWindow.Function, null, [
        'this.vc261ReplayLists = (this.vc261ReplayLists || 0) + 1;' +
          'this.vc261ReplayStacks = (this.vc261ReplayStacks || []);' +
          'this.vc261ReplayStacks.push((String(new Error().stack).match(/reader\\.js:\\d+:\\d+/g)||[]).slice(0,5));' +
          'return ' + JSON.stringify(voices) + ';',
      ]);
      const reply = await Reflect.apply(nativeRemote.getVoices, nativeRemote, []);
      const replyIDs = reply?.voices?.standard?.[0]?.locales?.['en-US'];
      result.handBack.fixtureReplyContainsBoth = replyIDs?.length === 2 &&
        replyIDs[0] === nativeA && replyIDs[1] === nativeB;
      if (!result.handBack.fixtureReplyContainsBoth) throw new Error('Native transport did not return the fixture list shape');
      const trace = Reflect.apply(nativeWindow.Function,null,['manager',`
        const records = [];
        const errors = [];
        const assignments = [];
        const original = manager.loadVoices;
        const owned = Object.getOwnPropertyDescriptor(manager,'loadVoices');
        const native = Object.getPrototypeOf(manager).loadVoices;
        const methods = { own:!!owned, sameAsPrototype:original===native,
          activeIsNative:Function.prototype.toString.call(original).includes('new RemoteReadAloudProvider'),
          prototypeIsNative:Function.prototype.toString.call(native).includes('new RemoteReadAloudProvider') };
        const listDescriptor = Object.getOwnPropertyDescriptor(manager,'_allVoices');
        let currentList = manager._allVoices;
        const tracedList = !!listDescriptor?.configurable && ('value' in listDescriptor);
        if (tracedList) Object.defineProperty(manager,'_allVoices',{configurable:true,
          enumerable:listDescriptor.enumerable, get:()=>currentList,
          set:value=>{assignments.push(value?.length ?? null);currentList=value;}});
        const previousError = console.error;
        console.error = function (error, ...rest) {
          const message = String(error?.message ?? error);
          const known = ["Permission denied", "can't access property", "is not a function", "not a constructor",
            "not iterable", "can't convert", "undefined", "network", "unknown"];
          errors.push({ type:known.filter(part=>message.includes(part)),
            lines:(String(error?.stack ?? '').match(/reader\\.js:\\d+:\\d+/g) ?? []).slice(0,4) });
          return Reflect.apply(previousError,this,[error,...rest]);
        };
        manager.loadVoices = async function (remote) {
          const row = { remote:!!remote, finished:false, count:null };
          records.push(row);
          try { return await Reflect.apply(original,this,[remote]); }
          finally { row.finished=true; row.count=this._allVoices.length; }
        };
        return {
          inspect: () => JSON.stringify({methods, loads:records, assignments,errors:errors.slice(0,4)}),
          stop: () => {
            console.error=previousError;
            if (owned) Object.defineProperty(manager,'loadVoices',owned);
            else delete manager.loadVoices;
            if (tracedList) Object.defineProperty(manager,'_allVoices',{...listDescriptor,value:currentList});
          }
        };
      `]);
      const probe = cu.waiveXrays(Reflect.apply(trace,null,[manager]));
      stopTracingNativeLoad = () => probe.stop();
      // loggedIn is read by the native chooser. Set it only on this fixture
      // so the offline synthetic list is loaded even on a signed-out profile.
      if (win.windowState === 2) win.restore();
      internal._updateState(cu.cloneInto({loggedIn:true},rw));
      internal.toggleReadAloudPopup(true);
      const nativeView = () => ({popup:!!internal._state.readAloudState.popupOpen,
        mounted:!!rw.document.querySelector('.read-aloud-popup'),id:manager.selectedVoiceID,
        lang:manager.lang,loggedIn:!!internal._state.loggedIn,nativeOfferCount:manager._allVoices.length,
        fixtureListCalls:Number(nativeRemote.vc261ReplayLists||0)});
      const openedNative = await wait(nativeView,row=>row.popup&&row.mounted&&row.id===nativeB,11000);
      const ids = [];
      for (let i=0; i<manager._allVoices.length; i++) ids.push(String(manager._allVoices[i].id));
      result.handBack.trace = JSON.parse(probe.inspect());
      const methods = result.handBack.trace.methods;
      result.handBack.nativeLoaderRestored = !methods.own && methods.sameAsPrototype && methods.activeIsNative;
      stopTracingNativeLoad();
      stopTracingNativeLoad = null;
      Object.assign(result.handBack,{ reopened:!!openedNative, selected:manager.selectedVoiceID,
        offeredBoth:ids.includes(nativeA)&&ids.includes(nativeB), pluginVoicesGone:!ids.some(id=>id.includes('::')),
        stillNativePref:JSON.stringify(nativeState())===seededNative, nativeView:nativeView(),
        fixtureCallerLines:JSON.parse(JSON.stringify(nativeRemote.vc261ReplayStacks||[])),
        inheritedTransportCalls:activity.lists,
        interceptedAudioCalls:activity.audio });
      internal.toggleReadAloudPopup(false);
    }

    removeTransport();
    removeTransport = null;
    await (await AddonManager.getAddonByID(addonID)).enable();
    if (!await wait(startupMatches, Boolean, 15000)) throw new Error('Re-enabled candidate did not complete startup');
    testMadeAddonInactive = false;
    if (!(await isolated())) throw new Error('WebDAV isolation changed during enable');
    const after = await wait(position, value => !!value, 5000);
    result.handBack.pluginPositionPreserved = JSON.stringify(after) === JSON.stringify(held);
    result.handBack.pass = result.handBack.pass !== false && result.handBack.nativePositionPreserved &&
      result.handBack.nativeLoaderRestored && result.handBack.nativeDeactivateRestored &&
      result.handBack.reopened && result.handBack.offeredBoth && result.handBack.pluginVoicesGone &&
      result.handBack.stillNativePref && result.handBack.pluginPositionPreserved;
  } catch (error) {
    result.failure = String(error?.message ?? 'Hand-back operation failed').slice(0,300);
  } finally {
    try { if (stopTracingNativeLoad) stopTracingNativeLoad(); }
    catch (_) { result.traceCleanupFailed = true; }
    try { fixture?._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    try { if (removeTransport) removeTransport(); }
    catch (_) { result.transportCleanupFailed = true; }
    if (testMadeAddonInactive) {
      try {
        const current = await AddonManager.getAddonByID(addonID);
        if (!current?.isActive) await current.enable();
        if (!await wait(startupMatches, Boolean, 15000)) throw new Error('Addon did not restart');
      } catch (_) { result.reEnableFailed = true; }
    }
    if (captured && !result.reEnableFailed) {
      const view = run.state.vc261.winState.before;
      const priorSelected = view.selectedTab;
      if (ownerClosed && owner?.selected) view.selectedTab = null;
      try { result.recovery = await runScript('restore.js'); }
      catch (_) { result.recovery = {restored:false,reason:'Profile restore script failed'}; }
      finally { view.selectedTab = priorSelected; }
    }
    if (ownerClosed && owner) {
      try {
        if (win.windowState===2) win.restore();
        await Zotero.Reader.open(owner.itemID, null,
          {tabIndex:owner.tabIndex,openInBackground:false});
        const reopened = await wait(() => liveReaders().find(reader => reader.itemID === owner.itemID),
          reader => !!reader?.tabID, 15000);
        const desiredTab=owner.selected ? reopened?.tabID : run.state.vc261?.winState?.before?.selectedTab;
        if (desiredTab) win.Zotero_Tabs.select(desiredTab);
        result.owner = { closed:true, reopened:!!reopened,
          tabIndexRestored:win.Zotero_Tabs._tabs.findIndex(tab=>tab.id===reopened?.tabID)===owner.tabIndex,
          selectedRestored:desiredTab===win.Zotero_Tabs.selectedID,
          playerIdle:!!reopened && !reopened._internalReader._readAloudManager?.active };
      } catch (error) { result.owner = {closed:true,reopened:false, errorName:error?.name??null}; }
    }
    try { if (win.windowState !== 2) win.minimize(); } catch (_) {}
    result.finalWindowMinimized = !!await wait(() => win.windowState === 2, Boolean, 2500);
    if (result.recovery?.restored) {
      delete run.state.vc261;
      result.privateSnapshotCleared = true;
    }
  }
  return JSON.stringify(result);
})()
