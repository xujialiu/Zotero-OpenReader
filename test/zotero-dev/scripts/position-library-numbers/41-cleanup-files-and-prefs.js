// The cleanup gate, second half: the test folder's two files back to the
// as-found bytes (read from the run's own stashes on disk), verified by
// SHA-256 against the recorded as-found hashes, with no fixture key in either;
// the prefs audited against the run baseline (values and user-value presence);
// the isolation switches as found; a final read of both files after a settle.
(async () => {
  const out = {};
  const s = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const sp = Services.prefs;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = Zotero.ZoteroTTS.diagnostics;
  const digest = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');

  // The as-found bytes from disk.
  const dir = p.tmpDir + '/' + p.runId;
  const nativeBefore = await IOUtils.readUTF8(dir + '/native-before.json');
  const sharedBefore = await IOUtils.readUTF8(dir + '/shared-before.json');
  out.nativeShaOnDisk = await digest(nativeBefore);
  out.sharedShaOnDisk = await digest(sharedBefore);

  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const putBack = async (name, body) => {
    const put = await fetch(url + name, { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
    const g = await fetch(url + name, { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    const back = await g.text();
    return { putStatus: put.status, sha: await digest(back), bytes: back.length, fixtureKeyPresent: back.includes('"key":"' + s.fixture.key + '"') || back.includes(s.fixture.key) };
  };
  out.native = await putBack('zotero-tts-positions.json', nativeBefore);
  out.shared = await putBack('xujialiu-positions.json', sharedBefore);
  out.nativeBackAsFound = out.native.sha === out.nativeShaOnDisk;
  out.sharedBackAsFound = out.shared.sha === out.sharedShaOnDisk;
  // The on-disk stashes ARE the as-found bytes, so the on-disk sha is the truth.
  out.noFixtureKeyInFiles = !out.native.fixtureKeyPresent && !out.shared.fixtureKeyPresent;

  // Settle, then one final read of both.
  await sleep(2500);
  const g2n = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const g2s = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.finalNativeSha = await digest(await g2n.text());
  out.finalSharedSha = await digest(await g2s.text());
  out.finalStable = out.finalNativeSha === out.nativeShaOnDisk && out.finalSharedSha === out.sharedShaOnDisk;

  // Prefs vs the run baseline: values and user-value presence.
  const names = ['webdav.enabled', 'webdav.url', 'webdav.username', 'webdav.password', 'webdav.machineId', 'webdav.syncState', 'webdav.autoUploadSettings', 'webdav.syncPositions', 'webdav.syncSettings', 'readAloud.volume', 'readAloud.memory', 'readAloud.defaultVoice', 'reader.readAloudVoices'];
  const full = (n) => (n === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : 'extensions.zotero.zotero-tts.' + n);
  const read = (n) => {
    const key = full(n), type = sp.getPrefType(key), user = sp.prefHasUserValue(key);
    let value = null;
    try {
      if (type === sp.PREF_BOOL) value = sp.getBoolPref(key);
      else if (type === sp.PREF_INT) value = sp.getIntPref(key);
      else if (type === sp.PREF_STRING) value = sp.getStringPref(key);
    } catch {}
    return { user, value };
  };
  const mask = (n, v) => (n === 'webdav.password' || n === 'webdav.username')
    ? { user: v.user, set: typeof v.value === 'string' && v.value.length > 0, chars: typeof v.value === 'string' ? v.value.length : 0 }
    : { user: v.user, value: v.value };
  const audit = {};
  let allMatch = true;
  for (const n of names) {
    const now = read(n), base = s.baseline?.prefs?.[n];
    const eq = !!base && base.user === now.user && JSON.stringify(base.value) === JSON.stringify(now.value);
    if (!eq) allMatch = false;
    audit[n] = { matchesBaseline: eq, now: mask(n, now) };
  }
  out.prefsMatchBaseline = allMatch;
  out.prefsAudit = audit;
  out.strayRootPrefGone = !sp.prefHasUserValue('zotero-tts.webdav.syncPositions');

  // Local counts one more time (memory reloaded by the reinstall).
  const sync = JSON.parse(await d.positionSync());
  const position = JSON.parse(await d.position());
  out.localCounts = { rows: position.database?.rows, localEntries: sync.localEntries, tombstones: sync.tombstones, documents: sync.shared?.documents?.documents, sharedItems: sync.shared?.documents?.items };
  out.localMatchesBaseline = out.localCounts.rows === 75 && out.localCounts.localEntries === 75 && out.localCounts.tombstones === 187 && out.localCounts.documents === 93 && out.localCounts.sharedItems === 15;
  out.switchesSuspendedStill = ['extensions.zotero.zotero-tts.webdav.syncPositions', 'extensions.zotero.zotero-tts.webdav.syncSettings', 'extensions.zotero.zotero-tts.webdav.autoUploadSettings'].every((k) => sp.getBoolPref(k) === false);
  out.transportsQuiet = !sync.transport?.running && !sync.shared?.transport?.running;
  return JSON.stringify(out);
})()
