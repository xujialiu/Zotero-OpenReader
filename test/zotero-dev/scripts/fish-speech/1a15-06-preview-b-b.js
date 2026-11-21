(async () => {
  const prefsWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (!prefsWin) throw new Error('Original Fish Speech settings window closed');
  prefsWin.focus();
  const doc = prefsWin.document;
  const sameWindow = prefsWin === Zotero.ZoteroTTSRun.state.fishSettingsWindow;
  const voices = doc.getElementById('ztts-voices-list');
  if (!voices) throw new Error('Voice browser missing');
  const sampleText = 'Hello! This is what I sound like when reading aloud. 你好!这是我朗读时的声音。';
  const count = async (url) =>
    (await (await fetch(url + '/counts')).json()).filter((x) => x.voice === 'bella' && x.text === sampleText).length;
  const before = { a: await count('http://127.0.0.1:63670'), b: await count('http://127.0.0.1:63671') };
  const hash = (bytes) => {
    const h = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    h.init(h.SHA256);
    h.update(bytes, bytes.length);
    return Array.from(h.finish(false), (c) => ('0' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
  };
  const original = doc.createElementNS;
  const calls = [];
  let current = null;
  let patched = false;
  try {
    doc.createElementNS = function (ns, tag, ...rest) {
      const element = original.call(this, ns, tag, ...rest);
      if (String(tag).toLowerCase() === 'audio') {
        current = { element, playEvent: false, endedEvent: false, errorEvent: false };
        element.addEventListener('play', () => {
          current.playEvent = true;
        });
        element.addEventListener('ended', () => {
          current.endedEvent = true;
        });
        element.addEventListener('error', () => {
          current.errorEvent = true;
        });
      }
      return element;
    };
    patched = doc.createElementNS !== original;
    for (let n = 0; n < 2; n++) {
      const row = [...voices.children].find((el) => el.textContent.includes('bella'));
      const button = row?.querySelector('button');
      if (!button) throw new Error('bella preview button missing');
      current = null;
      const clickedAt = Date.now();
      button.click();
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline && !current) await new Promise((resolve) => setTimeout(resolve, 20));
      if (!current) {
        calls.push({ click: n + 1, created: false, glyph: button.textContent, ms: Date.now() - clickedAt });
        break;
      }
      const observed = current;
      while (Date.now() < deadline && !observed.element.src) await new Promise((resolve) => setTimeout(resolve, 20));
      const src = observed.element.currentSrc || observed.element.src;
      let size = null,
        digest = null;
      if (src.startsWith('data:')) {
        const raw = atob(src.slice(src.indexOf(',') + 1));
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        size = bytes.byteLength;
        digest = hash(bytes);
      } else if (src.startsWith('blob:')) {
        const bytes = new Uint8Array(await (await prefsWin.fetch(src)).arrayBuffer());
        size = bytes.byteLength;
        digest = hash(bytes);
      }
      while (Date.now() < deadline && !observed.endedEvent && !observed.errorEvent)
        await new Promise((resolve) => setTimeout(resolve, 25));
      calls.push({
        click: n + 1,
        created: true,
        ms: Date.now() - clickedAt,
        size,
        sha: digest,
        playEvent: observed.playEvent,
        endedEvent: observed.endedEvent,
        errorEvent: observed.errorEvent,
        ended: observed.element.ended,
        paused: observed.element.paused,
        currentTime: observed.element.currentTime,
        duration: Number.isFinite(observed.element.duration) ? observed.element.duration : null,
        volume: observed.element.volume,
        glyph: button.textContent,
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } finally {
    if (patched) doc.createElementNS = original;
  }
  const after = { a: await count('http://127.0.0.1:63670'), b: await count('http://127.0.0.1:63671') };
  Zotero.ZoteroTTSRun.state.fishPreviewB = { before, after, calls };
  return JSON.stringify({
    patched,
    sameWindow,
    sampleText,
    before,
    after,
    calls,
    expectedB: '2a912a134fecac2eb9fafd4e9c64f740bc220085b4c96691dd4c81166f8a02c7',
  });
})();
