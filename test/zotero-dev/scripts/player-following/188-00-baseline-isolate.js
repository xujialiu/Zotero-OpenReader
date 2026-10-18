// 188-00 — baseline: private pref snapshot, mute, memory seed, WebDAV off (player-following §7, issue #188).
// Reads: named prefs only (full names), the documentVoices.<lib>/<key> branch (voice ids, no secrets).
// State it touches: readAloud.volume -> 0, system.enabled -> true, readAloud.memory -> a listed macOS voice,
// webdav.enabled -> false (kept off). Restoration is the run's final restore script; this one only records.
(async () => {
  const out = { steps: {} };
  const step = (name, fn) => { try { out.steps[name] = fn(); } catch (e) { out.steps[name] = 'error: ' + String(e); } };
  const S = Zotero.ZoteroTTSRun.state;
  const full = (name) => 'extensions.zotero.' + name;

  // ---- WebDAV: absorb the snapshot taken before the install, keep the folder off ----
  step('webdav', () => {
    if (!S.webdav) {
      const manual = globalThis.__zttsWebdavSnap;
      // prefs.js at 17:20 (before any change) held no webdav.enabled line: the value was the
      // default (false) with no user flag. The earlier manual read used the relative name with
      // `true`, which reads undefined (the pitfall) — the on-disk evidence corrects it.
      S.webdav = manual && typeof manual.value === 'boolean' ? manual : { value: false, hadUser: false };
    }
    Zotero.Prefs.set('zotero-tts.webdav.enabled', false);
    return { snapshotted: true, hadUser: S.webdav.hadUser };
  });

  // ---- Named pref snapshot (value + user-value flag); secrets stored raw in state, masked here ----
  const NAMES = [
    'readAloud.volume', 'readAloud.memory', 'readAloud.defaultAutoScroll', 'readAloud.autoScrollMode',
    'readAloud.readingLine', 'readAloud.speedPercent', 'readAloud.defaultVoice', 'readAloud.favoriteVoices',
    'readAloud.playerLayout', 'system.enabled',
    'compatible.enabled', 'compatible.baseURL', 'compatible.apiKey', 'compatible.model', 'compatible.voices', 'compatible.headers',
    'shortcuts.speedUp', 'shortcuts.speedDown',
  ];
  step('prefs', () => {
    const snap = {};
    const masked = {};
    const SECRET = /apiKey|headers|password/;
    for (const name of NAMES) {
      const f = full(name);
      let value;
      try { value = Zotero.Prefs.get(name, true); } catch (e) { value = undefined; }
      snap[name] = { value: value === undefined ? null : value, hadUser: Services.prefs.prefHasUserValue(f) };
      masked[name] = SECRET.test(name)
        ? (typeof value === 'string' && value ? 'set(' + value.length + ')' : 'empty')
        : (value === undefined ? null : value);
    }
    // Zotero's own per-language voice/speed map (selectTier persists here)
    const rav = Zotero.Prefs.get('extensions.zotero.reader.readAloudVoices', true);
    snap['reader.readAloudVoices'] = { value: rav === undefined ? null : rav, hadUser: Services.prefs.prefHasUserValue('extensions.zotero.reader.readAloudVoices') };
    masked['reader.readAloudVoices'] = rav === undefined ? null : String(rav).length + ' chars';
    // documentVoices branch: names + values (voice ids, not secrets), restore byte-identically
    const dvBranch = Services.prefs.getBranch('extensions.zotero.zotero-tts.documentVoices.');
    const dvKeys = dvBranch.getChildList('');
    snap.documentVoices = {};
    for (const k of dvKeys) snap.documentVoices[k] = dvBranch.getStringPref(k);
    S.fix4Prefs = snap;
    return { names: NAMES.length, documentVoices: Object.keys(snap.documentVoices).length, readerReadAloudVoices: !!rav };
  });

  // ---- Mute ----
  step('mute', () => {
    const before = S.fix4Prefs['readAloud.volume'];
    Zotero.Prefs.set('zotero-tts.readAloud.volume', 0);
    return { original: before.value, hadUser: before.hadUser, now: Zotero.Prefs.get('zotero-tts.readAloud.volume', true) };
  });

  // ---- Memory seed: a listed free voice (System, macOS, offline) ----
  step('memorySeed', () => {
    const sys = S.fix4Prefs['system.enabled'];
    Zotero.Prefs.set('zotero-tts.system.enabled', true);
    const want = ['com.apple.speech.synthesis.voice.Samantha', 'com.apple.speech.synthesis.voice.Albert', 'com.apple.voice.compact.en-US.Samantha'];
    // The list is async (diagnostics.systemProvider); the seed only needs the id shape the player files it under.
    const id = 'system::osx/' + want[0];
    const memory = JSON.stringify({ voice: { id, lang: 'en-US' } });
    Zotero.Prefs.set('zotero-tts.readAloud.memory', memory);
    S.memorySeed = id;
    return { systemWas: { value: sys.value, hadUser: sys.hadUser }, seeded: id };
  });

  // ---- Confirm isolation ----
  step('confirm', () => 'inline');
  try {
    const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    out.steps.confirm = { folder: ps.folder, syncPositions: ps.enabled };
  } catch (e) { out.steps.confirm = 'error: ' + String(e); }
  return JSON.stringify(out);
})()
