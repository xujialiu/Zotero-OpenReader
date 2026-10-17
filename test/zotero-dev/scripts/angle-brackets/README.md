# Scripts: 3g. Enclosing brackets (issues #94, #96, #101, #127, #189)

[Case](../../cases/angle-brackets.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Bridge snippets (`zotero_execute_js`, or the [shared runner](../_shared/README.md)). Four
sequences: `pairs-` (base + configurable list, Fish voice), `groups-` (several groups, Kokoro),
`sentence-` (a pair in a sentence, #127, Fish, runner `params`/`state`), `ab-` (item 4's session
setting and the #189 reopen, inside a larger run owning baseline and cleanup). Reusing
`pairs-`/`groups-` means adapting their literals to the run.

## Before you start

- **Build and bridge.** Read `.agents/zotero-tester.md` and the case first; `zotero_ping`, install
  in place, `diagnostics.startup()` `ok` with `failed: []`; never run while another agent drives
  Zotero or an owner's reader plays.
- **Fixture.** Every sequence uses `test/fixtures/angle-brackets/angle-brackets.epub`
  (`build.py`), each a fresh standalone import. No voice id is hard-coded; readers are found by
  item id, never index.
- **`pairs-`/`groups-` hard-code an old fixture item id** — open the script named below to find
  and replace it; `groups-17` rewrites its restoration values from `groups-01`'s own output.
  Settings window: `pairs-08`–`11` and `pairs-17` need it on the OpenReader pane
  (`zotero_open_preferences` before `pairs-08`); reopen after an in-place install. Settings carry
  within a sequence (`pairs-13`→`14`, `pairs-17`→`18`–`21`, `groups-10`→`14`).
- **Runner state.** `sentence-` reads `state.baseline`, `fixtureItemID`, `voiceID`, `segments`,
  `segmentShapesBefore`, `segmentsOff`; `params.fixturesDir` — nothing to edit. `ab-` shares the
  run around it (2026-10-17: the document-voices run — baseline, mute, WebDAV, cleanup):
  `state.fixtures.B`; `ab-01` closes the sibling fixture's player; between `ab-01`/`ab-02` open
  the player and pause it (that paused session `ab-02` resumes).
- **Providers and spend.** `pairs-`/`sentence-` need a remembered Fish voice (captures read the
  request body's `text`); `groups-` needs Kokoro (`input`). Confirm the voice id contains `::`
  before any player opens, or stop; player opens synthesize muted. **Force `cacheAudio` off
  before a probe that must prove request text**: cached text is served with no fetch otherwise
  — a silent false negative (`sentence-11`/`-12`).
- **The owner's readers.** Only the fixture's reader opens, plays, stops or closes. Native stubs
  borrow the reader prototype from another already-open reader (paused, untouched); open no other
  tab while a stub runs.

## Run order

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `pairs-01-baseline.js` | Snapshots the named prefs with user-value flags (memory as kind and flag only), readers, settings window, debug store and position store, into a baseline global | setup | A JSON snapshot with no memory value or secret; the owner's readers as found |
| `pairs-02-mute-sync-off.js` | Turns off position sync, settings sync and settings upload, sets volume 0, enables the setting with `<> []`, debug store on | setup | The three switches `false`; volume `0` with a user value; setting `true`; list `<> []`; `debugStoring: true` |
| `pairs-03-fixture-import.js` | Imports the fixture EPUB | setup | A new item ID and key, the given title, `attachmentEPUB` |
| `pairs-04-fixture-open.js` | Opens the fixture's reader | setup | `called: true` |
| `pairs-05-fixture-readiness.js` | Polls for the fixture's internal reader, manager and remote interface | setup | The fixture row with `internal`, `manager` and `remoteInterface` all `true` |
| `pairs-06-audio-motion-probe.js` | Opens the fixture's player, traces its state and audio clock, pauses it | setup | Active on the intended plugin voice, then paused; `audioState`, `audioTime` and `position` recorded |
| `pairs-07-audio-clock.js` | Reads the audio clock twice 500 ms apart, then pauses | setup | `clockMoved: true` lets playback checks run; `suspended` at `0` twice makes playback NOT TESTABLE (machine); `stopped: true` |
| `pairs-08-ui-initial.js` | Opens the OpenReader pane and reads the checkbox, the pair input and the help | 1, 9 | Checkbox `ztts-strip-angle-brackets` checked, `preference: null`; input `ztts-bracket-pairs` holds `<> []`, disabled; label and help as the case words them |
| `pairs-09-ui-validation-dialogs.js` | Unchecks the setting, then tries empty list, `aa`, `<> <>` (Cancel) and `<> <>` (Use defaults) | 9 | Each try opens the plugin notice with its own message (empty list, invalid pair, duplicate pair); Cancel keeps the draft and the switch off; Use defaults writes `<> []`, checks and locks |
| `pairs-10-ui-entry-errors.js` | Tries `<` and `**` answering Cancel, then enables `<> []` | 9 | Both show the invalid-pair message; Cancel keeps the draft; `restored` checked, `<> []`, locked |
| `pairs-11-external-refresh.js` | Writes the list and the setting from outside the pane | 9 | Every write updates both controls: `() 【】` while locked, off and unlocked, `<> []`, on and locked |
| `pairs-12-text-settings-snapshot.js` | Reads `diagnostics.textSettings()` for every reader and the fixture | 4, 9 | Every entry `patched`, `configured` and `effective` `true`, pairs `<> []`; the fixture active and paused |
| `pairs-13-active-opt-out-request.js` | Turns the setting off during the paused session, captures a real request for `<Hello> [World]` | 2, 4 | `configured: false` with `effective: true`; request text `Hello World`; `Hello` [1,6], `World` [9,14]; the setting stays off |
| `pairs-14-stop-reopen-effective.js` | Stops and reopens the fixture's player, then pauses | 4 | Inactive after the stop, active after the reopen, then paused; fixture `configured: false`, `effective: false` |
| `pairs-15-reactivate-defaults.js` | Turns the setting on, stops and reopens the player | 4 | `configured: true`; fixture `effective: true` with `<> []`; active and paused |
| `pairs-16-default-provider-request.js` | Captures a real request for a frozen `<Hello> [World]` segment, cache and prefetch off | 2, 3, 9 | One request `Hello World`; ranges [1,6], [9,14]; `sourceUnchanged: true` |
| `pairs-17-ui-set-custom-pairs.js` | Unchecks, types `【】 ()` and re-enables in the pane while paused | 9 | Enabled checked and locked; `configuredPairs` `【】 ()`, `effectivePairs` still `<> []` |
| `pairs-18-reactivate-custom.js` | Stops and reopens the player | 9 | `effectivePairs` `【】 ()`; active and paused |
| `pairs-19-custom-provider-request.js` | Captures a real request for a frozen `【Hello】 (World)` segment | 3, 9 | One request `Hello World`; ranges [1,6], [9,14]; `sourceUnchanged: true` |
| `pairs-20-custom-cache-repeat.js` | Requests `【Hello】 (World)` twice, cache on, prefetch off | 3, 9 | `callCount: 1`; equal audio sizes; `sameTimestamps: true` |
| `pairs-21-custom-prefetch.js` | Plants a two-segment list, requests the anchor with prefetch on, then the next segment; restores the controller | 3, 9 | Requests `Prefetch anchor with two groups` and `Prefetch next sentence.`; `nextPrefetched: true` |
| `pairs-22-reactivate-defaults-for-mixed.js` | Writes `<> []` and the setting on, stops and reopens the player | 9 | `effective: true` with `<> []`; active and paused |
| `pairs-23-mixed-malformed-requests.js` | Captures real requests for `<[Hello]> [<World>]` and `<[Hello>]` | 2, 9 | **Superseded by #127** (now `Hello World` / `Hello` via `sentence-07`) — rerun before reusing its PASS |
| `pairs-24-empty-pairs.js` | Requests `<> []` | 5, 9 | `calls: []`; a 6444-byte WAV with one whole-segment timestamp [0,5] |
| `pairs-25-native-stub.js` | Closes the fixture, stubs the reader prototype's native interface, reopens, requests Standard, Premium, sample and an error; restores and closes | 6, 9 | `patchRestored: true`, `errors: []`; the stub gets `Hello World` and `“World!”` with `lang`, `paragraphStart`, `sourcePosition`; ranges [1,6], [9,14], [2,7]; error `native-network` with `noStore: true` |
| `pairs-26-cleanup-restore.js` | Closes and erases the fixture, restores prefs and debug store from the baseline global with memory last, closes the settings window, compares | 7 | `fixtureErased: true`; no fixture reader; `readersMatchBaseline: true`; every `finalPrefs` entry `matchesBaseline: true` |
| `groups-01-baseline.js` | Snapshots the named prefs with user-value flags, readers, settings window, debug store and position store; no global | setup | A JSON snapshot, kept privately for `groups-17` |
| `groups-02-mute-sync-off-import.js` | Sync switches off, volume 0, setting on, imports the fixture | setup | Switches as set; volume `0`; a new item ID, key and title |
| `groups-03-fixture-open.js` | Opens the fixture's reader | setup | `called: true` |
| `groups-04-fixture-readiness.js` | Polls for the fixture's internal reader and manager | setup | The fixture row with `internal` and `manager` `true` |
| `groups-05-source-positions.js` | Opens and pauses the player, compares segments with the fixture's texts, positions and CFIs | 2, 8 | `segments.count: 7`, `unchanged: true`; paused; `textSettings` `patched`/`configured`/`effective` `true` |
| `groups-06-provider-requests.js` | Captures real requests for the three-group source and seven edge cases, cache and prefetch off | 2, 8 | Inputs `Log in Register Play as guest`, `“A”, B!`, `<A> B`, `<A> <B>` and the unchanged rest; slices `Log`, `in`, `Register`, `Play`, `as`, `guest` at [1,4], [5,7], [10,18], [21,25], [26,28], [29,34]. **Superseded tails by #127** — `sentence-07` reconfirms them directly |
| `groups-07-cache-repeat.js` | Requests the three-group source twice, cache on | 3, 8 | No fetch for the second; equal audio sizes; `sameTimestamps: true` |
| `groups-08-prefetch.js` | Plants a two-segment list, anchor with prefetch on, then the next segment | 3, 8 | Inputs `Prefetch anchor with two groups` and `Prefetch next sentence.`; no fetch for the next; `restoredSegments`/`restoredPosition` `true` |
| `groups-09-empty-pair.js` | Requests `<>`, prefetch off | 5 | A 6444-byte WAV; `calls: []` |
| `groups-10-opt-out-configured.js` | Turns the setting off, reads `textSettings()` | 4, 8 | `configured: false`, `effective: true`, `active: true`; the setting stays off |
| `groups-11-stop-player.js` | Stops the fixture's player | 4 | `error: null`, `active: false` |
| `groups-12-reopen-player.js` | Reopens and pauses the player, reads `textSettings()` | 4, 8 | Active, then paused; fixture `configured: false`, `effective: false` |
| `groups-13-opt-out-original-request.js` | Captures a real request for the three-group source in that session | 4, 8 | `configured: false`; one input equal to `<Log in> <Register> <Play as guest>` |
| `groups-14-opt-in-cache.js` | Stops, setting on, reopens and pauses, requests the source again | 4, 8 | Fixture `effective: true`; the six slices and ranges of `groups-06` |
| `groups-15-native-stub.js` | Closes the fixture, stubs the native interface, reopens, requests the three-group source on Standard; restores and closes | 6, 8 | `patchRestored: true`, `errors: []`; the stub gets the six slices/ranges of `groups-06` with `lang`, `paragraphStart`, `position`, `sourcePosition`; `sourceTextAfter` the original |
| `groups-16-empty-groups.js` | Reopens the reader if needed, requests `<> <   >` with prefetch off | 5, 8 | A 6444-byte WAV, timestamp [0,8]; `calls: []`; prefetch restored. It waits 500 ms after opening: an interface error means rerun once the reader is ready |
| `groups-17-cleanup-restore.js` | Closes and erases the fixture, writes fixed restoration values from `groups-01`'s own output (see Cleanup) | 7 | `fixtureErased: true`; `remaining` holds only the baseline readers; prefs, debug store and position store equal to `groups-01` |
| `sentence-01-baseline.js` | Snapshots the named prefs (incl. `fish.enabled`/`fish.freeOnly`), readers, settings window, debug store and position, into `state.baseline` | setup | A JSON snapshot; no memory value or secret |
| `sentence-02-setup-import.js` | Mutes, sync off, default list, `prefetchEnabled` off, debug store on, imports the fixture | setup | Switches as set; a new item id/key/title; `state.fixtureItemID` |
| `sentence-03-open-ready.js` | Opens the fixture reader, polls for internal/manager/remote interface | setup | `ready: true` |
| `sentence-04-activate-segments.js` | Opens the popup (fetch-wrapped), pauses once 11 segments exist, reads `manager.segments` by index (never `.map()` — reader-realm array) | 2, 10 | `first7Unchanged: true`; `last4Match: true`; the natural first request `[Speak in American English] Hello world.` |
| `sentence-05-item2-fox-request.js` | Direct `getAudio` on the real fox-sentence segment, cache/prefetch off | 2 | Request `“The quick brown fox jumps over the lazy dog!”`; `sourceUnchanged: true` |
| `sentence-06-item5-empty-pair.js` | Direct `getAudio` on the real `<>` segment | 5 | `calls: []`; 6444-byte WAV, timestamp [0,2]; `sourceUnchanged: true` |
| `sentence-06b-comparison-and-unmatched.js` | Blocked-fetch direct calls on the real "comparison" and "unmatched-bracket" segments | 2 | Both requested unchanged |
| `sentence-07-item3-nine-strings.js` | Blocked-fetch direct calls for 9 synthetic strings (#127's changed item 8/9 examples) | 8, 9 | All 9 match: `A B`, `A <B`, `A> B`, `A and B`, unchanged `a < b > c`, `Hello World`, `Hello`, unchanged `x <= 5 and y >= 3`, `Warning: HP < 10%` |
| `sentence-08-fireball-and-levelup.js` | Real requests for the Fireball and Level-Up segments, cache on (first-ever text), prefetch off, with a debug-store diff | 10 | Texts match; ranges `Fireball` [9,17], `Level` [1,6], `Up` [7,9]; debug lines "removed 2 … from 31/30 chars" |
| `sentence-09-fireball-cache-repeat.js` | Repeats the Fireball segment, cache on | 10 | `noSecondRequest: true`; `Fireball` slice unchanged at [9,17] |
| `sentence-10-gained-and-ifx.js` | Real requests for the Gained and Ifx segments, cache on | 10 | Gained: `You gained  100 exp today.` (two spaces) with a debug line; Ifx: sent as written, no debug line |
| `sentence-11-setting-off-reopen.js` | Setting off, stops/reopens the session, blocked-fetch calls (cache forced off) on all four target segments | 10 | `effective: false`; all four unchanged (with brackets) |
| `sentence-12-setting-on-reopen.js` | Setting on, stops/reopens, blocked-fetch call (cache forced off) on Fireball | 10 | `effective: true`; `He cast Fireball at the wolf.` |
| `sentence-13-cleanup-restore.js` | Closes/erases the fixture, restores prefs (incl. the two fish prefs) from `state.baseline`, memory last | 7 | Every `finalPrefs` entry `matchesBaseline: true`; readers, position and settings window match the baseline |
| `ab-01-import-epub-textsettings.js` | Closes the sibling fixture's player, imports the EPUB, opens the reader, forces `cacheAudio` off, reads `textSettings` before the tab's first session | 4 setup | New item id/key (`state.fixtures.B`); `ready: true`; fixture entry `patched`, `configured`, `effective` `true`, pairs `<> []` |
| `ab-02-session1-capture.js` | Resumes the paused first session under a `fetch` wrapper, captures requests, pauses, restores the wrapper | 4 | Captured `input` texts of the stripped requests; session paused again |
| `ab-03-switch-off-reopen.js` | Switches the setting off with no active session, reopens, plays under the wrapper, reads `textSettings`, pauses | 4 (#189 reopen) | Fixture `configured: false` and, after the reopen, `effective: false`; captured `input` keeps the brackets |
| `ab-04-switch-on-reopen.js` | Switches the setting on while paused (`effective` still false), closes, reopens, plays, reads, pauses | 4 (#189 reopen) | `midRow` `effective: false`; after the reopen `effective: true`; captured `input` stripped |
| `ab-05-pairs-reopen.js` | Rewrites `readAloud.bracketPairs` to `()` while paused, closes, reopens, plays, reads, pauses | 4 + effectivePairs reopen | `rowPaused` `configuredPairs` `()` with `effectivePairs` `<> []`; after the reopen `effectivePairs` `()` |

## Cleanup

- **Probes first.** Every capture restores its `fetch` wrapper and planted values in `finally`;
  stubs restore the reader prototype and close the fixture there. Confirm `patchRestored: true`
  (`pairs-25`, `groups-15`) before anything else.
- **Order.** Fixture first: close, erase, confirm its position row is gone. Then prefs in the
  tester workflow's order — volume, the setting, the pair list, cache, prefetch, settings sync,
  position sync, settings upload, debug store, `readAloud.memory` last (`pairs-26`,
  `sentence-13`). `groups-17` rewrites fixed values from `groups-01`'s own output and turns the
  sync/upload/debug switches back **on** — confirm against its own baseline first.
- **Must end identical** against the *original* baseline even after a failure — every named
  pref's value and user-value flag, `readAloud.memory` (equality only, never printed), the
  owner's readers, position store, debug store, fixture gone; then `zotero_read_errors` with
  nothing unexplained carrying `[zotero-tts]`/`zotero-tts.js`.

## Limits

- **Machine audio.** AudioContext stayed `suspended` at `currentTime` 0 in every run: continuous
  playback and the moving highlight are NOT TESTABLE; sound/highlight pace are human checks.
- **Direct interface, not segmentation.** Most strings go straight to the remote interface:
  proof of request/ranges, not Zotero's segmentation; `groups-05`/`sentence-04` read real
  segments instead.
- **Native voices** (`pairs-25`, `groups-15`) are stubs, not Zotero's synthesis. Live-locale
  switch, Chinese labels, backup/restore/sync: unit tests only.
- **Provider timing and dialogs.** Fish's word-timing granularity is not a bug (`pairs-23`,
  `sentence-09`); `pairs-09`/`-10` return the notice's whole `textContent`. Item 2's language cue
  is isolated in the fish-language-hints kit.
- **Unit-only edges.** Nested/punctuation-adjacent pairs, fullwidth brackets, UTF-16 mapping,
  immutable cached timestamps, concurrent cache/prefetch and, since #127, deeper nesting/crossing
  and math-sign edges beyond `sentence-07`'s nine. `pairs-26` always closes the settings window —
  reopen and reselect the pane if `navigateToPane` times out.

## Runs

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-13-1.12.4-beta2 | 1–7 PASS (#94); continuous playback NOT TESTABLE (machine audio); live Chinese locale not switched | issue comment (2026-09-13, 1.12.4-beta2) |
| 2026-09-13-1.12.5-beta4 | 8 PASS (#96) through the direct interface; playback/highlight NOT TESTABLE (machine audio) | issue comment (2026-09-13, 1.12.5-beta4) |
| 2026-09-13-1.12.6-beta3 | 9 PASS (#101); audio progression NOT TESTABLE (machine audio); listening/highlight NOT TESTABLE (human, device) | issue comment (2026-09-13, 1.12.6-beta3) |
| 2026-09-13-1.12.7-beta-manual-follow | 9 controls only (present, checked, `<> []`, locked) — PASS; script in the [manual-follow kit](../manual-follow/README.md) | issue comment (2026-09-13, 1.12.7-beta manual-follow) |
| 2026-09-22-1.13.2-beta7 | 2, 3, 5, 10 PASS via `sentence-`; item 8/9's nine changed strings PASS via `sentence-07`; machine audio still NOT TESTABLE; listening and highlight pace remain human checks | issue #127 closing comment |
| 2026-10-17-1.16.11-beta3 | Item 4 + the effectivePairs reopen PASS via `ab-01`–`ab-05` (#189): a switch or pair-list change made after the tab's first Reading session takes effect at the next reopen in that tab (`effective` follows `configured`; `effectivePairs` `()`), while a session already open keeps its snapshot | [Field-by-field verification table](https://github.com/xujialiu/Zotero-OpenReader/issues/189#issuecomment-6234662721); the run shared the document-voices run's baseline, mute, WebDAV isolation and cleanup |
