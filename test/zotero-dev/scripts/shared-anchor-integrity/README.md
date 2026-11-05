# Shared-position integrity — executed kit (1.17.1-beta5)

[Case](../../cases/shared-anchor-integrity.md) · [Checklist](../../README.md)

| Script | Check | Required evidence | Params |
| --- | --- | --- | --- |
| `10-isolate-baseline.js` | Private pref/document-voice snapshots; all four idle; folder off before other writes; test destination | folder false, destination match, baseline retained | `expectedVersion`, `expectedBundleSha`, `fixtureTitle` |
| `11-rows-snapshot.js` | Four position-store tables; deterministic fixture Document Id absent | private rows/hashes; no existing fixture identity | — |
| `12-server-snapshot.js` | Both test-server files present, saved verbatim, fixture absent | status 200, hashes, `serverSnapshotsVerified` | `tmpDir`, `runId` |
| `13-build-proof.js` | Installed bundle/version, source needles, re-isolation after install | installed `content/zotero-tts.js` hash = `expectedBundleSha`; folder false, all four quiet | — |
| `14-revalidate.js` | Resume interrupted work without replacing its snapshot | same build, live fixture, suspended test destination | — |
| `20-fixture-import.js` | Fresh standalone EPUB, only after absence/snapshot gates | fresh item/key, EPUB type | `fixtureTitle`, `fixturePath` |
| `21-open-survey.js` | Real loaded SDT and document naming | Document Id matches offline; per-block locators/offsets derived live | — |
| `22-local-position.js` | Known older local fallback and audio probe | fallback row; running/advancing reported separately | — |
| `30-resume-check.js` | Real shared adoption and Shift+Space; source block/span, logs and refusal notice | adopted 1; expected block/offset AND log (set the exact contiguous substring per row), no guessed PASS | `check`, `anchor`, `locator`, `expectedBlockRef`, `expectedOffset`, `expectedLog`, `expectSegmentStartsWith` (optional) |
| `31-han-landing-probe.js` | Delivered `startReadAloudAtPosition` input + 80 ms landing trace + Zotero's own segment list | delivered point verbatim; wrapper restored | — |
| `32-han-start-selection-probe.js` | `_captureReadAloudStart`/`consumeTargetPosition`/`getSelectionPosition`/`jumpTo`/`play` for one resume | capture/consume trace; actual wrapper restoration | — |
| `33-han-resume-setter-probe.js` | Synchronous initial-setter chain for the Han resume (input → request entries → capture → consume → native `setSegments`) | one setter at the target-containing segment; counters delta; wrapper descriptors compared | — |
| `40-start-race.js` | Item 8 forced overlap: one injected `applyPersistedVoices` at first `_requestReadAloudSegments` entry, three cold-reader trials + non-injected instrumented control | exactly one native `setSegments` at the target-containing segment, one non-null consume, `coalesced` +1, `started` +1, `pending:false`; wrappers restored w/ descriptors | — |
| `41-reader-lifecycle.js` | Cold/new-reader attach and close/reopen attach | fresh reader entry `patched:true`, `started` +1 per leg, one setter, landing block correct | — |
| `42-post-reinstall-hooks.js` | After the same-build in-place reinstall: startup 31 steps, bundle hash, hooks live, no pending, folder false | all fields; `segment preparation` step ok | — |
| `60-cleanup-teardown.js` | Folder off; close/erase fixture; library-scoped row removal; remove its new document voice | four table hashes and voice records match; `teardownVerified` | — |
| `61-cleanup-verify-and-server.js` | After same-build reinstall, in-memory/store gate before server restore | no fixture rows, original counts/hashes, exact server bytes; `cleanupVerified` | — |
| `62-cleanup-prefs-restore.js` | Data gate and four-idle gate; every named pref checked; destination and reading state before switches; folder last | all values/user flags match; independent document changes preserved; original readers/selection/debug | — |

## Before starting

- Read the tester workflow, case, baseline 0 and cleanup. Use **only**
  `~/.secrets/Zotero-TTS/test_webdav.txt`. Never print its contents or any
  raw preference/server/store snapshot. The scripts keep private material
  in runner state or gitignored `.tmp/zotero-dev/`.
- `expectedBundleSha` is the **installed `content/zotero-tts.js`** hash, not
  the XPI's; the XPI hash is verified separately on disk before install.
- Install after scripts 10–12; run 13 before importing. The same-build
  in-place reinstall between 60 and 61 clears fixture data held in memory.
  All switches and the folder stay off during that reinstall.
