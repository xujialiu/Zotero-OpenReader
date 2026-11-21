(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const readerIndex = (Zotero.Reader?._readers ?? []).findIndex((r) => {
    try {
      return !Components.utils.isDeadWrapper(r) && r._internalReader?._readAloudRemoteInterface?.getAudio;
    } catch {
      return false;
    }
  });
  if (readerIndex < 0) throw new Error('No live attached fixture reader with getAudio');
  const reader = Zotero.Reader._readers[readerIndex];
  const internal = Components.utils.waiveXrays(reader._internalReader);
  const manager = internal._readAloudManager;
  let voiceData = { id: 'fishspeech::bella', locale: 'mul' };
  const all = manager._allVoices;
  if (all)
    for (let i = 0; i < all.length; i++)
      if (all[i]?.id === 'fishspeech::bella') {
        voiceData = { id: all[i].id, locale: all[i].locale ?? 'mul' };
        break;
      }
  const voice = Components.utils.cloneInto(voiceData, reader._iframeWindow);
  const text = 'Zotero-TTS fixture A, page one.';
  const segment = Components.utils.cloneInto({ text }, reader._iframeWindow);
  const iface = internal._readAloudRemoteInterface;
  const counts = async (url) =>
    (await (await fetch(url + '/counts')).json()).filter((x) => x.voice === 'bella' && x.text === text).length;
  const before = { a: await counts('http://127.0.0.1:63670'), b: await counts('http://127.0.0.1:63671') };
  const hash = (bytes) => {
    const h = Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);
    h.init(h.SHA256);
    h.update(bytes, bytes.length);
    return Array.from(h.finish(false), (c) => ('0' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
  };
  const blobHash = async (blob) =>
    await new Promise((resolve, reject) => {
      const fr = new reader._iframeWindow.FileReader();
      fr.onload = () => resolve(hash(new Uint8Array(fr.result)));
      fr.onerror = () => reject(new Error('FileReader failed for attached getAudio result'));
      fr.readAsArrayBuffer(blob);
    });
  const first = await iface.getAudio(segment, voice);
  const second = await iface.getAudio(segment, voice);
  if (!first?.audio || !second?.audio || first.error || second.error)
    throw new Error('Attached reader.getAudio did not return audio');
  const calls = [];
  for (const audio of [first, second])
    calls.push({
      size: audio.audio.size,
      sha: await blobHash(audio.audio),
      speechText: audio.speechText ?? null,
      error: audio.error ?? null,
    });
  const after = { a: await counts('http://127.0.0.1:63670'), b: await counts('http://127.0.0.1:63671') };
  state.fishReaderIndex = readerIndex;
  state.fishReaderText = text;
  state.fishVoiceA = voiceData;
  state.fishReaderA = { before, after, calls };
  return JSON.stringify({
    readerIndex,
    title: (() => {
      const it = Zotero.Items.get(reader.itemID);
      return (it.parentItem ? Zotero.Items.get(it.parentItem) : it).getField('title');
    })(),
    text,
    before,
    after,
    calls,
    sameBytes: calls[0].sha === calls[1].sha,
    expectedA: '458bed47669598d3c5be2a5f78564b67168079ffb4a6cbbf9c8fbbabd7e5a68f',
  });
})();
