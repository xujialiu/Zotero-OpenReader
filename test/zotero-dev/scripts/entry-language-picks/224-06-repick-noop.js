// Issue #224 case item 3.3 (entry half): picking the entry the Player already
// shows changes nothing — no notice, handoff.draft as it was, no menu opens.
// State: the draft { system, locale null } from item 3.2 with the language menu
// open by itself. That menu is closed on its own button first, then the entry
// menu is opened and the shown entry (System) is clicked like a user would.
(async () => {
  const S = Zotero.ZoteroTTSRun.state.ep224 || {};
  const out = { status: 'FAIL', checks: {}, errors: [] };
  const wu = Components.utils.waiveXrays;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (S.readerIndex === undefined) throw new Error('run 224-00 first');
    const reader = (Zotero.Reader._readers ?? [])[S.readerIndex];
    if (!reader || reader.itemID !== S.itemID) throw new Error('fixture reader gone');
    const idx = S.readerIndex;
    const vs = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, idx)).readers[idx];
    const fdoc = wu(wu(reader._iframeWindow.document.getElementById('ztts-player-frame').contentWindow).document); // contentDocument is null in this Firefox state; the page lives on contentWindow
    const pop = () => fdoc.querySelector('.popover');
    const before = vs();
    out.checks.before = { draft: before.handoff?.draft ?? null, notice: before.handoff?.notice ?? null, player: before.player };
    if (before.handoff?.draft?.tier !== 'system' || before.handoff?.draft?.locale !== null) throw new Error('the {system,null} draft from item 3.2 is not standing');

    // Close the auto-opened language menu by pressing its own button (a toggle).
    const localeBtn = fdoc.querySelector('[data-pick="locale"]');
    if (localeBtn.getAttribute('aria-expanded') === 'true') localeBtn.click();
    await sleep(200);
    out.checks.closedAutoMenu = !pop();

    // Open the entry menu and pick the entry the Player shows (System).
    const tiers = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const labels = tiers?.labels ?? {};
    const systemLabel = labels['system'] ?? 'System';
    const btn = fdoc.querySelector('[data-pick="provider"]');
    btn.click();
    let p = null;
    for (let t = 0; t < 1500 && !p; t += 40) { await sleep(40); p = fdoc.querySelector('.popover'); }
    if (!p) throw new Error('the entry menu did not open');
    const rows = fdoc.querySelectorAll('.popover .option');
    let clicked = false;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].getAttribute('title') ?? '') === systemLabel) { rows[i].click(); clicked = true; break; }
    }
    if (!clicked) { out.checks.rowTitles = [...rows].map((r) => r.getAttribute('title')); throw new Error('no "' + systemLabel + '" row'); }
    await sleep(900);
    const after = vs();
    out.checks.after = { draft: after.handoff?.draft ?? null, notice: after.handoff?.notice ?? null, player: after.player, popoverOpened: !!pop() };
    const noChange = after.handoff?.draft?.tier === 'system' && after.handoff?.draft?.locale === null
      && after.handoff?.notice === out.checks.before.notice
      && after.player?.provider === 'system' && !out.checks.after.popoverOpened;
    out.status = out.checks.closedAutoMenu && noChange ? 'PASS' : 'FAIL';
  } catch (e) {
    out.errors.push(String(e));
  }
  return JSON.stringify(out);
})()