- Set each scenario's params explicitly — the runner's params persist across
  groups, so pass every key each call. `expectedLog` must be the exact
  contiguous substring: resume lines read `resumed from the shared position
  of <device>: <agreement>, <locator-because>`; refusal lines read
  `not resolved: <because>, <search>` (e.g. `text-disagreed, not-found`,
  `locator-did-not-resolve, ambiguous`). 30's `offsetContained` is the case's
  containment rule; short replies may be their own segment (`Yes.`), so
  `expectSegmentStartsWith` is advisory.
- The runner overwrites same-name results per group: after each 30 check,
  copy `30-resume-check.js.json` to `30-check-<id>.raw.json` in the run's
  results dir (keep first attempts of param mismatches under a distinct name).
- Reading-pref writes can re-stamp `webdav.syncState` even with the folder
  off. The first beta5 cleanup stopped at this gate; restoring the metadata
  after the other prefs allowed the unchanged script to pass. Script 62 now
  incorporates that order: settle reading-pref observers, restore syncState,
  then audit and enable the switches/folder. An eighth host regression went
  red on the former order and passes on this revision; its focused live
  restore check is recorded separately below. `webdav.*` never re-stamps itself.
- On this macOS RDP host the in-process `minimize()` can stop taking effect
  mid-run; 62 then fails its final `hostMinimized` read. The system
  fallback (`osascript … set value of attribute "AXMinimized" of window 1 to
  true`) works; do not weaken the gate.
- Audio: the machine's sink has come and gone; read `engine()`'s audio state
  per session and report `suspended`/not-advancing as a machine limitation,
  never as unsupported-voice silence.

## Limits and retained failures

- **Item 3: position/start PASS after raw-evidence review.** The polling-only
  attempt and tester's initial FAIL classification remain in the raw record.
  Script 33 proves one setter at bsi 7 after consuming `[6,0,2]`; script 31
  first observes `前文你好后文。` at 167 ms, then the next segment at 337 ms,
  then the following English block at 524 ms. That is an observed correct
  start followed by forward progression, not a replacement start. The case
  requires the first occurrence, not a minimum dwell time. Its audible
  duration/pronunciation is not judged here. Beta4's actual double-setter
  failure is separate and is preserved as the red control.
- Beta4 history: the original run's Han resolver passed with playback-start
  uncertainty; its kit-wide restoration gaps prompted the safety revisions
  executed here. Its deciding red probe (`r33-inject-voices-write.js`) and
  result remain under `.tmp/zotero-dev/anchor-start-research/`.
- `14-revalidate.js` is kept for interrupted passes; it has not run in the
  beta5 pass. Host-only coverage (case item 6) is not in this kit: it is
  `npm test` ownership (3590 passed/12 skipped reported by the run brief).
- `33`/`40` poll counts via `diagnostics.segmentPreparation()` per reader;
  closed readers drop their counters — each cold trial reads fresh state.

## Runs

| Date/build | Executed evidence |
| --- | --- |
| [2026-11-05, beta4](https://github.com/xujialiu/Zotero-OpenReader/issues/234#issuecomment-6661264930), tree `3a707b1`, bundle `f2b8eb20…` | Headings/refusals, final exact/token reply and ambiguity PASS; Han resolver PASS with landing observations retained; cleanup PASS on a reduced audit. Superseded prepared revisions were re-verified live in the beta5 run below. |
| 2026-11-06, 1.17.1-beta5, tree `2475dfb`, installed `content/zotero-tts.js` `3694eea3…`, XPI `e33b33b0…` | Startup 31 steps ok ×3 installs; preflight removed two prior-fixture doc-voice residues (`user/8Y785WW3`, `user/3IC279IH`) with gates off. Items 1a/1b PASS (landing `Chapter 7` ref 3, `exact` + `locator-did-not-resolve`/`text-disagreed`), 2 PASS (`not resolved: text-disagreed, not-found`, toast, fallback), **3 position/start PASS on parent review** (one correct setter and correct first active segment; polling-only failure retained, later forward progression is not an incorrect start), 4a/4b PASS (final `Yes.` at block 7 offset 4456, `exact`), 4c PASS (`YES!` → `aligned`), 5a/5b PASS (`not resolved …, ambiguous`, toast, fallback). Item 8 PASS: three injected trials + non-injected instrumented control (one setter at bsi 7/`[6,0,0]`, coalesced +1, started +1, pending false), cold + close/reopen legs, post-reinstall hooks live. Item 7 PASS: teardown/verify/server/prefs gates green (`teardownVerified`, `cleanupVerified`, folder restored last, all pref values+user flags equal). Audio `suspended`/not-advancing during 22; `running` during later checks — machine-dependent, reported not claimed. Per-scenario raws: `.tmp/zotero-dev/2026-11-06-1.17.1-beta5-shared-anchor-integrity/results/`. |
