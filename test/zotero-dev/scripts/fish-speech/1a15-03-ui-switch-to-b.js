(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win || !win.document.querySelector('.ztts-pane')) throw new Error('The original settings window is unavailable');
  const doc = win.document;
  const toggle = doc.getElementById('ztts-enable-fishspeech');
  const address = doc.querySelector(
    '#ztts-provider-fishspeech input[preference="extensions.zotero.zotero-tts.fishspeech.baseURL"]',
  );
  const status = doc.getElementById('ztts-voices-status');
  const label = () => toggle?.label || toggle?.textContent || null;
  const old = Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.baseURL', true);
  if (old !== 'http://127.0.0.1:63670' || label() !== 'Disable')
    throw new Error('Fish Speech is not enabled on endpoint A in the original window');
  const reader = Zotero.Reader._readers[Zotero.ZoteroTTSRun.state.fishReaderIndex ?? 0];
  if (reader?._internalReader?._readAloudManager?.active || reader?._internalReader?._state?.readAloudState?.popupOpen)
    throw new Error('Close the Read Aloud session before disabling Fish Speech');
  toggle.click();
  for (let i = 0; i < 100 && label() !== 'Enable'; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  const disabled =
    Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.enabled', true) === false &&
    label() === 'Enable' &&
    address.disabled === false;
  if (!disabled) throw new Error('UI Disable did not make Fish Speech editable');
  address.value = 'http://127.0.0.1:63671';
  address.dispatchEvent(new win.Event('input', { bubbles: true }));
  address.dispatchEvent(new win.Event('change', { bubbles: true }));
  address.blur();
  for (
    let i = 0;
    i < 80 && Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.baseURL', true) !== 'http://127.0.0.1:63671';
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 50));
  const edited = Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.baseURL', true) === 'http://127.0.0.1:63671';
  if (!edited) throw new Error('UI address edit did not persist B');
  toggle.click();
  for (let i = 0; i < 160 && label() !== 'Disable'; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  for (let i = 0; i < 200 && /Listing voices…/i.test(status?.textContent ?? ''); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  const enabled =
    Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.enabled', true) === true &&
    label() === 'Disable' &&
    address.disabled === true;
  const rowText = [...(doc.getElementById('ztts-voices-list')?.children ?? [])]
    .filter((el) => /bella|cedar/i.test(el.textContent))
    .map((el) => el.textContent.trim());
  const sameWindow = Services.wm.getMostRecentWindow('zotero:pref') === win;
  state.fishSettingsWindowSame = sameWindow;
  state.fishEndpointB = { disabled, edited, enabled, rowText };
  return JSON.stringify({
    disabled,
    edited,
    enabled,
    address: Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.baseURL', true),
    label: label(),
    fieldDisabled: address.disabled,
    status: status?.textContent ?? null,
    voices: rowText,
    sameWindow,
    volume: Zotero.Prefs.get('extensions.zotero.zotero-tts.readAloud.volume', true),
    cacheAudio: Zotero.Prefs.get('extensions.zotero.zotero-tts.cacheAudio', true),
  });
})();
