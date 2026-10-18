---
status: accepted
date: 2026-10-19
issue: 223
---

# Every locale is a language, named as OpenReader names it

*The product argument is [design 0019](../design/0019-every-region-is-a-language-of-its-own.md).*

## What there was

- The Player's language dropdown and the voice browser's language column
  filed a voice under Zotero's normalized language (`dropdownLanguage`,
  a copy of `normalizeLanguage`). They named an entry through
  `Intl.DisplayNames` with the region only where the entry held the base
  language in several (`dropdownLabels`, Zotero's `LanguageRegionSelect`).
- `normalizeLanguage` (reader.js 38103, Zotero 11.0) maps the regions
  `CN`, `HK` and `TW` to none and `XA` and `SA` to `001`, so Azure's
  `zh-CN`, `zh-HK` and `zh-TW` were one `Chinese`. Zotero Premium's
  `ar-XA` (25 voices) and `ar-SA` (2) were one `Arabic (world)`, and so was
  Azure's `ar-SA` beside its other Arabic regions.
- OpenReader lists every locale as its own language (xujialiu/OpenReader#232)
  and names each by only what tells it apart (xujialiu/OpenReader#300). The
  same voice was filed in different places on the phone and the desktop.
- The manager still resolves every voice through the normalization:
  `getSupportedLanguages`, `getVoicesForLanguage` and `getVoiceRegion`
  (39370-39390), `languages`, `currentVoiceRegion` and `voicesForLanguage`
  (84726-84737), `_findFallbackVoice` (84905), and `selectTier`'s region
  carry (84782). A pick of `zh-HK` resolves among every Chinese voice, and
  its region step never matches.

## Decision

- **No merging.** A voice is listed under its locale as its provider sent
  it, in the Player (`player-controller.ts`, languages from
  `manager.voices` through `voiceLanguages`, the selected one the selected
  voice's locale) and in the voice browser (`voice-browser-rows.ts`).
- **The names are OpenReader's rules** (`languageNames`,
  `src/read-aloud/language-dropdown.ts`):
  - a dialect (variant) is named by its place alone, always;
  - every locale of a language names its script once one of its tags writes
    a script other than the likely one (`Intl.Locale#maximize`);
  - a country is named only where the language's tags hold more than one;
  - `HK` and `MO` take ICU's short region name (`style: 'short'`, which
    also turns `US` into `US`, so no other region does), and `Cans` reads
    `Syllabics` in English.

  Unlike OpenReader's English table (Hermes has no `Intl.DisplayNames`),
  the names are composed at run time in the app's locale, the owner's
  answer of 2026-10-18. Each name is asked for the tag rebuilt from what
  tells it apart, and the region's long name is replaced where needed, so a
  Chinese Zotero reads 中文（香港）. A dialect's place comes from the
  Fluent messages `ztts-place-*` (Azure's six; ICU has no subdivision
  names), else the variant in title case.
- **`ar-XA` is named as `001`**, `Arabic (world)`. ICU's name for `XA` is the
  pseudo-locale `Pseudo-Accents`; Google uses `ar-XA` for world Arabic.
- **A language lists only its own voices.** The `voicesForLanguage` shadow
  (`player-voice-list.ts`, #106) filters to the selected voice's locale for
  every selection except a wildcard or none. Before, only a regional one
  was filtered; a generic `en` voice listed every English voice.
- **The picks Zotero cannot resolve are staged.** `zoteroKeepsRegion`
  (`core/read-aloud-speed.ts`) says whether `normalizeLanguage` keeps a
  locale's region.
  - `stageLanguagePick` models Zotero's pool with a port of
    `isLanguageSupported`. Where Zotero loses the region, it stages the
    remembered voice of the locale, else its first, unless Zotero's pool
    holds only voices of that locale or the remembered voice already is
    one, with no region change. Regions Zotero keeps follow #91's rules
    unchanged.
  - `stageTierPick` stages the new entry's voice of the current voice's
    locale before `selectTier` resolves, for such a locale only.
- **A language pick still lands on a voice**, the remembered one. The
  phone picks nothing, but the manager needs a voice to keep reading.
  This was the owner's answer of 2026-10-18.

## Consequences

- Zotero's own pref (`reader.readAloudVoices`) is keyed by base language,
  and its `region` is `getVoiceRegion`'s: still one entry for every
  Chinese, holding the last Chinese voice picked. A speed is still kept per
  base language. Document voices (ADR 0009) are unaffected.
- `manager.languages` is no longer what the Player shows.
  `diagnostics.languageColumn()` compares the browser's column with the
  Player's own list and prints Zotero's beside it.
- The Player names its languages every 250 ms per tab (`ui/player.ts`).
  `languageNames` keeps its last 32 answers, keyed by the list, the locale
  and whether the plugin's strings are loaded. Azure's 155 locales take
  about 9 ms on a first call in Node and 0.015 ms after.
- The names are Gecko's ICU in Zotero and Node's in the tests (78.2). A
  wording ICU changes between versions changes the Player's.

## Rejected

- **Handing Zotero rewritten tags** (`zh-HK` as `zh-Hant-HK`), so that
  `normalizeLanguage` keeps the region and the manager resolves on its own.
  Its pref and state would carry invented tags. A document whose language is
  `zh`, with no remembered voice, would take the first Chinese voice; the
  preferred region `CN` would never match `Hans-CN`, so that voice could be
  Cantonese.
- **One Chinese, the region in the voice's label.** Not what #223 asks, and
  the phone would still file the voice elsewhere.
- **English names in every locale**, word for word the phone's. A Chinese
  Zotero would show an English language list among translated settings.
