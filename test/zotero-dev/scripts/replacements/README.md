# Scripts: Replacements (issue #237)

[Case](../../cases/replacements.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

| Script | What it checks | What it expects (measured) | Params |
| --- | --- | --- | --- |
| `05-item5-previews-regex.js` | Item 5, regex revision (the owner is removing Wildcard): doc rows `IL-6`→`interleukin six` (Exact) and `anti IL-(\d+)`→`anti-interleukin $1` (Regex); global `IL-(\d+)`→`interleukin $1`, `(\d+) ?mg\b`→`$1 milligrams` | All five `speech` texts match the case's expected outputs verbatim; `ms` ≤ 4 each; `runner.workers`/`timeouts` read as the session's accumulated counters; `pulseUnchangedByDirectWrite` true; owner reader's changed sentence noted and reverted at cleanup | — |
| `06-item7-slow-pattern-preview.js` | Item 7: the slow pattern is cut off and Zotero stays responsive | Answer within 1 s (527/519 ms), `timedOut: [4]`, `speech` unchanged; bridge call answers in 0–1 ms right after; `runner.timeouts`/`workers` accumulate extra cuts from the refresh's own held-sentence recomputes (each logged `ran out of 250 ms`), report verbatim | — |
| `10-item3-item4-window.js` | Items 3–4 (superseded mid-run by the scope change; the run proved it interactively — see the run line) | The window over the reader with 4 columns; the row dialog's fields; the five refusals with the dialog still open and the message shown; accepted rows at the end of their list; OK writes the prefs and the pulse; Cancel writes nothing | — |
| `12-item2-layouts.js` | Item 2: the Player's button in the three layouts, measured | top/A: `.replacements` is the element just before `.layout-menu`, gap 8 px (the bar's own flex `gap: 8px` — the case's 2 px tolerance does not hold); B: button at the panel's left edge (player left + 9 px), `.status-button` absolute right 0 | — |
| `13-item2-screenshots.js` | Item 2: screenshots of the three layouts (region strips of the host window; `frameElement` is not reachable from chrome) | Three PNGs under `.tmp/zotero-dev/replacements/`, button visible in each | — |
| `98-restore-prefs.js` | Cleanup part 1: rows restored, planted records cleared, volume/local/layout back | Owner reader's held sentence 832 re-added (revert proven); rows 0; volume 19; `local.enabled` no user value; layout no user value | — |

## Before you start

- Build and bridge: install the xpi, `zotero_plugin_list` shows `-betaN`, then
  `diagnostics.startup()` — every step `ok`, `failed` empty, and
  `typeof Zotero.ZoteroTTS.diagnostics.replacementsPreview === 'function'`.
  `diagnostics.replacements().windows` must be a `chrome://zotero-tts-instance-…/content/` address.
- WebDAV first (the run is not about WebDAV): snapshot the folder switch
  privately, switch it off, confirm `positionSync()` has `"folder": false`,
  re-confirm after the install, restore at the end.
- Fixture: import `test/fixtures/replacements/replacements.epub` as a
  standalone attachment (`title: 'Replacement fixture'`), open it, wait for
  `_internalReader` + `_readAloudManager` + the iframe (≤7 s polls, ~24 s
  ceiling). Segments materialize at manager activation.
- Snapshot `readAloud.replacements`, every `documentReplacements.*`,
  `documentReplacementsChanged`, `readAloud.playerLayout`, `readAloud.volume`
  (+ user flag), `readAloud.defaultVoice`, Zotero's
  `extensions.zotero.reader.readAloudVoices` (a voice pick on the fixture
  rewrites both; the 2026-11-02 run missed the latter),
  `readAloud.memory` (raw, restore last), and close the
  settings window before installing (an upgrade keeps the old pane).
- State it touches: the prefs above; the fixture's `documentVoices.user/KEY`
  record and reading-position row (created by reading; removed by the item
  erase — `item.eraseTx()`; `Zotero.Items.eraseTx` does not exist); the
  fixture item itself.
- Voices: a word-timed free voice for the reading checks — Kokoro
  (`local.baseURL` is configured but `local.enabled` defaults off; enable it,
  snapshot first). A voice pick on an idle manager does not survive
  activation: plant `documentVoices.user/KEY` `{"voice":{"id":"local::af_bella","lang":"en"},"manual":true,"ts":…}` on an idle tab instead. The
  autoplay gate needs a trusted Shift+Space (`nsITextInputProcessor`) before
  the audio clock moves.
- Modal windows: a modal opened from the eval's own stack opens only when the
  script unwinds — drive the window through `diagnostics.openReplacements
  Window(index)` (its `setTimeout` opens it mid-script), or press and verify
  from a later call. A bridge call's reply is lost while a modal is up; read
  state in the next call. `getMostRecentWindow(null)` finds them by id
  (`ztts-replacements-window`, `ztts-replacement-row-window`); buttons with
  `doCommand()`, dialogs with `acceptDialog()`/`cancelDialog()`. Never the
  tutorial link.
- Cleanup: session closed (`toggleReadAloudPopup(false)`), fixture tab closed,
  owner's tab reselected, `item.eraseTx()`, position row verified by count
  (the deletion observer removes it), memory restored verbatim last, settings
  window reopened (the baseline had it open), host minimized, `run.reset()`.

## Limits

- 2026-11-02: `Zotero.Items.eraseTx` is not a function on 10.0.7 — use
  `item.eraseTx()`. Cost: a stalled probe call, no state damage.
- 2026-11-02: `reader._iframeWindow.frameElement` reads null from chrome —
  screenshot the host window's region strips instead.
- 2026-11-02: an options object for a reader-realm constructor
  (`new rw.Event('selectionchange', {bubbles:true})`) must be
  `Cu.cloneInto`'d — otherwise SecurityError, the popup never opens.
- 2026-11-02: a stray click while Zotero's selection popup is open can plant
  a highlight annotation on the fixture — the fixture erase removes it.

## Runs

- 2026-11-02, build `1.16.17-beta` (branch `xujialiu/issues237` at `342264a`,
  xpi SHA-256 `d2db81917640f680bbfca57e9865c8e13d2bc136093374cc97826b6c6b47c468`),
  issue comment table items re-scoped mid-run to mechanisms only (the owner is
  removing the Wildcard mode): startup gate + item 1 (settings row, its `?`
  help naming the player, the global-rows window) PASS as direct bridge calls
  before the kit existed; item 5 (regex) PASS with all five expected outputs
  verbatim; item 7 PASS (mechanism + Player `!` message + window red row);
  item 2 PASS except the case's 2 px adjacency (measured 8 px = the bar's flex
  gap) and the dark-appearance window shot (no in-Zotero switch). Items 3, 4,
  6, 8, 9 skipped by the scope change (the row-dialog flow ran interactively
  through the refusals and the prefill before the skip — the transcript is in
  the run report, not re-runnable as one script). Item 11 done: every snapshot
  restored byte-identically, fixture erased, position rows 77 = baseline.
  `05-item5-previews.js` ran on the wildcard rows before the re-scope; the
  scripts `10`/`12`/`13` ran as written; `98` ran. Screenshots verified by
  eye: top bar, bottom bar, floating panel (button present), the row dialog,
  the window in light; dark not capturable.
