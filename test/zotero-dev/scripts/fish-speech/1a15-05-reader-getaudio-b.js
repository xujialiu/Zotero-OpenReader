(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  if (Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.baseURL', true) !== 'http://127.0.0.1:63671')
    throw new Error('Fish Speech is not on endpoint B');
  const readerIndex = state.fishReaderIndex;
  const reader = Zotero.Reader._readers[readerIndex];
  const internal = Components.utils.waiveXrays(reader._internalReader);
  const manager = internal._readAloudManager;
  const voice = Components.utils.cloneInto(state.fishVoiceA, reader._iframeWindow);
  if (voice?.id !== 'fishspeech::bella') throw new Error('The retained A voice object is not fishspeech::bella');
  const text = state.fishReaderText;
  const segment = Components.utils.cloneInto({ text }, reader._iframeWindow);
  const iface = internal._readAloudRemoteInterface;
  const count = async (url) =>
    (await (await fetch(url + '/counts')).json()).filter((x) => x.voice === 'bella' && x.text === text).length;
  const before = { a: await count('http://127.0.0.1:63670'), b: await count('http://127.0.0.1:63671') };
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
  const first = await iface.getAudio(segment, voice),
    second = await iface.getAudio(segment, voice);
  if (!first?.audio || !second?.audio || first.error || second.error)
    throw new Error('Attached reader.getAudio did not return B audio');
  const calls = [];
  for (const audio of [first, second])
    calls.push({
      size: audio.audio.size,
      sha: await blobHash(audio.audio),
      speechText: audio.speechText ?? null,
      error: audio.error ?? null,
    });
  const after = { a: await count('http://127.0.0.1:63670'), b: await count('http://127.0.0.1:63671') };
  state.fishReaderB = { before, after, calls };
  return JSON.stringify({
    readerIndex,
    text,
    before,
    after,
    calls,
    sameBytes: calls[0].sha === calls[1].sha,
    expectedB: '2a912a134fecac2eb9fafd4e9c64f740bc220085b4c96691dd4c81166f8a02c7',
  });
})();
