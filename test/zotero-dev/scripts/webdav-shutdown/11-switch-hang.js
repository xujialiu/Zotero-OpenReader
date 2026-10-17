// Item 1 (issue #219), the switch: puts the stub in hang mode (control
// request, never logged) and records the log length the shutdown's entries
// will follow. The reinstall itself is the harness's zotero_plugin_install
// call, right after this script.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'switch-to-hang' };
  try {
    const req = await Zotero.HTTP.request('GET', `http://127.0.0.1:${P.stubPort}/__control?mode=hang`, { timeout: 3000 });
    out.control = JSON.parse(req.responseText);
    const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean);
    state.stubLogCount = lines.length;
    out.logCountAtHang = lines.length;
    out.ok = out.control.mode === 'hang';
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
