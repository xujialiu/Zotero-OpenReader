// The test folder's two files, byte for byte, as found: GET both (the plugin's
// own zotero-tts-positions.json and the Positions File xujialiu-positions.json)
// from inside Zotero with the configured credentials, keep the exact text in
// state and on disk under .tmp, and return only sizes, a SHA-256 and a summary
// by entry id / lib+key and ts — never a value or a credential.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const p = Zotero.ZoteroTTSRun.params;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
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
  out.native = { status: native.status, bytes: native.text === null ? null : native.text.length };
  state.nativeFileBefore = native.text;
  if (native.text !== null) {
    out.native.sha256 = await digest(native.text);
    const parsed = JSON.parse(native.text);
    out.native.format = parsed.format; out.native.version = parsed.version;
    out.native.items = parsed.items.map((i) => ({ id: (i.lib + '/' + i.key), ts: i.ts }));
  }
  const shared = await grab('xujialiu-positions.json');
  out.shared = { status: shared.status, bytes: shared.text === null ? null : shared.text.length };
  state.sharedFileBefore = shared.text;
  if (shared.text !== null) {
    out.shared.sha256 = await digest(shared.text);
    const parsed = JSON.parse(shared.text);
    out.shared.format = parsed.format; out.shared.version = parsed.version;
    out.shared.items = parsed.items.map((i) => ({ id: String(i.id).slice(0, 12) + '…', device: i.stamp?.device, at: i.stamp?.at }));
  }
  // Also to disk, in the run's results dir.
  try {
    const dir = p.tmpDir + '/' + p.runId;
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    if (native.text !== null) await IOUtils.writeUTF8(dir + '/native-before.json', native.text);
    if (shared.text !== null) await IOUtils.writeUTF8(dir + '/shared-before.json', shared.text);
    out.stashedTo = dir;
  } catch (e) { out.stashError = String(e); }
  out.isolation = { destinationMatchesTestFile: state.testWebdav?.destinationMatched === true };
  return JSON.stringify(out);
})()
