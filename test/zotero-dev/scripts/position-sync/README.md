# Scripts: Reading position sync with duplicate readers

[Case](../../cases/position-sync.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

**Partial kit, not a start-to-finish runner.** These are the successful
verification steps retained from issue #206. The first run's incomplete
isolation, failed probes, and unsafe restoration scripts were rejected in
review. Do not reconstruct that sequence from the scratch directory. The
next run needs verified setup and cleanup before any of these steps runs.

| Script | Behavior and expected observation | Inputs in `Zotero.ZoteroTTSRun` | Last execution |
| --- | --- | --- | --- |
| `01-build-proof.js` | Installed bundle hash/markers and post-install isolation. For this run: bundle `78e40ee2…`, `recordPass` 3, `siblingSpeaking` 2, closed-reader marker 1; test destination matches, all three sync/backup switches off, volume 0 | `state.testUrl`; original settings already snapshotted privately | 2026-10-18, corrected build proof after the initial probe failed |
| `06-pause-once.js` | 6.11: pause the speaking first reader, wait quiet, resume. Require each transport's pause count +1, then +0 for two seconds; audio clock or segment advances after resume. Inspect the fields, not just `ok` | `state.readerA` (`itemID`, `tabID`); A is the first listed reader of this fixture, speaking; its duplicate is idle | 2026-10-18, p9 |
| `09-shared-item.js` | 6.12: after B's pause, stored position matches B, and the exact fixture's shared anchor names its sentence; stamp is this machine's | `params.documentId`; `state.readerA`, `state.readerB`; both live, B paused after speaking later | 2026-10-18 |
| `10-adopt-stable.js` | 6.13: a newer fixture-only native row is adopted, then remains unchanged for five ticks, queue empty and no new pause sync | `params.craftDelta` (default 60000); `state.fixture` (`lib`, `key`, `itemID`), A/B both paused; EPUB has at least six segments | 2026-10-18 |
| `12-close-verify.js` | 6.14: after B closes, its final position is correct and stable in memory and both files. This does not prove the close capture ran only once | `params.documentId`; `state.fixture`, live `state.readerC`, copied `state.finalB` (`pos`, `sentence`); B closed through the real tab-close path | 2026-10-18 |
| `13-skip-reopen.js` | 6.15: a backward skip records, stays stable, beats the previous stamp; closing C does not freeze A; a newly reopened reader records | `state.fixture`, paused `state.readerA`, idle `state.readerC`, copied `state.finalB`; no other speaker | 2026-10-18 |

## Prerequisites and permitted changes

- Read the tester workflow and case first. Use the dedicated test WebDAV
  configuration, never the owner's normal folder for a functional test.
- Snapshot original preference values **and user-value presence**, all
  affected local position/document rows, and the test server files privately.
  Counts are not a substitute for row snapshots. Suspend and settle before
  switching destinations or installing a build; verify the destination.
- Use a newly generated EPUB and only that fixture's attachment identity and
  Document Id. Do not reuse this run's attachment, tab, or document IDs.
  Use a non-metered System voice and muted volume. Create the A/B/C topology
  and plain-data runner state required by the selected step before running it.
- Run through `_shared/run.js`; retain the current run's setup and cleanup
  methods when they have actually succeeded. These six steps are not the
  missing setup or cleanup. An `ok` field never replaces checking the
  case's expected values, transport outcomes, and restoration evidence.
- Mutations: pause/resume, fixture tab opens/closes/skips, sync-switch pokes,
  and a crafted native position for the fixture in the isolated folder.
  The kit does not use native file dialogs, paid synthesis, or a Zotero quit.

## Cleanup gate

Suspend the folder and all sync/backup switches, close fixture readers via
real close paths, settle writes, and erase the fixture. **Erasing its Zotero
attachment does not erase its shared position.** Remove or restore the
fixture's native position, document mapping, shared position, and generated
tombstone from the local store using the verified run's restoration method.
Clear their in-memory counterparts too: disk-only cleanup is insufficient.
Verify the original test-folder bytes, original local rows, and original
settings before restoring automatic sync. Restore switch values last, then
verify no fixture item reappears after that sync. If recovery is incomplete,
leave sync suspended and report it; never call residual shared items harmless.

## Limits and rejected attempts

- Sync counts, not the persistent `lastTrigger` value, identify a new pause.
- The initial audio context was suspended; p9 showed real audio progression.
  One duplicate's later output failed to progress; a fresh tab allowed the
  check to continue. This does not establish a general audio failure cause.
- Select the shared item by the fixture's Document Id. An item absent from
  the original test file can instead be an existing local document uploaded
  by the run. Clone positions before their reader closes.
- The live close result proves correct, stable position data, not once-only
  invocation. The original regression tests cover deduplicated close hooks.
- 6.12's later-speaking B/earlier-paused A arrangement was measured live;
  the reverse stale-paused arrangement is covered by unit tests, not a
  separately demonstrated live trace. 6.11's pause counts cover both orders.
- The first run's restoration uploaded one fixture item to the owner's
  shared file. Corrective recovery removed that exact item conditionally,
  preserved all 29 other items, removed the local fixture rows, and reloaded
  memory with sync off. The restoration sync then uploaded nothing and the
  fixture stayed absent. Full preference values/presence matched afterward.
- The original local baseline had counts only. No non-fixture adoption or
  writing was observed, but pre-existing native rows cannot be proven
  byte-identical against a snapshot that was never taken. The next run must
  take that snapshot. Unexecuted parameterized recovery scripts and failed
  attempts are not retained as reusable methods.

## Run

| Date | Build | Evidence and coverage |
| --- | --- | --- |
| 2026-10-18 | 1.16.12-beta4, `f4ccbbb`, Zotero 11.0-beta.1 on macOS | [Issue #206](https://github.com/xujialiu/Zotero-OpenReader/issues/206): 6.11 real pause +1/+1 then +0; 6.12 eight stored positions follow B, shared anchor matches; 6.13 adoption survives five ticks; 6.14 final captured position stable; 6.15 backward skip/survivor/reopen record. Limits and the corrective recovery above qualify the result. Shutdown remains unit-tested, not run live. |
