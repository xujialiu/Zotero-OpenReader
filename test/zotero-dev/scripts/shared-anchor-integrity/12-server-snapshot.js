// The test folder's two files, byte for byte, as found: GET both (the plugin's
// own zotero-tts-positions.json and the Positions File xujialiu-positions.json)
// from inside Zotero with the configured credentials; exact text kept in state
// and on disk under the run's results dir. Only status, sizes, a SHA-256 and
// id/ts summaries return — never a value or a credential. Existence recorded:
// a file this run creates must be removed again at cleanup, one it found must
// be restored byte-identically.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  state.serverSnapshotsVerified = false;
  if (url.replace(/\/+$/, '') !== String(state.testUrl).replace(/\/+$/, '') || JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder !== false) throw new Error('test destination/folder isolation missing');
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const digest = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const grab = async (name) => {
    const r = await fetch(url + name, { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    const text = r.status === 200 ? await r.text() : null;
    return { status: r.status, text };
  };

  const native = await grab('zotero-tts-positions.json');
  out.native = { status: native.status, existed: native.text !== null, bytes: native.text === null ? null : native.text.length };
  state.nativeFileBefore = native.text;
  if (native.text !== null) {
    out.native.sha256 = await digest(native.text);
    const parsed = JSON.parse(native.text);
    out.native.itemCount = parsed.items.length;
  }
  const shared = await grab('xujialiu-positions.json');
  out.shared = { status: shared.status, existed: shared.text !== null, bytes: shared.text === null ? null : shared.text.length };
  state.sharedFileBefore = shared.text;
  if (shared.text !== null) {
    out.shared.sha256 = await digest(shared.text);
    const parsed = JSON.parse(shared.text);
    out.shared.format = parsed.format;
    out.shared.itemCount = parsed.items.length;
    out.shared.fixtureDocItems = parsed.items.filter((i) => i.id === state.fixtureDocId).length;
  }

  if (native.status !== 200 || shared.status !== 200 || out.shared.fixtureDocItems !== 0) throw new Error('both files must exist and the fixture must be absent');
  try {
    const dir = P.tmpDir + '/' + P.runId;
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    if (native.text !== null) await IOUtils.writeUTF8(dir + '/native-before.json', native.text);
    if (shared.text !== null) await IOUtils.writeUTF8(dir + '/shared-before.json', shared.text);
    out.stashedTo = dir;
  } catch (e) { throw new Error('could not retain server snapshots'); }
  state.serverSnapshotsVerified = true;
  out.isolation = { destinationMatchesTestFile: true };
  return JSON.stringify(out, null, 1);
})()
