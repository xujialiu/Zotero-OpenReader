// 02-language-column.js — case item 2: the voice browser's language column
// per tier and the Player's language dropdown per open reader, through
// diagnostics.languageColumn(). Returns the compact evidence: Zotero's
// locale, the System column's Chinese entries, the Azure extras, Premium's
// Arabic, and per reader `same`, `zotero`, `player`.
(async () => {
  const out = {};
  const state = Zotero.ZoteroTTSRun.state;
  const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return String(e); } };
  const safea = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return fallback; } };
  out.locale = Zotero.locale;
  const col = await safea(async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.languageColumn()));
  state.languageColumn = col;
  if (!col || col.error) { out.error = col?.error ?? 'no result'; return JSON.stringify(out); }

  out.favoritesOnly = col.favoritesOnly;
  const tier = (name) => (col.column?.[name] ?? []).map(s => {
    // "Chinese (China) (4) [zh-CN]" -> { name, voices, language }
    const m = String(s).match(/^(.*) \((\d+)\) \[(.+)\]$/);
    return m ? { name: m[1], voices: Number(m[2]), language: m[3] } : { raw: String(s) };
  });
  const pick = (rows, re) => rows.filter(r => re.test(r.language ?? ''));
  const system = tier('system');
  out.systemChinese = pick(system, /^zh|^yue|^wuu/);
  out.systemAll = system.map(r => r.language);
  const azure = tier('azure');
  out.azureChinese = pick(azure, /^zh|^yue|^wuu/);
  out.azureSerbian = pick(azure, /^sr/);
  out.azureInuktitut = pick(azure, /^iu/);
  out.azureArabic = pick(azure, /^ar/);
  out.azureEnglishHK = pick(azure, /^en-HK$/);
  const premium = tier('zotero-premium');
  out.premiumArabic = pick(premium, /^ar/);
  const standard = tier('zotero-standard');
  out.standardChinese = pick(standard, /^zh/);
  out.standardArabic = pick(standard, /^ar/);
  const fish = tier('fish');
  out.fishEnglish = pick(fish, /^en(-|$)/);
  out.fishLanguages = fish.length;

  out.readers = (col.readers ?? []).map(r => ({
    title: r.title, tier: r.tier, selected: r.selected,
    player: r.player, zotero: r.zotero, browser: r.browser, same: r.same,
  }));
  state.column = { system: system, azure: azure, premium, standard };
  out.ok = true;
  return JSON.stringify(out);
})();
