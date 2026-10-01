# Scripts: Audio that arrives after its tab closed is dropped (issue #116, #165)

[Case](../../cases/late-audio.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Runner](../_shared/README.md)

## Scripts

Run through `_shared/run.js` (`kit: 'late-audio'`). `00`/`00b` are quick enough
for `one()`; `01`–`06` each open a reader and poll live provider calls, so they
belong in a group, never a bare `zotero_execute_js`. `70` runs alone BEFORE the
install; `95` runs alone after `90`.

| Script | Checks | Expects (measured; date + build) | Params/state |
| --- | --- | --- | --- |
| `70-webdav-isolate.js` | "Test WebDAV first" opener, before the install: typed WebDAV snapshot, transports settled, the three switches suspended, `webdav.url` → `~/.secrets/Zotero-TTS/test_webdav.txt` (match result only), host minimized, debug store armed | `destinationMatched`, `switchesSuspended`, `transportsSettledBefore`, `hostMinimized` all true (2026-10-01, 1.16.4-beta4; executed from `.tmp` as `00-isolate-and-baseline.js`) | writes `state.isolate` |
| `00-baseline-and-mute.js` | Snapshots the touched prefs (+ `readAloud.defaultVoice` since 2026-10-01, `mimo.enabled`), the console's pre-existing dead-object entries, debug store state, `lateResults` at start; mutes (volume 0), enables local (Kokoro), memory → `local::af_bella` | Applies its own state; `readersOpen` reported, not asserted | writes `baseline`, `fixtures` |
| `00b-mimo-override.js` | Run AFTER `00` when the chosen provider must be Xiaomi MiMo (this h200's Kokoro answers too fast to catch, 2026-09-16): enables MiMo, memory AND `readAloud.defaultVoice` → `mimo::mimo_default` (a NEW document reads defaultVoice, not memory) | `mimo.enabled: true`, both voice prefs updated | reads `baseline` |
| `01-item1-close-x.js` | Item 1: imports fixture-a fresh, plays, lets segment 0 resolve, repositions the live controller to the longest segment, resumes, closes ~250 ms later the × way (`reader._window.Zotero_Tabs.close`) | With MiMo: `droppedRise: 1`, `getAudioRise: 1`, one drop line, zero new dead-object entries (2026-09-16, 1.12.11-beta5). Pre-Engine path | writes `fixtures.a`, `item1` |
| `02-item2-prefetch-chain.js` | Item 2, issue #166 shape (REWRITTEN 2026-10-01; the previous version hunted the plugin's old warm chain — `ready ahead of playback` / `stopped, the reader is gone` lines a #166 build no longer has). Custom prefetch 10 ahead / 1 at once, fresh fixture-a on an uncached local voice, polls `session.prefetch.open >= 1` with position ≤ 2, closes the tab the × way at once | No provider request after the close beyond the one open at it (exactly one synthesis line in the debug delta), and the Engine's `late audio dropped: its reader window was gone` line up by that one (`patches().lateResults.dropped` is the window-wrapper's counter and may stay flat — the Engine drops its own result first); no `can't access dead object`. On a WARM cache the catch can land on a cache-hit slot whose answer races the window teardown (see Limits) | `root`; reads the 166 session (`Zotero.__ztts166` — the prefetch-cache kit's `00`); writes `item2` + `fixtures` (both states) |
| `03-item3-erase-path.js` | Item 3: imports fixture-b fresh, plays, repositions, `toggleReadAloudPopup(false)` ~300 ms later, `eraseTx()` ~300 ms after | With MiMo: `droppedRise: 2`, two drop lines, zero new dead-object entries (2026-09-16) | writes `fixtures.b`, `item3` |
| `04-item4-quiet-close.js` | Item 4 (control): reopens `fixtures.a`, opens+closes the popup at once, waits ≥5 s AND until the fixture's Engine `store.inflight == 0` (≤30 s — revised 2026-10-01; the old fixed 7 s closed the tab with a slow getVoices listing in flight), then closes the tab | `droppedRise: 0`, `dropLines: []` of either form, `inflightAtClose: 0` (2026-10-01, 1.16.4-beta4) | reads `fixtures.a`; writes `item4` |
| `05-item5-playback-normal.js` | Item 5: reopens fixture-a, plays normally, polls `_controller._currentIndex` | `_currentIndex` stuck at 0 for 30 s (script-started AudioContext suspended, pre-Engine); `droppedRise: 0`, `readyAheadLines: 1` (2026-09-16) — superseded by the Engine; item 5's advance now goes through `diagnostics.engine()` | reads `fixtures.a`; writes `item5` |
| `06-item6-engine-late.js` | Item 6 (issue #165): imports `params.fixtureFile` fresh, warms the provider catalog (`diagnostics.defaultVoice()` — one listing, shared with the manager), restores+focuses the host, ONE trusted Shift+Space (TIP on `reader._iframeWindow`), polls `diagnostics.engine()` until the first in-flight `getAudio`, closes the × way ~`params.lateDelayMs` (250) ms after THAT dispatch, waits ≤20 s for the drop line | With MiMo (2026-10-01, 1.16.4-beta4): press→dispatch 596 ms, `atClose` `requests: 1, inflight: 1, voice mimo::mimo_default, audio running`; `dropLineCount: 1` (~1.3 s after the close); `lateResults` UNCHANGED; zero new dead-object console entries; reader gone from `_readers` and `engine()` | `fixtureFile`, `fixtureState`, `lateDelayMs`; reads `baseline`; writes `fixtures.<fixtureState>`, `item6` |
| `07-item7-voices-late.js` | Item 7 (issue #165, beta5): imports `params.fixtureFile` fresh, opens it, opens the player with `toggleReadAloudPopup(true)` into the COLD catalog — NO warm-up; must run right after the install (`startup()`→`00`→`00b` only, they warm nothing) — closes the × way `params.closeDelayMs` (default 1000) ms after the open, waits ≤`params.waitMaxMs` (30 s) for the answer; metered-voice guard while the tab lives | With MiMo cold (2026-10-01, 1.16.4-beta5): close +1053 ms after the open, manager `active: false` throughout; the merged list landed ~21.7 s after the open (Zotero's own voices timed out at their designed 20 s, MiMo's half ~21 s cold); `getVoicesRise: 1`, `droppedRise: 1`; one `voice list not planned: its reader is gone` 13 ms after the 20 s line, one drop line 1 ms later; zero plugin dead-object entries (Zotero's own `reader.js:1758` at the close only); no synthesis, nothing paid | `fixtureFile`, `fixtureState` (default `'a'`, so `04` reopens this same item), `closeDelayMs`, `waitMaxMs`; reads `baseline`; writes `fixtures.<fixtureState>`, `item7` |
| `90-cleanup-restore.js` | Closes/erases whatever is left in `state.fixtures`, restores every touched pref byte-exact (incl. user-value state; `readAloud.defaultVoice` before `readAloud.memory`, memory last), restores `reader.readAloudVoices`, `Debug.storing`, the selected tab | All restored (2026-10-01); safe to run twice | reads `baseline`, `fixtures` |
| `95-webdav-restore.js` | Closer, after `90`: restores `webdav.url` + the three switches from `state.isolate` byte-exact, only then lets transports run, confirms the destination matches the original, reads the final ring + console dead-object delta, minimizes the host | `urlMatchesOriginal`, `transportsSettledAfter`, `hostMinimized` true (2026-10-01; executed from `.tmp` as `99-webdav-restore-and-final.js`) | reads `state.isolate` |

## Before you start

- Build: `zotero_plugin_list` + `diagnostics.startup()` (every step ok). Identity
  is in the bundle, never the version string (beta3/beta4 built the same day):
  the installed bundle contains `tinySegmentText(originalText)` and contains no
  `prefetchAfter(` — the plugin installs packed, so read it through the addon's
  `getResourceURI('content/zotero-tts.js')` jar: URL and hash it.
- Order: `70` (isolate) → install → `startup()` → identity → `00`, `00b` →
  `07` (catalog must still be COLD — never after `06`, whose warm-up is exactly
  what `07` must not see) → `04` → `90` → `95` (restore). Reset
  `Zotero.ZoteroTTSRun` (`Zotero.ZoteroTTSRun.api.reset()`) if you can at the end.
- Fixtures: `fixture-a.pdf` (17 segments; segment 0 is 31 chars, longest 132)
  and `fixture-b.pdf` (6 segments; longest 105), imported fresh per item,
  standalone, erased by `90`.
- **Provider**: MiMo first on this h200 (Kokoro's getAudio answered under 300 ms
  even cold, five attempts, 2026-09-16). MiMo's OWN first getVoices listing
  gates the manager's activation — ~8.4 s in the 2026-10-01 beta4 run 2, ~21 s
  cold on beta5 (the merged answer also waits out Zotero's own 20 s native
  timeout) — `06` warms it and anchors the close to the dispatch, never to the
  press; `07` needs it cold and closes ~1 s after the popup open.
- **This Zotero build precomputes no read-aloud segments on open** (`m._segments`
  and `_readAloudSegments` absent on an idle reader, owner's included,
  2026-10-01): do not wait for them before starting; `06` waits for the reader
  iframe's readiness instead. A script-started session's output stays
  suspended — item 6 starts with a trusted Shift+Space (§6); its `audio.state`
  read `running` live.
- A new document reads `readAloud.defaultVoice`, not `readAloud.memory`: point
  both at the chosen voice (`00b` does).
- The audio cache is text+voice-keyed, in-process, outlives a fresh import; an
  in-place reinstall of the same xpi is the way to a cold cache and resets
  `lateResults`.
- State touched, all restored by `90` (+ `95` for WebDAV): `readAloud.volume`
  (0 for the run), `readAloud.memory`, `readAloud.defaultVoice`,
  `local.enabled`, `mimo.enabled`, `reader.readAloudVoices` (a fixture rewrites
  its `en` entry; MiMo's selectVoice rewrites it regardless of the plugin),
  `prefetch`/`prefetchEnabled` (item 2 only, restored inside `02`), `Debug.storing`,
  the fixture items, the selected tab. The owner's own reader tabs are never
  touched beyond closing a player per the rules.
- Budget: a handful of short MiMo reads per run (2026-10-01 spent exactly one);
  Kokoro is free.

## Limits

- **Fixed delays from the press measure the wrong thing (2026-10-01, run 2)**:
  with the catalog cold, the press's start died in the getVoices gate — no
  request ever went out (engine row `ended: true, voice: null` throughout), so
  nothing could drop; and the fixed-7 s control closed its tab with that
  listing still in flight, dropping it (`droppedRise: 1, byMethod.getVoices`)
  — the opposite of the control's intent. Hence `06`'s warm-up + dispatch
  anchor and `04`'s measured settle.
- **The getVoices late drop USED to log a dead object (2026-10-01, 1.16.4-beta4,
  run 2)**: when that dropped listing landed on the dead window — `lateResults`
  correctly counted the drop — the bundle also logged one `can't access dead
  object` (`line: 0`, console `columnNumber: 18952` = bundle line 18952 =
  `src/index.ts:574`, `onVoicesListed` reading
  `reader._internalReader._readAloudManager.active` after its await). Folded
  into #165 and fixed in 1.16.4-beta5 (`isReaderLive`/`readerGone` wiring, the
  `voice list not planned: its reader is gone` line): the same flow on beta5
  drops the list with zero dead-object entries — verified in the 2026-10-01
  beta5 run below. Correction of the earlier "candidate issue of its own" note.
- An anonymous `can't access dead object` console entry (`sourceName` empty,
  `lineNumber` 0, `columnNumber` 1, empty stack, no debug-store trace) appeared
  25.0 s AFTER the getVoices drop in both the beta4 run 2 and the beta5 run —
  Zotero-side noise, not the plugin's (the plugin's logged errors carry the jar
  URL as `sourceName` with the bundle line in `columnNumber`).
- Zotero's own reader.js logged its own `can't access dead object`
  (reader.js:1758) at one × close — Zotero's noise, not the plugin's.
- Item 5's advance half: run it against `diagnostics.engine()` on this build
  (the controller fields the 2026-09-16 script polled are gone with the Engine);
  its script predates that and needs the rewrite before its next run.
- `controller._currentIndex`/`_position` direct assignment (items 1/3) is the
  pre-Engine pattern those two scripts were built on; on this build they still
  ran (2026-09-16) but have not been re-executed since the Engine landed.
- **Since #166 the catch window is the serial queue, not one request** (2026-10-01):
  at 10 ahead / 1 at once the runner holds one slot open until the queue
  empties, so `open >= 1` exists for ~10 × per-answer latency (~3 s on
  Kokoro) — catchable by polling `diagnostics.engine()` every ~80 ms, no slow
  provider needed. But on a WARM cache the caught slot can be a cache-hit
  lookup that resolves in µs: its answer raced the window teardown and
  surfaced as one Zotero-side `can't access dead object` (the signature of
  Zotero's own `reader.js:1813` `Cu.cloneInto(result, targetWindow)`; no
  plugin line, `lateResults` flat). Run item 2 on a fresh process (a restart
  empties the cache) or a voice that has never spoken the fixture text, and
  key the verdict on `exactlyOneSynthesisAfterClose` plus the Engine's drop
  line — the fresh-process pass caught a live request at 19 ms and the Engine
  dropped it cleanly (its own line +1, no dead object).

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-16 | 1.12.11-beta5 (a9e92bd7…) | issue #116 verification reply | 1 PASS (MiMo), 2 PASS (chain-stop; native-drop sub-claim NOT TESTABLE), 3 PASS (MiMo), 4 PASS, 5 NOT TESTABLE (audio-advance; mechanism PASS) | First run of this case/kit; Kokoro-only attempts all `0`, MiMo caught both; two in-place reinstalls for a cold cache. |
| 2026-10-01 | 1.16.4-beta3 (bundle 6277443d…) | issue #166 verification reply (remaining items) | 2 PASS on the fresh-process pass (live in-flight request caught at 19 ms; exactly one synthesis line after the close; the Engine's `late audio dropped` line +1; `lateResults` flat by design; 0 dead objects) | First #166-shape run of `02`. A same-day first pass on a warm cache caught `open:1` at 1657 ms on a cache-hit slot: the stopping claim still proved (zero requests after the close) but the drop line never appeared and one Zotero-side `can't access dead object` surfaced (Limits). The follow-up fresh-process pass (after a restart emptied the cache) is the clean evidence. No paid provider. Note: this script needs the prefetch-cache kit's `00` session; this kit's own `00`/`00b`/`90` predate the #166 isolation. |
| 2026-10-01 | 1.16.4-beta4 (e429d830…) run 1 | this reply (issue #165) | 6 NOT TESTABLE (kit bug) | `06` v1 waited 20 s for precomputed read-aloud segments that this Zotero build never creates on open; failed before the press; no request, nothing paid; fixture hand-cleaned. |
| 2026-10-01 | 1.16.4-beta4 (e429d830…) run 2 | this reply (issue #165) | 6 NOT TESTABLE (no dispatch), 4 attempt invalid (see Limits) | Press consumed, close 284 ms, but the cold MiMo listing gated activation — no session, 0 requests. The control's fixed 7 s closed with the listing in flight → `droppedRise: 1` (getVoices) + the bundle dead object of the Limits section. `04`/`06` revised from this. |
| 2026-10-01 | 1.16.4-beta4 (e429d830…) run 3 | this reply (issue #165) | 6 PASS, 4 PASS | The clean pass: warm-up + dispatch anchor; one paid read; `lateResults` flat; zero new dead-object entries. `90` byte-exact, `95` WebDAV restored. |
| 2026-10-01 | 1.16.4-beta5 (dc631c53…) | issue #165 verification reply | 7 PASS, 4 PASS | Item 7's first run caught it on the first try: cold catalog from the in-place install, close +1053 ms, list landed ~21.7 s after the open, `getVoicesRise` 1, both lines in order, zero plugin dead objects; item 4 control after it, quiet (`droppedRise` 0, `inflightAtClose` 0). Zero paid reads. `90` byte-exact, `95` WebDAV restored. |
