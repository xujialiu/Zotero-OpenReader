# Scripts: Replacements (issue #237)

[Case](../../cases/replacements.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

| Script | What it checks | What it expects (measured) | Params |
| --- | --- | --- | --- |
| `00-baseline-snapshot.js` | Isolation + snapshot: the WebDAV folder's switch (value + user flag, off if on, `positionSync()` `"folder": false`), the debug store on, the reader tabs and their managers, the position-row count, every named pref verbatim into `state.baseline`, volume muted | Baseline 2026-11-03: folder already off (no user value); rows 77; volume 19/user; speedPercent 140/user; memory user; readAloudVoices 1437 chars/user; local.enabled off; baseURL the owner's | — |
| `01-fixture-open.js` | Import `test/fixtures/replacements/replacements.epub` as a standalone attachment, open it, wait for `_internalReader` + `_readAloudManager` + the iframe (7 s polls, 24 s ceiling) | itemID/key in `state.fixture` with the reader index (3 on 2026-11-03); segments at manager activation | — |
| `02-item1-settings-row.js` | Item 1's pane half: the `Replacements:` row's `Edit…` button `ztts-replacements-open`, the `?` whose help mentions the player; closes the settings window again | Button label `Edit…`; help "…A document's own replacements are edited from the player." The global-window half (no Applies to column, intro *For every document*) needs the modal window — see 07's note; proven on 1.16.17-beta | — |
| `04-session-kokoro.js` | The reading session: `local.enabled` + `local.baseURL` → the fake server, the document voice planted on the idle manager (`documentVoices.user/KEY` `{"voice":{"id":"local::af_bella","lang":"en"},"manual":true,"ts":…}`), the fixture tab selected, a trusted Shift+Space (nsITextInputProcessor), then paused | Session `local::af_bella`, requests to the fake server (the unreplaced texts, brackets already stripped), manager active; `audio.state` may still read `suspended` before the first sound — it runs once a clip plays | `fakeBaseURL` |
| `05-item5-previews-regex.js` | Item 5: doc rows `IL-6`→`interleukin six` (Exact) and `anti IL-(\d+)`→`anti-interleukin $1` (Regex); global `IL-(\d+)`→`interleukin $1`, `(\d+) ?mg\b`→`$1 milligrams`; the five case texts through `replacementsPreview` | All five `speech` texts verbatim; `ms` under 50 each; `runner.workers` 1 after. Beta2 measured: 11/2/1/4/4 ms, workers 1 (jobs 119, timeouts 0). Needs a reader whose document key holds the doc rows (a probe key no reader uses answers from the global rows only) | — |
| `06-item7-slow-pattern-preview.js` | Item 7's mechanism: the global regex `(a+)+$` → `x` appended (merged index 4), sentence 7 (42 a's + `!`) previewed | Answer within 1 s (beta2: 520 ms), `timedOut: [4]`, `speech` unchanged; `bridgeMsAfter` 0 (Zotero not frozen); `runner.timeouts`/`workers` grow (beta2: 0→2, 1→3, `lastSkipped` [4]). The Player `!` + window red row need the reading session — proven on 1.16.17-beta | — |
| `07-item3-item4-window.js` | Items 3+4 PREP: prefs reset to the baseline, the selection ('closes', sentence 9) that prefills the row dialog. THE DIALOG FLOW IS A CALL SEQUENCE, not a script — see the file's header comment for the exact one-modal-action-per-call pattern | Dialog fields (prefill, Exact selected, Match case checked, Applies to This document, three `?`); the Match menulist exactly `[exact, regex]` — the build proof; refusals: empty → *Enter the text to replace.*, `IL-(\d+` → *…not valid: unterminated parenthetical*, `a*` → *…can match nothing at all…*, duplicate → *…same text, match and case.*; accepted rows at the ends of their lists; OK writes both prefs + pulse +1; Cancel writes nothing | — |
| `12-item2-layouts.js` | Item 2: the Player's `.replacements` button in the three layouts, measured; the default layout restored | Top/Bottom bar: just before `.layout-menu` (indices 5, 6), gap 8 px (the bar's flex gap); Floating: player left + 9 px, top 187, the menu at the right; title `Replacements`. The window screenshots are taken inside the modal flow (07) and its cancel-verify call | — |
| `14-item6-reading.js` | Item 6: the fake server's log (the outgoing requests with their input text), reposition to sentence 2 (index 1), resume, sample `activeTimestamp` every 100 ms, pause, log again | Request for sentence 2 carries `interleukin six levels rose after the second dose.`; charStart 0/charEnd 4 (IL-6) while *interleukin six* is heard, then 5–11 (*levels*) … 34–39 (*dose.*) — document coordinates; the re-read served from the cache (per-input counts unchanged). `repositionTo` must be called on the WAIVED manager | — |
| `15-item8-edit-playing.js` | Item 8, playing: sentence 2 before *levels*, the IL-6 row's Read as written straight to the document pref (`{rows, ts: now}`) + pulse | `lastEdit.outcome` `handoff`, `changed` [1, 4], `report.last.kind` `word` at `lastCharStart` 5, `held['1']` the new text; requests again only for the changed sentences (`interleukin 6 v3 levels…`, `Anti interleukin 6 v3 therapy…`) — unchanged held sentences not re-requested. An edit whose content is already in effect gives `none` | — |
| `16-item8-edit-paused.js` | Item 8, paused: the same edit while paused, then Play | Paused edit: `handoff`, stage `preparing`; Play (repositionTo(1)) commits `kind` `sentence`, `held['1']` the new text; with a never-requested Read as the log gains its request (playedNewText true) | — |
| `17-item9-zotero-voice.js` | Item 9: Zotero's Standard tier enabled for the check (owner's off-switch restored), a standard voice picked while paused, `Zotero.Sync.APIClient.prototype.getReadAloudAudio` stubbed (records the segment, answers a silent WAV + speech-coordinate word timestamps, never forwards) | `stubCalls[0].text` = the replaced text (the copied segment); the manager's `activeTimestamp` in document coordinates (0–4 over IL-6 … 34–39); no paid request; stub + tier switch restored in `finally`. The owner had BOTH Zotero tiers switched off — item 9 needs the temporary enable | — |
| `98-restore-prefs.js` | Item 11, part 1: session closed, fixture tab closed, owner's tab reselected, prefs restored in the baseline's order (rows first — the refresh reverts the owner's reading; `readAloud.memory` LAST), the owner's revert recorded | Owner reader (active paused session, left alone): held 832 forgotten, `lastEdit` {dropped, [832]} — the replaced clip is out of the reading; rows restored; local/defaultVoice/readAloudVoices/volume 19/layout/memory verbatim | — |
| `99` (inline, see the 2026-11-03 run) | Item 11, part 2: `item.eraseTx()`, position rows back, WebDAV confirmed, debug store off, host minimized, `run.reset()` | rows 77 = baseline; folder false; `windowState` 2; reset {busy: false} | — |
| `fake-kokoro-server.mjs` | The word-timed voice + the request log (one JSON line per synthesis: path, voice, chars, the input TEXT). Node, outside Zotero: `ZTTS_FAKE_PORT=8792 ZTTS_FAKE_LOG=<abs .tmp/zotero-dev/replacements/fake-kokoro.log> node fake-kokoro-server.mjs`; stop with SIGTERM | Voices default `af_bella`; `/dev/captioned_speech` answers base64 WAV + word timestamps; about 0.05 s per input character | — |

## Before you start

- Build and bridge: install the xpi, `zotero_plugin_list` shows `-betaN`, then
  `diagnostics.startup()` — every step `ok`, `failed` empty, and
  `typeof Zotero.ZoteroTTS.diagnostics.replacementsPreview === 'function'`.
  `diagnostics.replacements().windows` must be a `chrome://zotero-tts-instance-…/content/` address.
- WebDAV first (the run is not about WebDAV): snapshot the folder switch
  privately, switch it off, confirm `positionSync()` has `"folder": false`,
  re-confirm after the install, restore at the end.
- Snapshot the named prefs (00 does): `readAloud.replacements`, every
  `documentReplacements.*`, `documentReplacementsChanged`, `readAloud.defaultVoice`,
  Zotero's `extensions.zotero.reader.readAloudVoices`, `readAloud.playerLayout`,
  `readAloud.volume`, `readAloud.speedPercent`, `readAloud.memory` (raw, restore last),
  `local.enabled`/`local.engine`/`local.baseURL`/`local.voice` (headers → set/length only),
  `documentVoices.*`, `reader.readAloud.highlightGranularity`, `readAloud.stripAngleBrackets`,
  and close the settings window before installing (an upgrade keeps the old pane).
  Gecko's typed getters answer a wrong type without throwing — check
  `getPrefType` first (an int pref read as bool returned false, 2026-11-03; the muted
  volume had already been flushed to prefs.js, so the original came from the previous
  run's verified cleanup — record such a recovery in `state.baseline.volume.recoveredFrom`).
- State it touches: the prefs above; the fixture's `documentVoices.user/KEY` record and
  reading-position row (created by reading; removed by `item.eraseTx()` —
  `Zotero.Items.eraseTx` does not exist); the fixture item itself; `local.enabled` +
  `local.baseURL` while the fake server serves; `zotero-standard.enabled` for item 9.
- Voices: the fake Kokoro server (word-timed, silent, machine-independent). A voice
  pick on an idle manager does not survive activation: plant `documentVoices.user/KEY`
  on an idle tab (04). The autoplay gate needs a trusted Shift+Space (`nsITextInputProcessor`).
- Modal windows (07's header has the full pattern): ONE modal action per bridge call.
  `openReplacementsWindow(index)` returns at once (its setTimeout opens the window);
  `add.doCommand()` and the Player's `.replacements` click run `openDialog('modal')` on
  the eval's own stack — the call parks with its reply lost; drive the open modal from
  the NEXT call (fresh evals run inside the modal loop, synchronous steps only —
  no `await`, no setTimeout: they stall until the loop exits); closes and writes land on
  later tasks: verify in the next call. A fire-and-forget drawSnapshot chain works inside
  the loop (never await it); the MCP `zotero_screenshot` on the modal window's id works too.
- Cleanup: session closed (`toggleReadAloudPopup(false)`), fixture tab closed,
  owner's tab reselected, prefs restored in the baseline's order, memory last,
  `item.eraseTx()`, position row verified by count, debug store off, host minimized,
  `run.reset()`, fake server SIGTERM'd.

## Limits

- 2026-11-03 (beta2): `repositionTo` through the UNWAIVED manager loses its argument
  (the session repositioned to the last segment); call `Components.utils.waiveXrays(m).repositionTo(i)`.
- 2026-11-03 (beta2): `repositionTo` resumes playback by itself; `toggleReadAloudPaused`
  then PAUSES it (a toggle, not a play verb).
- 2026-11-03 (beta2): a handoff left `preparing` by an early pause commits on the next
  resume — a later watch can mistake the stale `lastEdit` record for a new edit; gate on
  `lastEdit.at` > the write's timestamp.
- 2026-11-03 (beta2): the audio cache erases the request-count evidence when the new text
  was played before — for "Play reads the new text" edit to a never-requested Read as.
- 2026-11-03 (beta2): the bridge's console actor drops for 10–25 s after parked evals and
  modal closes — wait and retry, do not repeat writes.
- 2026-11-02 (beta1): `Zotero.Items.eraseTx` is not a function — use `item.eraseTx()`;
  `frameElement` reads null from chrome (shoot the host window's region); a reader-realm
  `new Event(type, {bubbles})` needs `Cu.cloneInto`; a stray click while the selection popup
  is open can plant a highlight annotation (the fixture erase removes it).

## Runs

- 2026-11-03, build `1.16.17-beta2` (branch `xujialiu/issues237` at `1c9d9bb`, xpi SHA-256
  `a6eefcb3a53aed2355e192c5ba576d1445c70a3f0b8b6ec9b0a37d91839a9b07`), second live pass,
  items re-driven on this build: startup gate, item 2 (three layouts measured + title),
  items 3–4 (the dialog flow as the one-call-per-modal-action sequence: fields, the Match
  menulist exactly `[exact, regex]` — the build proof —, the four refusals with exact
  messages, accepted rows at the ends of their lists, OK writes both prefs + pulse 0→1,
  Cancel byte-identical; window from the Player click with the fixture's rows above the
  global ones), item 5 (five speech texts verbatim, 1–11 ms, workers 1), item 6 (request
  text + highlight 0–4 over IL-6 + cache re-read), item 7's mechanism (520 ms, timedOut [4],
  speech unchanged, bridge 0 ms, timeouts 0→2 / workers 1→3), item 8 (playing: handoff,
  kind word at charStart 5, changed [1,4], only changed sentences re-requested; paused:
  handoff → Play commits kind sentence and reads the new text; a content-identical edit:
  none), item 9 (copied segment with the replaced text, timestamps mapped to document
  coordinates, no paid request, stub + tier switch restored), item 11 (everything restored,
  rows 77 = baseline, host minimized). Items 1 (pane half), 5, 7-mechanism ran late in the
  pass as direct calls after the revival instruction to skip them was found to contradict
  the disk evidence (no item 1/5/7 results existed for beta2). NOT RUN on beta2: item 1's
  global-window half and item 7's Player `!`/red row (both need a modal window or the
  reading session, both barred late in the pass — proven on 1.16.17-beta, code paths
  unchanged by `e876e33`/`94c7173`). Item 10 human checks: the row-dialog and
  window-from-the-Player screenshots refreshed under `.tmp/zotero-dev/replacements/`
  (the window shot shows "Regular expression, an…" truncating in the Match column — the
  plain "Regular expression" fits whole; the any-case variant is longer than the mode name
  the column was widened for). Item 11 included a second fixture cycle for the window
  screenshot; both cycles erased, rows 77 after each. Every snapshot restored; WebDAV was
  found off and left off; the host left minimized.
- 2026-11-02, build `1.16.17-beta` (at `342264a`), first pass: items re-scoped to
  mechanisms only; startup gate + item 1 + item 5 (regex) + item 7 (mechanism + Player `!`
  + window red row) PASS; item 2 PASS except the case's 2 px adjacency (measured 8 px =
  the bar's flex gap); items 3, 4, 6, 8, 9 skipped by the scope change; item 11 done.
  Superseded: `13-item2-screenshots.js` (the brief now scopes the screenshots to the row
  dialog and the window from the Player, taken inside the modal flow).
