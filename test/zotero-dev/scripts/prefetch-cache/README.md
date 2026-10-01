# Scripts: Prefetch and cache

[Case](../../cases/prefetch-cache.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Runner](../_shared/README.md)

Issue #166 (one prefetch, the Engine's, by two settings), build 1.16.4-beta3.
Run through `_shared/run.js` (`kit: 'prefetch-cache'`), one script per call.
Every reading needs a **trusted Shift+Space** after the popup opens (workflow
§6): on this Zotero (10.0.5-beta.2) a script-started session's output stays
`suspended` — press, then if the manager reads paused, press again.
`00` must run first and `90` last: the scripts share the run's session state
(`Zotero.__ztts166.baseline` / `.fixtures`) and register every fixture in
**both** `__ztts166.fixtures` and `Zotero.ZoteroTTSRun.state.fixtures`.

| Script | Checks | Expects (measured 2026-10-01, 1.16.4-beta3) | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-isolate.js` | Pref snapshot (+user-value status: the three `readAloud.prefetch*`, `cacheAudio`, old `prefetch`/`prefetchEnabled`), test-WebDAV isolation, Zotero version, errors ring, readers, position rows; mutes (volume 0), memory+default voice, debug store on, host minimized | WebDAV `destinationMatched: true`, switches suspended; this profile: local disabled (`local.enabled` false, Kokoro at `https://h200-kokoro.xujialiu.top`), Zotero tiers off, new prefetch prefs no user value, old `prefetch` user 5 | writes `baseline` (`Zotero.__ztts166`) |
| `10-item3-8-first-read.js` | 3.8: cold-cache first read on fixture-c; per-start `session.prefetch`, audio probe, `(cached)` on replay | `sentences: 5, requests: 2`; first order exactly `from..from+4`; `peak: 2`; probe `running` + clock moved (2 trusted presses); 7 `(cached)` lines | reads `baseline`; writes `fixtures`, `item3_8` |
| `20-item1-reach-8-3.js` | 1: prefs 8/3 by hand, fixture-a, five starts; live synthesis lines vs segment lengths against `maxPosition+8`; prefs cleared | Every start: `orderLen 8`, order = `from..from+7`; `peak 3`; live lengths {132, 51, 49, 117} = indices {7..10} ≤ bound 12; `prefsCleared: true` | reads `fixtures`; writes `item1` |
| `30-item2-pane-change-mid-read.js` | 2: at 5/2, set `ztts-prefetch-sentences` to 10 **in the pane** mid-reading; next start's numbers; `stats.started` unchanged | Field 5→10; the first start after the write reads `sentences: 10`, `orderLen 10`; `startedUnchanged: true` | reads `fixtures`; writes `item2` |
| `31-item3-off-defaults-clamp.js` | 3: prefs 12/4 → off in the pane → 5/2 disabled, prefs hold; next start 5/2; on → 12/4; entry 50→20, 0→1 | All as stated; post-click starts keyed by the report's `from` advancing | reads `fixtures`; writes `item3` |
| `40-item4-one-at-once.js` | 4: 6 ahead / 1 at once on uncached text (numbers.pdf); `peak` over ~100 ms samples | 4 starts, `requests: 1`; `maxPeak 1` over 178 samples; 6 live synthesis lines | reads `fixtures`; writes `item4` |
| `50-item5-voice-switch-reach.js` | 5: at 6/2, trusted `Shift+.` switches to the player-list's adjacent voice; `voiceSwitch()` stage → committed; then `store.signal`, `session.voice`, the next start's order, live lines on the new voice | Adjacent of `local::af_bella` was `local::af_heart`; stages `preparing→committed` in 661 ms; `signal: false`; next start order 6 = `from..from+5`; 6 live synthesis lines after the commit | `root`; reads `baseline`; writes `fixtures` (both states), `item5` |
| `55-item6-zotero-standard.js` | 6: enable `zotero-standard.enabled`, at 4/1 pick the tier **while paused** (native path), `refreshCreditsRemaining()` (a credits query), read `minutesRemaining` BEFORE any Zotero synthesis — `< 2` or null ⇒ NOT TESTABLE; then Play and sample starts | `minutesRemaining: 120`; voice `bdd0dcc3-en-US` (no `::`); 3 starts `sentences: 4, requests: 1`, order 4 from `from`, `peak: 1`; `store.signal` false | `root`; reads `baseline`; writes `fixtures` (both states), `item6` |
| `60-item7-cache-off.js` | 7: half 1 custom OFF + cache on (replay `(cached)`); half 2 `cacheAudio` OFF on uncached text (a second local voice) — order fills, `notices.shown` flat after the first start | Half 1: starts 5/2, replay `(cached)`×3; half 2 (af_heart): 4 starts, order 5 each, `peak: 2`, `shown` flat at 2, 8 live lines, 0 cached | `root`; reads `baseline`; writes `fixtures` (both states), `item7` |
| `65-item8-old-pair-ignored.js` | 8: old `prefetch`=9 / `prefetchEnabled`=false by hand, the three new prefs cleared; the pane read (checkbox found by its `preference` attribute — it has no id); next start's numbers | Pane: custom checked, 5/2 enabled; starts read `sentences: 5, requests: 2`, order from `from`; old prefs restored exactly (user 5 / no user) | `root`; reads `baseline`; writes `fixtures` (both states), `item8` |
| `90-cleanup-restore.js` | Fixture readers closed, items erased, every pref byte-identical (memory last), WebDAV connection + switches restored only after local state is clean and transports settled; verification block | `localClean/webdavConnectionRestored/syncRestored: true`, `errors: []`, position rows back to baseline (73) | reads `baseline` + `Zotero.__ztts166.fixtures` |

