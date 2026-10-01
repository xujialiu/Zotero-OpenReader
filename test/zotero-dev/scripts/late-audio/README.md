# Scripts: Audio that arrives after its tab closed is dropped (issue #116)

[Case](../../cases/late-audio.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Runner](../_shared/README.md)

## Scripts

Run through `_shared/run.js` (`kit: 'late-audio'`). `00` and `00b` are quick
and fit one `start()`/`one()` call; `01`, `02`, `03`, `04`, `05` each open a
reader and poll live network calls, so they belong in a group, never a bare
`zotero_execute_js`.

| Script | Checks | Expects (measured 2026-09-16, 1.12.11-beta5) | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-mute.js` | Snapshots the touched prefs (+ `mimo.enabled`), the console's pre-existing dead-object entries, debug store state, `lateResults` at start; mutes, enables Kokoro, points memory at `local::af_bella` | Applies its own state; `readersOpen` reported, not asserted | state: `baseline` |
| `00b-mimo-override.js` | Run AFTER `00` only if Kokoro answers too fast (see Limits): enables MiMo, memory -> `mimo::mimo_default` | `mimo.enabled: true`, memory updated | reads `baseline` |
| `01-item1-close-x.js` | Item 1: imports fixture-a fresh, plays, lets segment 0 resolve, **repositions the live controller to the fixture's longest segment** (`controller._currentIndex`/`_position`), resumes, closes ~250 ms later the × way (`reader._window.Zotero_Tabs.close`) | With MiMo: `droppedRise: 1`, `getAudioRise: 1`, one drop line, zero new dead-object entries. With Kokoro (this h200, GPU idle): `0` every time — too fast to catch (see Limits) | writes `fixtures.a`, `item1` |
| `02-item2-prefetch-chain.js` | Item 2, issue #166 shape (REWRITTEN 2026-10-01; the previous version hunted the plugin's old warm chain — `ready ahead of playback` / `stopped, the reader is gone` lines a #166 build no longer has). Custom prefetch 10 ahead / 1 at once, fresh fixture-a on an uncached local voice, polls `session.prefetch.open >= 1` with position ≤ 2, closes the tab the × way at once | No provider request after the close beyond the one open at it (exactly one synthesis line in the debug delta), and the Engine's `late audio dropped: its reader window was gone` line up by that one (`patches().lateResults.dropped` is the window-wrapper's counter and may stay flat — the Engine drops its own result first); no `can't access dead object`. On a WARM cache the catch can land on a cache-hit slot whose answer races the window teardown (see Limits) | `root`; reads the 166 session (`Zotero.__ztts166` — the prefetch-cache kit's `00`); writes `item2` + `fixtures` (both states) |
| `03-item3-erase-path.js` | Item 3: imports fixture-b fresh, plays, repositions to its longest segment, resumes, `toggleReadAloudPopup(false)` ~300 ms later, `eraseTx()` ~300 ms after that | With MiMo: `droppedRise: 2`, `getAudioRise: 2`, two drop lines, zero new dead-object entries | writes `fixtures.b`, `item3` |
| `04-item4-quiet-close.js` | Item 4 (control): reopens fixture-a, opens+closes the popup at once, waits 7 s, then closes the tab | `droppedRise: 0`, no drop line (Kokoro, both runs) | reads `fixtures.a`; writes `item4` |
| `05-item5-playback-normal.js` | Item 5: reopens fixture-a, plays normally, polls `_controller._currentIndex` for two segments' advance | `_currentIndex` stuck at 0 for 30 s (see Limits: script-triggered `AudioContext` never resumes); `droppedRise: 0`, `readyAheadLines: 1` | reads `fixtures.a`; writes `item5` |
| `90-cleanup-restore.js` | Closes/erases whatever is left in `state.fixtures`, restores every touched pref (incl. `mimo.enabled`) byte-exact, memory last, restores `reader.readAloudVoices`, `Debug.storing`, the selected tab | All restored; safe to run twice | reads `baseline`, `fixtures` |

## Before you start

- Build: `zotero_plugin_list` + `diagnostics.startup()`; build identity is
  `JSON.parse(diagnostics.patches()).lateResults` existing at all (absent on
  1.12.11-beta4).
- Fixtures: `fixture-a.pdf` (17 segments; segment 0 is 31 chars, its own
  longest segment 132 chars) and `fixture-b.pdf` (6 segments; longest 105
  chars), imported fresh per item, standalone, erased by `03` (fixture-b) and
  `90` (fixture-a).
