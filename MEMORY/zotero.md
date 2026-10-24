# Zotero internals — verified pitfalls

Read before changing Zotero-facing adapters, working with reader realms,
preferences, FilePicker or Read Aloud internals, or inspecting Zotero's
source/profile. This is reference reached from `MEMORY/code.md`, not a
source-tree inventory. Preserve the dated observations when revising it.

## Zotero pitfalls that have already cost a round-trip

- **Sandbox whitelist**: the plugin scope has no `WebSocket`, `AbortController`
  or `caches`; take them from `reader._window`. It does get `Zotero`,
  `Services`, `ChromeUtils`, `IOUtils`, `PathUtils`, `Localization` (the
  Fluent constructor; `core/l10n.ts` formats through a sync instance of it),
  `setTimeout`, `fetch`, `atob`/`btoa`, `TextEncoder`/`TextDecoder`, `URL`,
  `DOMParser`, `crypto`, `XMLHttpRequest` (the list: `wantGlobalProperties`
  and the `Object.assign` after it in `xpcom/plugins.js` `_loadScope`).
- **Compartments**: the reader iframe may not call a bare sandbox function
  (export it with `Components.utils.exportFunction`) nor read a sandbox object
  ("Permission denied to access property …"). Hand reader code primitives
  only; call reader functions with `Reflect.apply`, not `fn.apply`, so the
  argument array stays on our side. Never call `fn.apply` on a reader
  function with sandbox arguments. Inside an exported function, `this` and
  the arguments arrive behind Xray wrappers: a plain object's prototype
  methods are invisible and assignments land on the wrapper — waive them
  (`Components.utils.waiveXrays`) or use references captured on our side;
  objects reached from our side (`reader._internalReader…`) are fine.
  A reader-realm array's `find` / `some` / `filter` given a sandbox
  callback never calls it and answers `undefined` / `false` / `[]`
  without a throw (2026-09-08, issue #75: a guard inert live and green
  in a same-realm unit test), and `map` / `every` answer wrong the same
  way (2026-09-15, issue #110) — walk such arrays by index, and give the
  unit test a list whose `find` / `some` answer nothing.
- **A listed reader can outlive its window** (2026-09-25, issue #143): a
  script's `reader._window.close()` skips Zotero's `reader.close()`, so
  the reader stays in `Zotero.Reader._readers` with its `_internalReader`
  and `_iframeWindow` dead, and every read through them throws. The
  reader object itself is chrome-side and never dead. Walk `_readers`
  through `eachReader` (`src/index.ts`, over `forEachReader` in
  `read-aloud/reader-access.ts`), never a bare loop. One bare walk whose
  attach threw on such a reader failed its whole startup step; in the
  shortcuts step, that cost every reader opened later its Player.
  `test/index.test.ts` starts the whole plugin with one listed.
- **`Zotero.Prefs.set`** writes through the type the pref is declared with in
  `prefs.js`: an int pref goes through `setIntPref`, which cannot hold a
  fraction — a `preference=`-bound number input hands it "1.5" and the pref
  stays 1 (why the old Speed setting never worked; store a string or a
  percentage instead). Only an undeclared pref takes its type from
  `typeof value`, and a fraction then throws. Undeclared prefs read as
  `undefined`.
  `Zotero.Prefs.registerObserver(name, fn)` takes names relative to
  `extensions.zotero.`; observers fire synchronously inside `set`, **in
  registration order** — a reader opened after the plugin started hears a
  write *after* the plugin does, so inside our observer its
  `_state.readAloudVoices` is still the old value (memory-sync refreshes
  it before resyncing a reader). A `set` with an **unchanged value notifies
  nobody**: a popup pick that re-persists what the entry already holds (the
  only voice under a language) is invisible to a pref observer — memory-sync
  hooks the manager's `selectVoice`/`selectTier`/`setLanguage` for those.
- **`FilePicker`** (`chrome://zotero/content/modules/filePicker.mjs`): the
  chosen path is `fp.file` (a string); there is no `fp.path`.
- **Read Aloud**: `reader._internalReader._readAloudManager` — `active` means
  "session open" (paused keeps it true), speaking is `active && !paused`;
  `setSpeed(speed, persist)` — never persist on an idle manager, it starts
  playback; `skipBack/skipAhead('sentence' | 'paragraph', accelerate)` are
  the popup's skip buttons, followed by `_lockPositionToReadAloud()`. Choices persist in `extensions.zotero.reader.readAloudVoices`,
  keyed by the *detected* base language (`mul` for "Multiple languages");
  `_syncPersistedVoicesToManager` restores them. Highlight colors are
  constants in the bundle (`READ_ALOUD_ACTIVE_SEGMENT_COLOR` / `…SENTENCE_COLOR`),
  reached only by shadowing prototype methods per reader (highlight-style.ts);
  each reader tab has its own bundle and classes. Tiers are hard-coded
  standard/premium/local; unknown tiers are dropped. Word mode draws only
  real word timestamps.
- **Kokoro-FastAPI**: `/dev/captioned_speech` needs `stream: false`;
  `/v1/audio/voices` returns `{ voices: [{ id, name }] }`.
- The Zotero 9 internals used by the user's older standalone plugin
  (`view._readAloud.state.controller.speed`) do not exist in Zotero 10.

## Zotero's source and the profile

- Zotero source for verification: unpack the installed `omni.ja` into the
  scratch directory (`unzip -q` or Python `zipfile`) —
  Windows `C:\Program Files\Zotero\app\omni.ja`,
  macOS `/Applications/Zotero.app/Contents/Resources/app/omni.ja`.
  Reader bundle: `resource/reader/reader.js` (~85k lines; search, then
  bounded file reads); chrome side:
  `chrome/content/zotero/xpcom/reader.js`; prefs:
  `defaults/preferences/zotero.js`; plugin sandbox: `xpcom/plugins.js`.
- Zotero profile prefs: Windows `%APPDATA%\Zotero\Zotero\Profiles\*\prefs.js`,
  macOS `~/Library/Application Support/Zotero/Profiles/*/prefs.js`.

## Test server discovery

- Kokoro-FastAPI for testing: read the plugin's `local.baseURL` pref before
  assuming an address — on 2026-08-28 it pointed at a remote Kokoro
  (`https://h200-kokoro.xujialiu.top`, reachable from Zotero) while the
  Windows machine's Docker container (`kokoro`, GPU image,
  http://localhost:8880, Docker Desktop) was not running. On macOS use the
  CPU image or the native `start-gpu_mac.sh` (see README).