## Before you start

- Build: prove it by bundle (SHA-256 of the profile's `content/zotero-tts.js`,
  markers `prefetchSentences` + `dropSignal`, no `ready ahead of playback`),
  never the version string; then `zotero_plugin_list` + `diagnostics.startup()`.
- **`readAloud.defaultVoice`, not `readAloud.memory`, is the voice a new
  document reads with**: each fixture script points it at a Kokoro voice
  (baseline Fish would read otherwise). Both prefs are in `00`'s snapshot.
- A new document gains a `documentVoices.user/<key>` record only on a voice
  **pick**; plain reads added none (`90` verifies equality).
- State touched: the three `readAloud.prefetch*` prefs (each script clears
  what it set), `readAloud.volume`/`memory`/`defaultVoice`/`sameForAllDocuments`,
  `local.enabled` (enabled for the run — this profile has it off), test-WebDAV
  isolation, fixture items (fresh import per script, erased by `90`), the
  audio cache (text+voice keyed, in-process; a restart empties it).
- Zotero tiers are off in this profile: item 6 enables `zotero-standard.enabled`
  (a baseline user value of false — restored byte-identical); `minutesRemaining`
  is null until a Zotero-tier controller exists, so read it after the paused
  tier pick via `refreshCreditsRemaining()` (a query, no synthesis).
- Item 6's `selectTier` (and any tier/voice pick) rewrites
  `extensions.zotero.reader.readAloudVoices`; `90` restores it after the
  fixture tabs are closed (a reader observer would overwrite an earlier write).

## Limits

- The report for a start lags one sample: key post-click assertions on the
  report's `from` advancing, not on position equality.
- `_readAloudSegments.segments` is null until the manager has prepared.
- Item 5's target is whatever the player list holds NEXT (sorted by
  creditsPerMinute, stable): assert the adjacent voice is a second `local::`
  voice before pressing; the list is read live from `manager.voicesForLanguage`.
- A chrome-scope `fetch` of `local.baseURL + '/v1/audio/voices'` failed in this
  environment (fallback voice used instead); pick uncached voices from the
  live manager list when it matters.
- 2026-10-01: script-started sessions stayed `suspended` until a trusted
  Shift+Space; no media-sink errors. If a reading stalls at position 0 with
  `open > 0`, suspect this first.
- 2026-10-01 (engine kit cross-ref): a close with a request in flight can
  surface one Zotero-side `can't access dead object` when the answer takes the
  fast cache path (see late-audio README) — the Engine's own drop path is clean.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-01 | 1.16.4-beta3 (xpi 031feb80…, bundle 6277443d…) | issue #166 verification reply | 3.8, 1, 2, 3, 4 PASS; 5–8 NOT RUN (owner stopped the run) | First run of this case/kit. Two 3.8 attempts failed on the default-voice discovery (Fish read) and the suspended-output discovery before the PASS; items 1 and 3 ran twice. |
| 2026-10-01 (evening) | 1.16.4-beta3 (same bundle proven in the profile) | issue #166 verification reply (remaining items) | 5, 6, 7, 8 PASS | Owner stopped the earlier run; this pass finished the case. Item 5 first try (adjacent voice af_heart, committed 661 ms). Item 6 first attempt returned `minutesRemaining: null` (read before any Zotero controller exists — a decision-order bug, fixed to read after the paused tier pick via the credits query). Item 7 stopped the pass once on a script bug (`toggleReadAloudPopup` called on the manager), fixed and rerun clean. Item 8's first pane read found no checkbox (`ztts-prefetch-custom` has no id — it carries a `preference` attribute), fixed and rerun clean. All PASS rows above are from these reruns. |
