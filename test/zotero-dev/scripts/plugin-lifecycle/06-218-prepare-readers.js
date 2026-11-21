(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const itemA = state.fixtureA?.itemID,
    itemB = state.fixtureB?.itemID;
  if (!itemA || !itemB) throw new Error('Prepared fixture item ids are missing from retained state');
  const main = Zotero.getMainWindow();
  if (main.windowState === 2) main.restore();
  main.focus();
  const pref = Services.wm.getMostRecentWindow('zotero:pref');
  if (pref) {
    pref.close();
    for (let i = 0; i < 80 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50);
  }
  const list = Zotero.Reader?._readers ?? [];
  const toClose = [];
  for (let i = 0; i < list.length; i++)
    if (list[i]?.itemID === itemA || list[i]?.itemID === itemB) toClose.push(list[i]);
  for (const reader of toClose) {
    if (reader._internalReader?._state?.readAloudState?.popupOpen) reader._internalReader.toggleReadAloudPopup(false);
    const pending = reader.close();
    if (pending && typeof pending.then === 'function') await pending;
  }
  for (
    let i = 0;
    i < 100 && (Zotero.Reader?._readers ?? []).some((r) => r?.itemID === itemA || r?.itemID === itemB);
    i++
  )
    await sleep(50);
  if ((Zotero.Reader?._readers ?? []).length) throw new Error('Unexpected readers remain before the 5.9 setup');
  const find = (id) => {
    const rs = Zotero.Reader?._readers ?? [];
    for (let i = 0; i < rs.length; i++) if (rs[i]?.itemID === id) return { reader: rs[i], index: i };
    return null;
  };
  const waitReader = async (id) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      const f = find(id);
      if (f?.reader?._internalReader) return f;
      await sleep(100);
    }
    return null;
  };
  let opened = Zotero.Reader.open(itemA, null, { openInWindow: true });
  if (opened && typeof opened.then === 'function') await opened;
  const a = await waitReader(itemA);
  if (!a) throw new Error('Fixture A window reader never exposed _internalReader');
  a.reader._window.close();
  let dead = null;
  for (let i = 0; i < 60; i++) {
    dead = find(itemA);
    if (
      dead?.reader?._window?.closed &&
      Components.utils.isDeadWrapper(dead.reader._internalReader) &&
      Components.utils.isDeadWrapper(dead.reader._iframeWindow)
    )
      break;
    await sleep(100);
  }
  if (
    !dead?.reader?._window?.closed ||
    !Components.utils.isDeadWrapper(dead.reader._internalReader) ||
    !Components.utils.isDeadWrapper(dead.reader._iframeWindow)
  )
    throw new Error('Fixture A did not leave the expected listed dead reader');
  state.deadReader = { itemID: itemA, index: dead.index };
  opened = Zotero.Reader.open(itemB);
  if (opened && typeof opened.then === 'function') await opened;
  const b = await waitReader(itemB);
  if (!b) throw new Error('Fixture B tab reader never exposed _internalReader');
  main.Zotero_Tabs.select(b.reader.tabID);
  let pagesRendered = false;
  for (let i = 0; i < 120; i++) {
    try {
      const doc = b.reader._internalReader._primaryView._iframeWindow.document;
      const canvases = [...doc.querySelectorAll('.page canvas')];
      if (canvases.length && canvases.every((c) => c.width > 0 && c.height > 0)) {
        pagesRendered = true;
        break;
      }
    } catch {}
    await sleep(100);
  }
  state.liveReader = { itemID: itemB, tabID: b.reader.tabID, index: b.index };
  return JSON.stringify({
    settingsClosed: !Services.wm.getMostRecentWindow('zotero:pref'),
    dead: {
      index: dead.index,
      itemID: itemA,
      listed: true,
      closed: dead.reader._window.closed,
      internalDead: Components.utils.isDeadWrapper(dead.reader._internalReader),
      iframeDead: Components.utils.isDeadWrapper(dead.reader._iframeWindow),
    },
    live: { index: b.index, itemID: itemB, selected: main.Zotero_Tabs.selectedID === b.reader.tabID, pagesRendered },
    readers: (Zotero.Reader._readers ?? []).map((r, index) => ({
      index,
      itemID: r?.itemID,
      gone: (() => {
        try {
          return Components.utils.isDeadWrapper(r._internalReader) || Components.utils.isDeadWrapper(r._iframeWindow);
        } catch {
          return true;
        }
      })(),
    })),
  });
})();