- **Kokoro's own speed varies with the h200's load**: getVoices() measured
  0.3-20 s live across runs; getAudio(), once active, measured under 300 ms
  even for a 132-char segment on a guaranteed-cold cache (after an in-place
  reinstall) — too fast for items 1/3 on this run. Run `00b` before `01`/`03`
  when that happens; `02`, `04`, `05` do not need it (item 2 catches its own
  chain regardless of per-segment speed; items 4/5 do not depend on catching
  anything in flight).
- **The audio cache is text+voice-keyed, in-process, and outlives a fresh
  import**: re-importing a fixture does NOT give a cold cache for text
  already spoken this session. An in-place reinstall (`zotero_plugin_install`
  with the same xpi) does — it also resets `lateResults` to `{0,{},[]}`
  cleanly, which is why runs 3-5 below each start with one.
- State touched, all restored by `90` (or by hand for `mimo.enabled`/memory
  if `01`/`03` ran under MiMo without `00b`'s pairing — `90`'s own restore
  order now includes `mimo.enabled`, so just run it): `readAloud.volume`,
  `readAloud.memory`, `local.enabled`, `mimo.enabled`, `prefetch` (item 2
  only, restored inside `02` itself), `reader.readAloudVoices` (MiMo's own
  `selectVoice` rewrites this regardless of the plugin — confirmed live,
  1397 -> 1433 chars after the MiMo run).
- The owner's own reader tab (itemID 25442 this run) was open throughout;
  never touched, never active.

## Limits

- **`m.active` becoming true does not mean getAudio just dispatched** — on
  this server it means the audio is already resolved. Closing 30-300 ms
  after activation caught nothing across five attempts (two with a
  guaranteed-cold cache); repositioning to a 132-char segment before
  resuming didn't help either (still resolved under 268 ms). Only switching
  to a genuinely slower provider (MiMo) worked. A future run should try
  `00b` first rather than repeat the Kokoro-only attempts above.
- **Item 5's `_currentIndex` never advanced in 30 s**: this matches
  baseline.md's documented limitation exactly — a `ReadAloudController`'s
  `AudioContext` created by a script (not a trusted gesture) stays
  `suspended` for its whole life, so playback never actually proceeds even
  though `active`/`paused` report a normal playing state. NOT TESTABLE for
  the position-advance claim; the mechanism half (dropped flat, ready-ahead
  lines present) still ran and passed. A trusted Shift+Space (baseline.md's
  own probe) would be needed to test the advance itself.
- **Item 2's native-prefetch drop sub-claim** ("dropped up by the requests
  Zotero itself had in flight, 1-3") was not observed this run — the chain-
  stop mechanism itself (`stopLineCount`/`readyLinesAfterStop`) is the
  primary claim and passed cleanly; the general "a late getAudio is dropped
  silently" mechanism is separately proven by items 1 and 3.
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
- `controller._currentIndex`/`_position` direct assignment is the pattern
  `angle-brackets/groups-08-prefetch.js` already uses on the same controller;
  not a new risk.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-16 | 1.12.11-beta5 (a9e92bd7…) | issue #116 verification reply | 1 PASS (MiMo), 2 PASS (chain-stop; native-drop sub-claim NOT TESTABLE this run), 3 PASS (MiMo), 4 PASS, 5 NOT TESTABLE (audio-advance; mechanism PASS) | First run of this case/kit. Kokoro-only attempts at items 1/3 (five, including two post-reinstall) all came back `0`; MiMo (00b) caught both cleanly on the first try. Two in-place reinstalls used to guarantee a cold audio cache. |
| 2026-10-01 | 1.16.4-beta3 (bundle 6277443d…) | issue #166 verification reply (remaining items) | 2 PASS on the fresh-process pass (live in-flight request caught at 19 ms; exactly one synthesis line after the close; the Engine's `late audio dropped` line +1; `lateResults` flat by design; 0 dead objects) | First #166-shape run of `02`. A same-day first pass on a warm cache caught `open:1` at 1657 ms on a cache-hit slot: the stopping claim still proved (zero requests after the close) but the drop line never appeared and one Zotero-side `can't access dead object` surfaced (Limits). The follow-up fresh-process pass (after a restart emptied the cache) is the clean evidence. No paid provider. Note: this script needs the prefetch-cache kit's `00` session; this kit's own `00`/`00b`/`90` predate the #166 isolation. |
