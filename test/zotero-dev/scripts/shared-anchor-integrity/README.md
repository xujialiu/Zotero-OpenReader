# Shared-position integrity — executed kit and prepared safety revisions

[Case](../../cases/shared-anchor-integrity.md) · [Checklist](../../README.md)

| Script | Check | Required evidence | Params |
| --- | --- | --- | --- |
| `10-isolate-baseline.js` | Private pref/document-voice snapshots; all four idle; folder off before other writes; test destination | folder false, destination match, baseline retained | `expectedVersion`, `expectedBundleSha`, `fixtureTitle` |
| `11-rows-snapshot.js` | Four position-store tables; deterministic fixture Document Id absent | private rows/hashes; no existing fixture identity | — |
| `12-server-snapshot.js` | Both test-server files present, saved verbatim, fixture absent | status 200, hashes, `serverSnapshotsVerified` | `tmpDir`, `runId` |
| `13-build-proof.js` | Installed bundle/version, source needles, re-isolation after install | expected hash/version; folder false, all four quiet | — |
| `14-revalidate.js` | Resume interrupted work without replacing its snapshot | same build, live fixture, suspended test destination | — |
| `20-fixture-import.js` | Fresh standalone EPUB, only after absence/snapshot gates | fresh item/key, EPUB type | `fixtureTitle`, `fixturePath` |
| `21-open-survey.js` | Real loaded SDT and document naming | Document Id matches; original block paths/offsets | — |
| `22-local-position.js` | Known older local fallback and audio probe | fallback row; running/advancing reported separately | — |
| `30-resume-check.js` | Real shared adoption and Shift+Space; source block/span, logs and refusal notice | adopted 1; expected block/offset AND log, no guessed PASS | `check`, `anchor`, `locator`, `expectedBlockRef`, `expectedOffset`, `expectedLog`, `expectSegmentStartsWith` (optional) |
| `31-han-landing-probe.js` | Optional diagnostic: installed call's delivered SDT point | first occurrence delivered; wrapper restored by comparison | — |
| `32-han-start-selection-probe.js` | Optional diagnostic: target consumption and observed segments | capture/consume trace; actual wrapper restoration | — |
| `60-cleanup-teardown.js` | Folder off; close/erase fixture; library-scoped row removal; remove its new document voice | four table hashes and voice records match; `teardownVerified` | — |
| `61-cleanup-verify-and-server.js` | After same-build reinstall, in-memory/store gate before server restore | no fixture rows, original counts/hashes, exact server bytes; `cleanupVerified` | — |
| `62-cleanup-prefs-restore.js` | Data gate and four-idle gate; every named pref checked; destination and reading state before switches; folder last | all values/user flags match; independent document changes preserved; original readers/window | — |

## Before starting

- Read the tester workflow, case, baseline 0 and cleanup. Use **only**
  `~/.secrets/Zotero-TTS/test_webdav.txt`. Never print its contents or any
  raw preference/server/store snapshot. The scripts keep private material
  in runner state or gitignored `.tmp/zotero-dev/`.
- Fixture: `test/fixtures/anchor-integrity/anchor-integrity.epub`, generated
  beside it. Existing local or server records for its deterministic Document
  Id block the run; use a distinct fixture rather than overwrite them.
- Install after scripts 10–12; run 13 before importing. The same-build
  in-place reinstall between 60 and 61 clears fixture data held in memory.
  All switches and the folder stay off during that reinstall.
- Set each scenario's params explicitly. Runner params persist; never rely
  on an absent param clearing an earlier value. Source spans must match both
  block and offset. Read the log/adoption evidence, not only `ok`.
- Each resume stops its fixture session and suspends sync again. Keep the
  user's readers untouched. Volume is zero before any free/local playback.
- Run case 8's forced overlapping-request probe before final cleanup. It
  needs event-level `setSegments` evidence and the installed
  `diagnostics.segmentPreparation()` counters; 80/120 ms polling alone is
  insufficient. Retain the successfully executed probe here after beta5.
- All original server bytes, local table contents, named prefs and document
  voice records must survive. Script 62 refuses independent document-voice
  changes rather than overwriting them. A failed audit leaves the folder off.

## Revision and coverage limits

- **2026-11-06 beta5 preparation:** scripts 10–14, 20, 22, 30–32 and 60–62
  have safety/acceptance revisions awaiting live execution. Seven host tests
  exercise script 62's missing-data/busy-transport gates, namespace check,
  all-pref audit, independent document records and folder-last order. Syntax
  checks are not a claim that these revisions have already passed live.
- Beta4's original Han run failed; its installed matcher delivered the
  correct point, but the first observed playback position varied. A later
  instrumented success did not erase those failures. Follow-up research
  reproduced two overlapping native segment requests consuming the target
  once and then overwriting it from the saved position. Exact spontaneous
  triggers of the earlier failures were not separately established.
- Beta4 case 4a carried a stale Han text expectation in params. Its measured
  block 7 / offset 4456 / `Yes.` independently establishes the correct
  result. The revised script requires block, offset and expected log.
- Beta4 cleanup started with the normal folder and switches off. That run
  cannot establish enabled-folder restore order; the revised order is
  separately tested against inert preference boundaries, then verified on
  the available live baseline without changing it artificially.
- The two older diagnostic scripts sample active segments and are not a
  synchronous transition log. Lack of word timestamps on macOS does not
  establish silence. Audio progression and start-position checks are
  reported separately if the audio context is suspended.

## Runs

| Date/build | Executed evidence |
| --- | --- |
| [2026-11-05, beta4](https://github.com/xujialiu/Zotero-OpenReader/issues/234#issuecomment-6661264930), tree `3a707b1`, bundle `f2b8eb20…` | Original revisions: headings/refusals, final exact/token reply and ambiguity PASS; Han resolver PASS with failed playback-start observations retained. Four table hashes/server bytes restored, checked pref subset equal; broader replay gaps prompted the revisions above. Per-scenario raw results: `.tmp/zotero-dev/2026-11-05-1.17.1-beta4-shared-anchor-integrity/scenarios/`. |
