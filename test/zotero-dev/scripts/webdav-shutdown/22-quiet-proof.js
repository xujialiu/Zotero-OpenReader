// Item 2 (issue #220), the quiet proof, run by the harness ~3.5 minutes after
// the disable: the stub log must hold nothing after the shutdown's entries.
// The plugin is disabled here, so this is chrome scope only — no plugin
// diagnostics. Reports the whole segment verbatim.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const out = { step: 'quiet-proof' };
  const AM = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;
  try {
    const lines = (await IOUtils.readUTF8(P.stubLog)).trim().split('\n').filter(Boolean);
    const fresh = lines.slice(state.stubLogCount2 ?? 0).map((l) => JSON.parse(l));
    out.segment = fresh.map((e) => ({ t: e.t, iso: e.iso, method: e.method, file: e.path.split('/').pop() }));
    out.entriesSinceDisable = fresh.length;
    const shutdownPart = fresh.slice(0, 2);
    out.shutdownEntries = shutdownPart.map((e) => ({ iso: e.iso, method: e.method, file: e.path.split('/').pop() }));
    const afterShutdown = fresh.slice(2);
    out.entriesAfterShutdown = afterShutdown.length;
    out.after = afterShutdown.map((e) => ({ iso: e.iso, method: e.method, file: e.path.split('/').pop() }));
    const me = await AM.getAddonByID('zotero-tts@xujialiu.top');
    out.addonDisabled = me ? me.userDisabled : null;
    out.ok = out.addonDisabled === true && afterShutdown.length === 0 && fresh.length >= 2;
  } catch (e) {
    out.error = (e && e.message ? e.message + ' | ' : '') + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
  }
  return JSON.stringify(out);
})()
