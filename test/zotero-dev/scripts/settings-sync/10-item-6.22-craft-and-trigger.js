// Item 6.22 (issue #184), first half: a Fish Speech server at a local address
// stays on each computer. Requires fishspeech.baseURL at its default
// http://localhost:8080 (00b set it; restored at cleanup). Writes a
// held.fishspeech record into webdav.syncState (plus a held.zotero-standard
// record as the "any other provider" witness), crafts file items
// fishspeech.baseURL http://192.168.1.50:8080 and fishspeech.enabled true at
// Date.now()+1000 by "tester", fires a switch-on trigger, and reads the sync,
// the prefs, lastApplied and the held records. Second half: 11-*. State:
// S.item622.
(async () => {
  const out = { step: 'item-6.22-craft-and-trigger' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, stepMs = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = false;
      try { value = await test(); } catch (_) { value = false; }
      if (value) return value;
      await sleep(stepMs);
    }
    return test();
  };
  const trimSlash = (value) => { let s = String(value); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
  try {
    // --- Quiet transport. ---
    const quiet = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      return s.transport && s.transport.running === false && s.transport.pendingChange === false;
    });
    if (!quiet) throw new Error('transport did not go quiet');

    // --- Before: prefs, held records, lastApplied. ---
    const before = {
      baseURL: p.getStringPref(prefix + 'fishspeech.baseURL'),
      enabled: p.getBoolPref(prefix + 'fishspeech.enabled'),
      headersChars: p.getStringPref(prefix + 'fishspeech.headers').length,
    };
    out.before = before;
    if (before.baseURL !== 'http://localhost:8080') throw new Error('fishspeech.baseURL is not at the default Address');
    const stateBefore = JSON.parse(await diagnostics.settingsSync());
    out.heldSections = stateBefore.heldSections;
    const lastAppliedBefore = JSON.stringify(stateBefore.transport.lastApplied);
    const syncsBefore = stateBefore.transport.syncs;

    // --- held records into webdav.syncState. ---
    const stateKey = prefix + 'webdav.syncState';
    const raw = JSON.parse(p.getStringPref(stateKey));
    raw.held = raw.held || {};
    raw.held.fishspeech = { ts: Date.now(), reason: 'tester' };
    raw.held['zotero-standard'] = { ts: Date.now(), reason: 'tester' };
    p.setStringPref(stateKey, JSON.stringify(raw));
    const heldWritten = JSON.parse(p.getStringPref(stateKey)).held;
    out.heldWritten = Object.keys(heldWritten).sort();

    // --- Craft the two file items by "tester". ---
    const cfg = { url: p.getStringPref(prefix + 'webdav.url'), username: p.getStringPref(prefix + 'webdav.username'), password: p.getStringPref(prefix + 'webdav.password') };
    const auth = cfg.username ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.username}:${cfg.password}`))) } : {};
    const fileUrl = trimSlash(cfg.url) + '/zotero-tts-shared-settings.json';
    const getResp = await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } });
    if (!getResp.ok) throw new Error(`file GET ${getResp.status}`);
    const doc = JSON.parse(await getResp.text());
    const ts = Date.now() + 1000;
    S.item622 = { craftedTs: ts };
    const keep = doc.items.filter((i) => !(i.key === 'fishspeech.baseURL' || i.key === 'fishspeech.enabled'));
    keep.push({ key: 'fishspeech.baseURL', value: 'http://192.168.1.50:8080', ts, by: 'tester' });
    keep.push({ key: 'fishspeech.enabled', value: true, ts, by: 'tester' });
    doc.items = keep.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const putResp = await fetch(fileUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    if (!putResp.ok) throw new Error(`file PUT ${putResp.status}`);
    out.crafted = { ts, items: ['fishspeech.baseURL', 'fishspeech.enabled'], putOk: true };

    // --- The trigger: the sync switch off and on again. ---
    p.setBoolPref(prefix + 'webdav.syncSettings', false);
    p.setBoolPref(prefix + 'webdav.syncSettings', true);
    const done = await waitFor(async () => {
      const s = JSON.parse(await diagnostics.settingsSync());
      const t = s.transport;
      return t && t.syncs > syncsBefore && t.running === false && (t.lastTrigger === 'switch-on' || t.lastTrigger === 'change');
    }, 20000, 150);
    const after = JSON.parse(await diagnostics.settingsSync());
    const t = after.transport;
    out.trigger = { waited: !!done, lastTrigger: t.lastTrigger, lastOutcome: t.lastOutcome, adopted: t.adopted, deferred: t.deferred, pushed: t.pushed, uploaded: t.uploaded };
    out.fishspeechPrefsAfter = {
      baseURL: p.getStringPref(prefix + 'fishspeech.baseURL'),
      enabled: p.getBoolPref(prefix + 'fishspeech.enabled'),
    };
    out.lastAppliedUnchanged = JSON.stringify(t.lastApplied) === lastAppliedBefore;
    const heldAfter = JSON.parse(p.getStringPref(stateKey)).held;
    out.heldAfter = heldAfter;
    out.fishspeechRecordGone = !heldAfter.fishspeech;
    out.otherRecordKept = !!heldAfter['zotero-standard'];
    out.status = out.trigger.adopted === 0 && out.trigger.deferred === 0
      && out.fishspeechPrefsAfter.baseURL === 'http://localhost:8080' && out.fishspeechPrefsAfter.enabled === false
      && out.lastAppliedUnchanged && out.fishspeechRecordGone && out.otherRecordKept ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
