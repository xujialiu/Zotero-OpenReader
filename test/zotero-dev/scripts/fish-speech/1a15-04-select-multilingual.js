(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('Settings window unavailable');
  const doc = win.document;
  const tiers = doc.getElementById('ztts-voices-tiers');
  const tier = [...tiers.children].find((el) => el.textContent.trim().startsWith('Fish Speech'));
  if (!tier) throw new Error('Fish Speech voice-browser tier missing after enabling B');
  tier.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const locales = doc.getElementById('ztts-voices-locales');
  const locale = [...locales.children].find((el) => el.textContent.trim().startsWith('Multilingual'));
  if (!locale) throw new Error('Fish Speech Multilingual locale missing');
  locale.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const rows = [...doc.getElementById('ztts-voices-list').children].map((el) => el.textContent.trim());
  Zotero.ZoteroTTSRun.state.fishSettingsWindow = win;
  return JSON.stringify({
    tier: tier.textContent.trim(),
    locale: locale.textContent.trim(),
    rows,
    status: doc.getElementById('ztts-voices-status')?.textContent ?? null,
    enabled: Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.enabled', true),
    address: Zotero.Prefs.get('extensions.zotero.zotero-tts.fishspeech.baseURL', true),
  });
})();
