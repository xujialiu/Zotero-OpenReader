# Scripts: The reading guard (issues #11, #71, #80, #121, #160)

[Case](../../cases/reading-guard.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | What it expects | Params read |
| --- | --- | --- | --- |
| `00-baseline-and-isolate.js` | Test-WebDAV isolation, transport settle, named preference baseline, owner/player record, mute, minimize | Destination matches `~/.secrets/Zotero-TTS/test_webdav.txt`; transports settled; OpenReader Position absent; switches suspended; volume muted | none |
| `01-startup-and-identity.js` | Installed-build proof and startup | xpi SHA-256 byte-identical to the build xpi; `ztts-close-and-continue` greppable in the installed bundle; startup all-ok | none |
| `02-fixtures-kokoro-system.js` | Kokoro + System enable through the pane; two paused fixtures (X on `local::`, Y on `system::`, Y's tab background) | Both connects OK with no notice; both players paused on listed voices | `fixturesDir` |
| `03-continuity-handoff-discovery.js` | Live list continuity, prepared handoff, failed discovery with bounded transport stub | Controller/voice/catalog identity and running clock survive allowed refresh; handoff protects both voices; omitted voices retained | state from prior scripts |
| `04-sync-restore.js` | Controlled background sync and restore boundary | Unaffected sync fields apply while local is deferred; close applies deferred state; native file restore remains unit-only | state from prior scripts |
| `05-closed-player.js` | Closed-player stale-list invalidation and reopen | Disabling Kokoro clears the closed manager's cached list; re-enable and reopen discover fresh choices | state from prior scripts |
| `06-request-counts.js` | Focused Kokoro request-count supplement and pending impact diagnostic | Exact `(voice,text,index)` count does not rise across refresh or omitted discovery | state from prior scripts |
| `10-enable-never-asked.js` | #160 Enable never asked; uncertain-player attempt; C = `zotero-standard` (sign-in + listing, no synthesis) | `readingImpact({"zotero-standard.enabled": true})` `affected: []`; no `#ztts-notice` during the Enable; pref true; X/Y controllers and voices identical; `applied` rises on both open players | `fixturesDir` |
| `11-used-provider-question.js` | The question (bold lead, X-only list, last line, button order, Cancel focused), Cancel click, trusted Escape; trusted Enter attempted for the record | Lead `This change affects the reading in a tab:`; buttons `Close and continue`, `Cancel`; each cancel keeps the pref true and both players as before | state from prior scripts |
| `12-close-and-continue.js` | Close and continue on the used-provider refusal (guarded prep re-enables local and restarts X on a re-run) | `local.enabled` false in the same click (ms reported, no second dialog); X `popupOpen`/`active` false with the reader still open; Y unchanged | state from prior scripts |
| `13-other-refusals.js` | Favorites-only over an unmarked current voice (all of Y's protected voices marked first); restore refusal recorded NOT TESTABLE | Question lists X only; Close and continue writes `favoritesOnly` (ms) and closes X only; Y untouched; restore not driven (native dialogs) | state from prior scripts |
| `90-teardown.js` | Fixture/player cleanup, exact pref/user-value restoration, logs and minimized host | No fixture readers/players or new plugin errors; original values and user presence restored (syncState re-written after the switches); host minimized | state from prior scripts |

Before you start:

- Install and identify the XPI with `zotero_plugin_list`; run `00` BEFORE the install (isolation), `01` after it. Two fixture readers: X = PDF on Kokoro, Y = EPUB on System voices. C for the Enable check = `zotero-standard` (its check is a sign-in check plus a voice listing — no synthesis, no cost); fish is NOT usable for it (its Enable check synthesizes a probe and can time out, r47).
- The runner derives `fixturesDir` from `params.root`; fixture items are timestamped and disposable. The fixtures script plants `readAloud.memory` on a listed local voice while no tab reads.
- The run snapshots 33 named prefs, mutes `readAloud.volume`, and suspends the three WebDAV switches before any edit; `90` restores them last, with `webdav.syncState` re-written after the switches (their restore re-fires the sync observers).
- A guard click while players are open now opens the two-button question; the OK-only notice of the 1.12.x kit is gone. `12`/`13` carry a guarded prep and can re-run from the state a failed attempt left.

Limits:

- File/WebDAV restore and native confirmation dialogs are unit-only; live scripts do not trigger a blocking native prompt (`13` records the restore row NOT TESTABLE for exactly that reason).
- A trusted Enter that activates a button inside the top-layer `#ztts-notice` is not producible through this bridge (Firefox 140): `nsITextInputProcessor` keydown is consumed by nobody and the bridge's `zotero_send_keys` pressEnter behaves the same (r48c, five presses over two runs). A trusted Escape does fire the dialog's cancel path. `11` records the Enter row as NOT TESTABLE and moves nothing.
- A used-provider Disable during `05`/`06`-style flows applies without a question only while no player is open on that provider.
- Failures and reruns: early harness revisions r1-r3, r5, r8-r15, r22-r23, r25, r28, r31, r34, r36, r38, r40, r42 failed on setup/timing/evidence assumptions and were cleaned; r4, r6-r7, r16-r19, r21, r24, r33, r43, r44 are PASS; r20/r27/r30/r32/r35/r37/r39/r41 teardown-only cleanup reruns. 2026-09-30: r45 isolation PASS; r46 identity PASS, its first fixtures attempt failed (Zotero's last-used voice left a `fish::` pick and the tier id must come from the voice entry) and was superseded; r46b fixtures PASS; r47's Enable row failed (fish probe timed out; its unused-disable and uncertain-session evidence stands); r48 Enable-never-asked PASS; r48c question PASS (Enter NOT TESTABLE); r48d Close-and-continue PASS; r48e/r48f favorites attempt failures (single-voice favorite; heart toggled an existing mark) superseded; r48g favorites PASS; its teardown audit failed only on `webdav.syncState` churn, completed by the post-switch re-restore that is now part of `90`.

Runs (2026-09-17 evidence in the [issue #121 table](https://github.com/xujialiu/Zotero-OpenReader/issues/121#issuecomment-5713289694); 2026-09-30 evidence in the [issue #160 table](https://github.com/xujialiu/Zotero-OpenReader/issues/160#issuecomment-5903420541)):

| Date / build | What ran | Runner run |
| --- | --- | --- |
| 2026-09-17 / 1.12.12-beta6 | Unused/used provider guards, background/paused impact, favorites browser/player PASS (`r7`); closed player + restore boundary PASS (`r19`); continuity/handoff/discovery PASS (`r33`); controlled sync PASS (`r43`); request counts PASS (`r44`) | `2026-09-17-1.12.12-beta6-reading-guard-r7…r44` |
| 2026-09-30 / 1.16.3-beta4 | #160: isolation (r45), identity+startup (r46), fixtures (r46b), Enable never asked with an uncertain player open (r48), question + Cancel/Escape (r48c), Close and continue 51 ms (r48d), favorites-only Close and continue 71 ms (r48g), teardown + syncState re-restore PASS | `2026-09-30-1.16.3-beta4-reading-guard-r45…r48g` |
