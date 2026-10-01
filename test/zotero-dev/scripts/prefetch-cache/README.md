# Scripts: Prefetch and cache

[Case](../../cases/prefetch-cache.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Runner](../_shared/README.md)

Issue #166 (one prefetch, the Engine's, by two settings), build 1.16.4-beta3.
Run through `_shared/run.js` (`kit: 'prefetch-cache'`), one script per call.
Every reading needs a **trusted Shift+Space** after the popup opens (workflow
§6): on this Zotero (10.0.5-beta.2, 2026-10-01) a script-started session's
output stays `suspended` — the 2026-09-23 baseline note did not hold. Press,
then if the manager reads paused, press again.

| Script | Checks | Expects (measured 2026-10-01, 1.16.4-beta3) | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-isolate.js` | Pref snapshot (+user-value status: the three `readAloud.prefetch*`, `cacheAudio`, old `prefetch`/`prefetchEnabled`), test-WebDAV isolation, Zotero version, errors ring, readers, position rows; mutes (volume 0), memory+default voice, debug store on, host minimized | WebDAV `destinationMatched: true`, switches suspended; this profile: local disabled (`local.enabled` false, Kokoro at `https://h200-kokoro.xujialiu.top`), Zotero tiers off, new prefetch prefs no user value, old `prefetch` user 5 | writes `baseline` (`Zotero.__ztts166`) |
| `10-item3-8-first-read.js` | 3.8: cold-cache first read on fixture-c; per-start `session.prefetch`, audio probe, `(cached)` on replay; proves `session.prefetch`/`store.signal` exist (brief's build identity) | `sentences: 5, requests: 2`; first order exactly `from..from+4` (later starts shift with `from`); `peak: 2`; `store.signal` only `false`; probe `running` + clock moved (2 trusted presses); 7 `(cached)` lines, e.g. `local: 7 word timestamps for 40 chars (cached)` | reads `baseline`; writes `fixtures`, `item3_8` |
| `20-item1-reach-8-3.js` | 1: the reach is the number — prefs 8/3 by hand, fixture-a, five starts; non-cached synthesis lines vs segment lengths against `maxPosition+8`; prefs cleared | Every start: `orderLen 8`, order = `from..from+7`; `peak 3`; live lines (first run of the day) lengths {132, 51, 49, 117} = indices {7, 8, 9, 10} ≤ bound 12; `prefsCleared: true` | reads `fixtures`; writes `item1` |
| `30-item2-pane-change-mid-read.js` | 2: at 5/2, set `ztts-prefetch-sentences` to 10 **in the pane** mid-reading; next start's numbers; `stats.started` unchanged; pref cleared | Field 5→10, pref 10; the first start after the write (the report with `from` = writePosition+2) reads `sentences: 10`, `orderLen 10` (from 8 on: 9, 8, 7, 6, 5, 3 — doc end); `startedUnchanged: true` | reads `fixtures`; writes `item2` |
| `31-item3-off-defaults-clamp.js` | 3: prefs 12/4 → switch off in the pane → fields 5/2 disabled, prefs hold 12/4, next start 5/2; on → 12/4 enabled, next start 12/4; entry 50→20, 0→1, fields show kept; prefs cleared | All as stated; post-click starts keyed by the report's `from` advancing (`startAfterOff` 5/2, `startAfterOn` 12/4, `startAt20x1` 20/1 orderLen 13) | reads `fixtures`; writes `item3` |
| `40-item4-one-at-once.js` | 4: 6 ahead / 1 at once on uncached text (numbers.pdf); `peak` over ~100 ms samples; live-line count; prefs cleared | 4 starts, `requests: 1`; `maxPeak 1`, `maxOpen 1` over 178 samples; 6 live synthesis lines; `prefsCleared: true` | reads `fixtures`; writes `item4` |
| `90-cleanup-restore.js` | Fixture readers closed, items erased, every pref byte-identical (memory last), WebDAV connection + switches restored only after local state is clean and transports settled; verification block | `localClean/webdavConnectionRestored/syncRestored: true`, `errors: []`, position rows back to baseline (73) | reads `baseline` + `Zotero.ZoteroTTSRun.state.fixtures` |

## Before you start

- Build: install the brief's xpi, `zotero_plugin_list` → the manifest's
  `-betaN`, then `diagnostics.startup()` all-ok. Prove the build by bundle
  (SHA-256 of the profile's `content/zotero-tts.js`, markers `prefetchSentences`
  + `dropSignal`, no `ready ahead of playback`), never the version string.
- **`readAloud.defaultVoice`, not `readAloud.memory`, is the voice a new
  document reads with** (memory-sync.ts `memory()`): point the default voice
  at the Kokoro voice you want or the reading goes to the profile's default
  (this profile: a Fish voice). Both prefs are in `00`'s snapshot.
- State touched: the three `readAloud.prefetch*` prefs (each script clears
  what it set), `readAloud.volume`/`memory`/`defaultVoice`/`sameForAllDocuments`,
  `local.enabled` (enabled for the run — this profile has it off), test-WebDAV
  isolation, fixture items (fresh import per script, erased by `90`), the
  audio cache (text+voice keyed, in-process).
- A new document also gains a `documentVoices.user/<key>` record only on a
  voice **pick**; plain reads added none (`90` verifies equality).
- Zotero tiers are off in this profile: enabling `zotero-standard.enabled` for
  item 6 is a temporary, snapshot-restored change (engine.md item 21
  precedent); check `manager.minutesRemaining` before any Zotero-voice read.

## Limits

- The report for a start lags one sample: `session.prefetch` is the *last*
  start's, and `position` can move before the report is replaced. Key
  post-click assertions on the report's `from` advancing past the click's
  (see `31`), not on position equality.
- `_readAloudSegments.segments` is null until the manager has prepared — read
  segment lengths after the popup opens, never before.
- A fully cached reading makes the provider-reach half vacuous (no synthesis
  lines): item 1 needs text not yet spoken on the reading voice. Fixture texts
  on `local::af_bella` were all cached in the 2026-10-01 run's process;
  numbers.pdf was the fresh-text stand-in for item 4.
- 2026-10-01: script-started sessions stayed `suspended` (contrary to the
  2026-09-23 baseline note) until a trusted Shift+Space; no media-sink errors,
  the device was alive. If a reading stalls at position 0 with `open > 0`,
  suspect this first.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-01 | 1.16.4-beta3 (xpi 031feb80…, bundle 6277443d…) | issue #166 verification reply | 3.8, 1, 2, 3, 4 PASS; 5–8 NOT RUN (owner stopped the run) | First run of this case/kit. Two 3.8 attempts failed on the default-voice discovery (Fish read) and the suspended-output discovery before the PASS; item 1 ran twice (first run supplied the live synthesis lines, second the clean span check) and item 3 twice (stale-report sampling fixed by the `from`-advance key). Items 5 (voice switch), 6 (Zotero Standard), 7 (cache off), 8 (old prefs), late-audio 2 and engine 4 were never started. `20`'s segment-read placement fixed after the run (prepared, not re-executed). |
