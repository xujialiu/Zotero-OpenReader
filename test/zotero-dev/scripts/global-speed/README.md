# Scripts: the global speed travels (issue #82)

[Case](../../cases/global-speed.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

The global speed as an ordinary setting (`readAloud.speedPercent`, hundredths):
the one-time migration without a sync stamp, the local change that travels
(pushed like the volume), the incoming speed that adopts and spreads (deferred
while a player is open), the reading guard on restores, and the "one speed
everywhere" switch. Runner scripts, `kit: 'global-speed'`,
`runId: 2026-09-29-1.16.3-beta-global-speed`, params `fixtureTitleA`,
`fixtureTitleB`, and (tails) `item3Ts`/`item4Ts` — the crafted item's ts, which
05/06 print and 05b/06b verify against.

## Before you start

- `zotero_ping`, then `00` **before installing** — snapshots the case's prefs
  with user flags, mutes `readAloud.volume`, verifies the test WebDAV
  destination from `~/.secrets/Zotero-TTS/test_webdav.txt`, suspends the three
  sync switches, settles the transports, minimizes the host. `01` records the
  old build's `readAloud.memory` `speed`, deletes a stale shared file, clears
  `webdav.syncState`, and seeds the sync on the old build. Install the xpi,
  `zotero_plugin_list` for the `-betaN`, then `02` before anything else.
- **Build proof by mechanism**: `JSON.parse(diagnostics.readAloudMemory())`
  must carry `speedPercent` and `speedMigrated` (absent before #82) — never the
  version string alone.
- **State touched:** the sync switches and `webdav.url` (test destination for
  the run), `webdav.syncState` (cleared, restored), the shared settings file on
  the test WebDAV (rewritten by the seed and the crafted items; restored to its
  pre-run bytes), `readAloud.volume` (0 during the run), `fish.enabled`
  (temporarily on — every provider was off and the memory names a Fish voice;
  original had no user value), `readAloud.globalSpeed` (off in 08, restored),
  `readAloud.speedPercent`/`globalSpeedMigrated` (left in the state the beta
  produces: 145 / true), two imported fixture tabs with muted paused players
  (erased at cleanup), the pane. Nothing owner-owned.
- **Restore the host window** for the trusted Shift+C (04) and the popup opens
  (03/06/07); minimize again after each; leave it minimized at the end.
- **Crafted-file race**: before writing the shared file, wait for the transport
  to be quiet (`running false`, `lastAt` > 1.5 s old) and verify the PUT stuck —
  a sync in flight across the PUT reads a partial file and heals it back
  (settings-sync-transport.ts treats a malformed download as absent). Raw file
  reads retry until JSON (one flaky body mid-run).
- Audio probe: this machine's script-started sessions stay `suspended`
  (AudioContext prevented, muted) — every item here is a mechanism check; none
  needs playback to advance.

## Run order

| Script | What it checks | Expects |
| --- | --- | --- |
| [00-baseline-and-isolate.js](00-baseline-and-isolate.js) | Prefs with user flags, memory `speed`/voice, isolation, switches off, minimize | Destination matches the file; memory voice `::`-bearing; host minimized |
| [01-seed-old-sync.js](01-seed-old-sync.js) | Old speed recorded; new prefs valueless; stale file removed; sync seeded on the old build | `oldSpeed` (1.45); `globalSpeedMigrated`/`speedPercent` no user value; seeded keys without `readAloud.speedPercent` |
| [02-post-install.js](02-post-install.js) | Migration and no stamp (item 1) | `startup` failed `[]` with a `global speed` step; `speedMigrated` true; `speedPercent` = old × 100 (null at 1.0); `memory.speed` unchanged; JSON keeps its `speed` field; stamps hold no `readAloud.speedPercent` before/after; pane-open sync `pushed 0 uploaded false`; no item in the file |
| [03-fixtures-and-probe.js](03-fixtures-and-probe.js) | Two fixtures, players open+paused, audio probe, pre-change state | Both managers active+paused on the memory voice; `speedPercent`/speeds recorded |
| [04-change-travels.js](04-change-travels.js) | Trusted Shift+<speed up> travels (item 2) | Pref +5, both readers and every `zotero.<lang>.speed` at once; stamped at once; ≤ ~11 s `change` push with the new hundredths, `by` this machine, ts = stamp |
| [05-adopt-170.js](05-adopt-170.js) | Incoming 170 adopts with no player open (item 3) | Pane-open sync adopts (`pushed 0 uploaded false`); pref 170, memory 1.7, readers 1.7, all languages 1.7; stamp = item ts; file unchanged |
| [05b-adopt-ui-tail.js](05b-adopt-ui-tail.js) | Item 3's file/UI half | Item intact (by tester, ts = stamp); slider `1.7×`; status line ends `Global speed: 1.7×` |
| [06-defer-190.js](06-defer-190.js) | Incoming 190 waits while a player is open (item 4) | Sync `deferred`; pref/reader 170/1.7; 3 s paused hold releases nothing; closing the popup applies via the `player-close` sync: pref 190, reader 1.9 |
| [06b-apply-tail.js](06b-apply-tail.js) | Item 4's apply invariants | Pref/memory 190/1.9; readers + all languages 1.9; stamp = item ts; file unchanged; `player-close` applied it, from tester |
| [07-restore-guard.js](07-restore-guard.js) | The reading guard on a restore (item 5) | Player open: `readingImpact({'readAloud.speedPercent': …})` names the fixture tab; unchanged volume, an unrelated key, and a backup without the key affect nothing; player closed: quiet. The click-through (file picker + confirm) is native — never triggered |
| [08-global-speed-off.js](08-global-speed-off.js) | One speed everywhere off (item 6) | Pref 210 and slider 2.1×; readers and languages stay 1.9; adopted, `pushed 0`; stamp = item ts; switch restored; the flip spreads nothing |
| [09-cleanup.js](09-cleanup.js) | Item 7 | Shared file = pre-run bytes; switches/URL/syncState as found; fixtures erased, tabs closed; volume/fish/globalSpeed/voices restored (voices and memory byte-identical, memory LAST); speedPercent 145 + migrated true left; host minimized |

## Limits

- `popupOpen` reads false through the wrapper — close players unconditionally
  and wait on `active` (§3). `lastApplied` can hold the previous sync's report —
  match applies on the pref itself (06's fix).
- The reading-guard decision is the live evidence for item 5; the restore's
  native dialogs are unit-covered (the reading-guard kit's precedent).
- 05's tolerant-GET and quiet-wait guards ran; its final tail (file+UI checks)
  is 05b's executed code. 06's revised apply-wait matches the pref; the live
  apply it waits for is 06b's executed evidence.

## Runs

| Run | Build | Items | Result |
| --- | --- | --- | --- |
| 2026-09-29 | 1.16.3-beta (installed over 1.16.2-beta7) | 1–7 | All PASS. Item 1: migrated 1.45 → 145, no stamp, pane-open sync pushed 0/uploaded false, no file item. Item 2: Shift+C → 150, all readers+languages, pushed 1 by this machine. Item 3: 170 adopted (adopted 1, pushed 0), slider/status 1.7×. Item 4: deferred while paused, `player-close` applied 190, readers+languages 1.9. Item 5: guard names the tab open, quiet closed. Item 6: 210/2.1× with readers+languages held at 1.9. Cleanup: byte-identical memory/voices, file restored, fixtures erased, deletions 98, errors ring +3 known |
