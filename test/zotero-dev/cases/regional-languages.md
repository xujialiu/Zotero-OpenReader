[Checklist index](../README.md) · [Scripts](../scripts/regional-languages/README.md)

## Every region a language of its own, named as on the phone (issue #223)

The Player's language dropdown and the voice browser's language column list
each locale a provider sends as its own language. Nothing is merged: macOS's
`zh-CN`, `zh-HK` and `zh-TW` are three languages, and so are Zotero
Premium's `ar-XA` and `ar-SA`. Each is named by only what tells it apart,
OpenReader's rules, in Zotero's locale (`languageNames`,
`src/read-aloud/language-dropdown.ts`). A language lists only its own
voices (`src/read-aloud/player-voice-list.ts`).

Zotero's manager still sees every Chinese region as none (`normalizeLanguage`,
reader.js 38103 in Zotero 11.0). So a language pick, and a provider pick from
such a locale, are staged before Zotero resolves (`stageLanguagePick`,
`stageTierPick`, `src/read-aloud/memory-sync.ts`). Expected values are derived
from `src/` and the unit tests unless a run is cited.

Run the baseline first; WebDAV off as `MEMORY/testing.md` says. Fixture:
`fixture-a.pdf` as a standalone attachment, its Player opened **muted**
(`readAloud.volume` 0 for the run): a paused pick plays a sample. Never touch
the owner's readers. Save `extensions.zotero.reader.readAloudVoices`, the
plugin's `readAloud.memory`, `readAloud.defaultVoice` and the fixture's
document voice record, with their user-value flags, and restore them at the
end. Use the **System** entry (macOS: Tingting and other `zh-CN` voices,
Meijia `zh-TW`, Sinji `zh-HK`); its samples are free. Azure and Zotero
Premium are used only where `zotero-tts.azure.enabled` and the Premium
switch are already on. Never switch a provider on for the run.

### 1. The build

1. `diagnostics.startup()`: the beta's version, every step successful.
   The bundle contains `staged a ${` … `for the provider pick` and
   `zoteroKeepsRegion`.

### 2. The names, in the voice browser and the Player

1. `diagnostics.languageColumn()`: the `column.system` entries carry
   `[zh-CN]`, `[zh-HK]` and `[zh-TW]` as three languages. In an English
   Zotero they are named `Chinese (China)`, `Chinese (Hong Kong)` and
   `Chinese (Taiwan)`; in a Chinese one `中文（中国）`, `中文（香港）` and
   `中文（台湾）`. Report which locale ran.
2. Where Azure is listed, `column.azure` holds the issue's eleven: `Cantonese`,
   `Chinese (China)`, `Chinese (Guangxi)`, `Chinese (Henan)`,
   `Chinese (Hong Kong)`, `Chinese (Liaoning)`, `Chinese (Shaanxi)`,
   `Chinese (Shandong)`, `Chinese (Sichuan)`, `Chinese (Taiwan)`,
   `Wu Chinese`. It also holds `English (Hong Kong)`, `Serbian (Cyrillic)` /
   `Serbian (Latin)`, `Inuktitut (Syllabics)` / `Inuktitut (Latin)`, and
   `Arabic (Saudi Arabia)`. In Chinese the dialects read `中文（辽宁）` etc.
   Where Premium is listed: `Arabic (world) [ar-XA]` and
   `Arabic (Saudi Arabia) [ar-SA]`.
3. With favorites-only off, every reader row whose Player has listed shows
   `same: true` (`player` equals `browser`). `zotero` still holds one `zh`.
   This is the evidence that the Player no longer reads `manager.languages`.

### 3. A Chinese region picked in the Player

1. On the fixture's Player, choose the System entry, then Chinese (China)
   (`staged an exact zh-CN voice for the language pick`), then a `zh-CN`
   voice through the voice dropdown, so that a Mandarin voice is remembered
   for `zh`. A paused voice pick waits for Play as the #108 handoff: one
   muted play-pause commits it.
2. Through the language dropdown, choose Chinese (Hong Kong).
   `diagnostics.pluginPlayer()` for the fixture: `state.locale` `zh-HK`, and
   `state.voice` Sinji's id. The debug output has
   `staged an exact zh-HK voice for the language pick: <Sinji>`.
   `diagnostics.playerVoiceList()`: `patched: true`, `offered` the number of
   `zh-HK` System voices (1), and `compatible` larger (Zotero's own list,
   every Chinese voice: 19 on macOS 27).
3. Choose Chinese (Taiwan): `state.locale` `zh-TW` and a `zh-TW` voice.
   Then Chinese (China): back on a `zh-CN` voice. Each settles within one
   second, and the Player stays paused.
4. The previous/next voice keys on Chinese (Taiwan) cycle inside the
   `zh-TW` voices only, wrapping both ways. While paused the evidence is
   `diagnostics.voiceSwitch()`'s pending target and `last.to`: the
   selection itself moves only on Play.

### 4. A provider switch keeps the region

1. Only where Azure is on: on Chinese (Hong Kong), choose an Azure `zh-HK`
   voice, then the System entry in the first dropdown. Sinji is selected,
   `state.locale` `zh-HK`, and the debug output has
   `staged a zh-HK voice for the provider pick: <Sinji>`.
   Without Azure: NOT TESTABLE live (unit-tested in
   `test/read-aloud/memory-sync.test.ts`).
2. English is left to Zotero: on English (United Kingdom), switch entries
   between two that both have `en-GB`. The region holds, and no
   `for the provider pick` line appears.

### 5. Regions Zotero tells apart are unchanged

1. The checks of `cases/regional-picks.md` items 2-3 on System's English:
   US and GB stay `en-US` and `en-GB` (macOS offers no generic `en`).
2. Under a generic language (`en` from Fish Audio, where it is on), the voice
   menu holds only generic voices (issue #223; `cases/player-voice-list.md`
   item 2).

### 6. Cleanup

Restore every saved preference and user-value flag, the volume, the
selected tab, and the fixture's document voice. Erase the fixture, read new
plugin errors, and confirm the owner's readers match the baseline. A
locale switch is not driven (it kills Zotero, `notes/NOTES_2026-09-10.md`):
the other locale's names are the unit tests'.

**Verified 2026-10-19 on 1.16.12-beta7** (Zotero 11.0-beta.1, macOS, en-US),
by two `zotero-tester` runs, the first of which timed out after item 2:
items 1, 2.1, 2.3 and 3-6 PASS; 2.2 and 4.1 NOT TESTABLE with Azure and
Zotero Premium off. The table is
[issue #223's closing comment](https://github.com/xujialiu/Zotero-OpenReader/issues/223#issuecomment-6253782187).
