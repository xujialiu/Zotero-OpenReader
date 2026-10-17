// Item 6.26 (issue #203): sharedSettings() shows the old preset memory as a
// length. Crafts two LEGACY items into the shared file — openai.presetValues
// (a JSON object string holding the made-up apiKey) and openai.apiKey with the
// same made-up key — calls diagnostics.sharedSettings() (the plugin's own
// download + mask), and requires both items listed as <N chars> and the
// made-up key absent from the whole output. No trigger runs while the items
// sit in the file (a sync would derive openai-official.* from the legacy
// items), and they are removed again in the same script. The made-up key is
// never printed.
(async () => {
  const out = { step: 'item-6.26-preset-values-masked' };
  const prefix = 'extensions.zotero.zotero-tts.';
  const p = Services.prefs;
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const FAKE = 'fake-openai-key-do-not-print';
  const trimSlash = (value) => { let s = String(value); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
  try {
    const settings = JSON.parse(await diagnostics.settingsSync());
    if (settings.transport.running || settings.transport.pendingChange) throw new Error('transport not quiet at item start');

    // --- Craft the two legacy items (ts 1000: inert if anything ever merged them). ---
    const cfg = { url: p.getStringPref(prefix + 'webdav.url'), username: p.getStringPref(prefix + 'webdav.username'), password: p.getStringPref(prefix + 'webdav.password') };
    const auth = cfg.username ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.username}:${cfg.password}`))) } : {};
    const fileUrl = trimSlash(cfg.url) + '/zotero-tts-shared-settings.json';
    const getResp = await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } });
    if (!getResp.ok) throw new Error(`file GET ${getResp.status}`);
    const doc = JSON.parse(await getResp.text());
    const presetValue = JSON.stringify({ apiKey: FAKE });
    doc.items = doc.items.filter((i) => i.key !== 'openai.presetValues' && i.key !== 'openai.apiKey');
    doc.items.push({ key: 'openai.presetValues', value: presetValue, ts: 1000, by: 'tester' });
    doc.items.push({ key: 'openai.apiKey', value: FAKE, ts: 1000, by: 'tester' });
    doc.items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const putResp = await fetch(fileUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    if (!putResp.ok) throw new Error(`file PUT ${putResp.status}`);
    out.crafted = { items: ['openai.presetValues', 'openai.apiKey'], by: 'tester', ts: 1000, presetValueChars: presetValue.length, fakeKeyChars: FAKE.length };

    // --- The diagnostic's own view. ---
    const sharedText = await diagnostics.sharedSettings();
    const shared = JSON.parse(sharedText);
    const preset = shared.items.find((i) => i.key === 'openai.presetValues');
    const apiKey = shared.items.find((i) => i.key === 'openai.apiKey');
    out.presetItem = preset || null;
    out.apiKeyItem = apiKey || null;
    out.presetMasked = !!preset && preset.value === `<${presetValue.length} chars>`;
    out.apiKeyMasked = !!apiKey && apiKey.value === `<${FAKE.length} chars>`;
    out.fakeKeyInOutput = sharedText.includes(FAKE);

    // --- Remove the crafted items again. ---
    const doc2 = JSON.parse(await (await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } })).text());
    doc2.items = doc2.items.filter((i) => !(i.key === 'openai.presetValues' || i.key === 'openai.apiKey'));
    const putResp2 = await fetch(fileUrl, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(doc2) });
    if (!putResp2.ok) throw new Error(`file PUT (cleanup) ${putResp2.status}`);
    const verify = JSON.parse(await (await fetch(fileUrl, { method: 'GET', headers: { ...auth, cache: 'no-store' } })).text());
    out.craftedRemoved = !verify.items.some((i) => i.key === 'openai.presetValues' || i.key === 'openai.apiKey');
    out.fileStillHasFake = verify.raw ? undefined : JSON.stringify(verify.items).includes(FAKE);
    out.status = out.presetMasked && out.apiKeyMasked && !out.fakeKeyInOutput && out.craftedRemoved && !out.fileStillHasFake ? 'PASS' : 'CHECK';
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
