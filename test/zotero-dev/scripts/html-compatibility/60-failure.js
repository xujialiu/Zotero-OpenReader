// Check 6: a disposable HTML whose body carries no readable text must fail
// preparation visibly. A fresh empty item is imported per run (the toast
// fires once per item per session), a poller watches the reader's document
// for #ztts-speed-toast from before the reader opens (the toast dismisses
// after ~900 ms), htmlDocuments() must report 'failed' and never stick in
// 'preparing', and the hook must still serve a valid fixture afterwards.
// Leaves one empty tab open, idle, for check 7. state: reads fx; writes
// failure6.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fx = state.fx;
  const p = Zotero.ZoteroTTSRun.params;
  const out = { step: 'failure' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Zotero.getMainWindow();
  if (win.windowState === 2) win.restore();
  const T = win.Zotero_Tabs;
  const findReader = (itemID) => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  const htmlRows = async () => { try { return JSON.parse(await Zotero.ZoteroTTS.diagnostics.htmlDocuments()); } catch (e) { return []; } };

  // A fresh empty item every run: the notice fires once per item per session.
  const emptyPath = PathUtils.join(p.tmpDir, 'empty2.html');
  await IOUtils.writeUTF8(emptyPath, '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Empty fixture 2</title></head>\n<body><script>var stillNothing = true;</script></body></html>\n');
  const imported = await Zotero.Attachments.importFromFile({ file: emptyPath, libraryID: Zotero.Libraries.userLibraryID, title: 'ztts228 empty2' });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  const itemID = item.id;
  out.itemID = itemID;
  state.failure6 = { itemID };
  fx.emptyImported2 = { id: itemID, key: item.key, title: 'ztts228 empty2' };

  // Poller: capture the toast text from before the analysis can fail.
  const seen = [];
  const poller = win.setInterval(() => {
    try {
      const docs = [win.document];
      for (const r of Zotero.Reader._readers || []) {
        if (r?.itemID !== itemID) continue;
        if (r._iframeWindow?.document) docs.push(r._iframeWindow.document);
      }
      for (const doc of docs) {
        const el = doc.getElementById('ztts-speed-toast');
        const text = el ? String(el.textContent ?? '').trim() : '';
        if (text && !seen.some((s) => s.text === text)) seen.push({ text: text.slice(0, 200), at: Date.now() });
      }
    } catch (e) { /* reader document not ready yet */ }
  }, 100);

  let reader = null;
  try {
    const opened = Zotero.Reader.open(itemID);
    if (opened && typeof opened.then === 'function') await opened;
    const t0 = Date.now();
    while (Date.now() - t0 < 24000 && !(reader = findReader(itemID))?.['_internalReader']) await sleep(250);
    if (!reader?._internalReader) throw new Error('empty fixture reader never opened');
    if (T.selectedID !== reader.tabID) T.select(reader.tabID);

    let obs = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 45000) {
      const rows = await htmlRows();
      obs = rows.find((r) => r.itemID === itemID) ?? null;
      if (obs && obs.status !== 'preparing') break;
      await sleep(300);
    }
    out.observation = obs;
    await sleep(1500);
    const rows = await htmlRows();
    out.observationAfterSettle = rows.find((r) => r.itemID === itemID) ?? null;
  } finally {
    win.clearInterval(poller);
  }
  out.toastsSeen = seen;
  out.toastMatchesEnUS = seen.some((s) => s.text === 'This HTML could not be prepared for reading. Close and reopen the document to try again.');
  out.toastMatchesZhCN = seen.some((s) => s.text === '无法准备此 HTML 以供朗读。请关闭并重新打开文档后重试。');

  // The hook still serves a valid fixture afterwards.
  const pack = await Zotero.SDT.getPack(fx.bodylessLinked.id);
  const rowsAfter = await htmlRows();
  out.retryRow = rowsAfter.find((r) => r.itemID === fx.bodylessLinked.id) ?? null;
  out.retryPackOk = !!pack?.ok;

  out.ok = out.observation?.status === 'failed'
    && out.observationAfterSettle?.status === 'failed'
    && (out.toastMatchesEnUS || out.toastMatchesZhCN)
    && out.retryPackOk
    && out.retryRow?.status === 'compatibility';
  return JSON.stringify(out, null, 1);
})()
