# Scripts: system-voice-refresh — refresh installed Windows voices without restarting Zotero

[Checklist index](../../README.md) · [Case](../../cases/system-voice-refresh.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

| Script | What it checks | What it expects | Params it reads |
| --- | --- | --- | --- |
| `system-00-baseline.js` | Baseline 0 snapshots ONLY, no preference writes: 11 named prefs with EFFECTIVE value + user flag, rows, positionSync, documentVoices records, window/tabs, readers, debug store (enable recorded), errors ring, old-build startup | complete snapshot in `Zotero.ZoteroTTSRun.state` | — |
| `system-01-isolate-webdav.js` | Bounded idle wait (positions, shared positions, settings-sync, upload pending — all `false`), folder off, `folder:false` confirmed, THEN mute reusing 00's volume snapshot (verified value+flag before the write) | `orderingOk:true`, `isolated:true`; stops the pass if isolation cannot be confirmed | — |
| `system-02-old-count.js` | The OLD build's System voice count before upgrading | whatever the retained helper holds (historical research: nine; 2026-11-05: 40 — helper restarted since the bridge registration) | — |
| `system-03-identity.js` | Install gate: startup steps all ok, failed empty; installed xpi + inner bundle SHA-256; markers; folder:false again | hashes match the build; `identityOk:true` | — |
| `system-04-warm.js` | Warm `systemProvider()` on the new build; full id list; corrected helper-PID probe | exact local Andrew token; first voice Microsoft David Desktop | — |
| `system-05-fixture-player.js` | Import fixture-a.pdf, plant its document-voice entry (David Desktop), open + pause its Player, record identities + the fixture's OWN liveVoiceList entry (matched by itemID) | mounted, paused, David selected; live entry `{applied:1, revision:1}` | `fixturesDir` (else derived from `root`), `root` |
| `system-06-test-connection.js` | Click the real **Test connection** once; trace + daemon lines + corrected PID probe (Zotero children, `$PID` excluded) + open-Player refresh | `Connected. <count> voices`; one stop-refresh + one start; exactly one helper PID replaced; fixture `applied` rises; voice/controller identity and paused retained | — |
| `system-07-browser-and-others.js` | Voice browser: System / `English (N)` rows; persisted owner state vs snapshot (structural, excluding the fixture entry) | local Andrew row (no "Online" in its label); only the expected fixture write in readAloudVoices | — |
| `system-09-andrew-synthesis.js` | ONE synthesis with the exact local Andrew HD token | exact record, bytes > 0, audio MIME, no synthesisError, real word marks or an honest note | — |
| `system-10-enable-path.js` | Close only the fixture Player; Disable→Enable through the pane; two ordinary listings | Enable performs the refresh (one stop-refresh + one start); ends enabled; listings reuse the helper (starts unchanged) | — |
| `system-11-fixture-teardown.js` | Close the fixture tab, erase the fixture, rows back to baseline, remove its document-voice entry, reselect the user's tab | rows == baseline; docVoices keys == baseline | — |
| `system-12-final-restore.js` | Close settings window; restore every named pref (incl. `system.enabled`) with effective value AND user flag — volume and memory before WebDAV, memory last; bounded settle of pending sync/upload; then the FINAL post-last-write recheck of every pref value+flag, fixture row/entry absence, selected tab, minimized geometry | `recheckAllOk:true`; a settle or recheck failure is reported as a block, not PASS | — |

Issue #241. The Windows helper holds System.Speech's process-wide voice snapshot; a
connection check or an Enable now queues a generation-guarded helper replacement
(`daemon.reset()`, `daemon.ts:231-242`) and the pane notifies the coalesced live-list
refresh after an accepted change (`prefs-pane.ts:740`, `provider-rows.ts:238`).

## Before you start

- Bridge up (`zotero_ping`), one driver, `zotero_plugin_list` before and after the install.
- Install the beta with `zotero_plugin_install`; then `diagnostics.startup()` must be all-ok.
- Run the scripts as one disk-runner group (`run.start({ root, kit, scripts, runId,
  params: { fixturesDir, tmpDir }, stopOnError: true })`) — results land under
  `.tmp/zotero-dev/<runId>/results/`.
- State it touches: the 11 named prefs above (restored 12), the fixture item + its
  documentVoices entry + its reader tab (erased 11), WebDAV folder switch (01 → 12),
  volume (01 → 12), debug store (00 → 12), selected tab/window (restored 11/12, left
  minimized). Never touches the user's WebDAV server (idleness is read from the
  plugin's own transport stats), the registry, or framework-private caches.
- The volume write happens only after 01 confirms `folder:false` and idle transports.

## Limits

- **2026-11-05 part-1 procedural FAIL, corrected:** script 00 then muted before 01
  confirmed the folder switch off. New-build evidence showed `uploads:0`, but the old
  build's counters were reset by the upgrade, so this proves only that no backup upload
  was OBSERVED in the new build — not that nothing ever reached the server. The
  corrected ordering (00 snapshots only; 01 isolates, confirms `folder:false`, then
  mutes reusing 00's snapshot) was executed in the 2026-11-05 mini-pass.
- Part-1 probe FAILs, corrected and re-executed in the mini-pass: `liveVoiceList()` read
  with `find(first non-null)` (that is the closed owner reader — match by
  `state.fixture.itemID`); the PID probe matched its own enumerator (filter
  `ParentProcessId == <Zotero pid>`, exclude `$PID`); 07 hard-coded `English (United
  States)` (this machine's System locales are `Chinese (N)` / `English (N)`).
- `documentVoices().records` is structured: compare structurally, excluding the fixture
  entry; `readAloudVoices` legitimately gains the fixture's David entry when the popup
  applies the planted choice — restore byte-identically, never call it a product change.
- `system-03` and `system-04` final revisions were executed verbatim in the 2026-11-05
  retention pass (see Runs). Earlier runs used their part-1 revisions (03 without the
  jar-channel branch, 04 with the self-matching PID probe — corrected evidence for the
  probe method itself came from the mini-pass 06).
- A timeout recovery probe (fixture/index recovery + named-field checkpoint writer) is
  NOT a kit step; it lives in ignored scratch
  (`.tmp/zotero-dev/andrew-natural/recovery-checkpoint-probe.js`), which also holds the
  part-1/resumed-run checkpoint (`recovery-checkpoint.json`).
- Unit-only: the six contention/startup/failure/stop races are covered by tests; never
  force them live by registry or framework-cache edits.
- The UI selectors target English Zotero. In 07, `andrewIsLocal` describes
  whether *all* Andrew-named rows are local; it is false when Online variants
  are listed too. Acceptance is the local `Microsoft Andrew` row plus the
  exact backend token, not that aggregate flag.
- Count drift, recorded 2026-11-05: warm list 40 (34 sapi5 + 6 OneCore) vs the research's
  39 — the bridge also exposes Edge neural Online tokens; assert the LOCAL Andrew by
  token (`sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1`), never by label suffix (#240).

## Runs

[Verification table and closing summary](https://github.com/xujialiu/Zotero-OpenReader/issues/241#issuecomment-6650867840).

| Run | Build | Scripts executed | Result |
| --- | --- | --- | --- |
| 2026-11-05 part 1 | 1.17.1-beta, Zotero 10.0.7 | 00–07 first revisions (00 muted before isolation — procedural FAIL; 05/06/07 probe FAILs) | items 1–2 evidence collected; harness timeout ended the pass |
| 2026-11-05 resumed | 1.17.1-beta | 07 final, 08 (now scratch), 09, 10, 11, 12 first revision + corrected live-list recovery probe | items 2 (corrected), 3, 4, 6 PASS; item 5 NOT TESTABLE (unit-only) |
| 2026-11-05 mini-pass | 1.17.1-beta | **00, 01, 05, 06, 11, 12 final revisions** (`runId 2026-11-05-1.17.1-beta-system-voice-refresh-minipass`) | all PASS: ordering/isolation evidence, clean 1-PID replacement, applied 1→2, `recheckAllOk:true` |
| 2026-11-05 retention | 1.17.1-beta | **03, 04 final revisions verbatim** (`runId 2026-11-05-1.17.1-beta-system-voice-refresh-retention`) | both PASS: startup 30/30, xpi + inner hashes match, markers 1+4, folder:false, `identityOk:true`; 40 = 34 sapi5 + 6 onecore, local AndrewHD.1, first David Desktop, single Zotero-helper PID attributed |
