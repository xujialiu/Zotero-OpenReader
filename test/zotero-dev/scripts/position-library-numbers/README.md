[Checklist index](../../README.md) · [Case](../../cases/position-library-numbers.md) · [Runner](../_shared/README.md)

# A position under another computer's library number is taken here (#187) — the kit

Against the test WebDAV folder of the Test WebDAV rule, never the owner's own;
`webdav.syncPositions` is the switch under test and is turned on only for
items 1–3. The fixture is the run's own generated PDF (six pages; `.tmp/
zotero-dev/position-library-numbers/make-fixture.py` builds it — page 4 must
carry a normal multi-line body paragraph, see Limits). **Last** is the run in
the table at the foot that executed the script.

| Script | What it checks | What it expects (measured) | Params | Last |
| --- | --- | --- | --- | --- |
| `00-isolate-and-baseline.js` | Test-WebDAV isolation and baseline before the install: named prefs snapshotted raw into state, transports settled, the three sync/backup switches suspended, destination switched and confirmed by match only, volume snapshot, owner players none, debug store, host minimized, baseline counts | destination match true; baseline rows 75 / localEntries 75 / tombstones 187 / documents 93 / sharedItems 15 | — | beta5 |
| `01-build-proof.js` | The installed bundle's SHA-256 and the #187 marker; re-isolation after the install (an upgrade may poke the switches) | sha256 `d2c5d320…`, 925,758 bytes, marker 3, version `1.16.12-beta5`; url still test, folder true (as found), three switches false, volume 0; counts unchanged | `state.testUrl` | beta5 |
| `02-rows-snapshot.js` | COMPLETE local-row snapshot before the first change: all rows of `positions`, `deletions`, `documents`, `document_positions` through a second absolute-path DB connection; whole rows kept in state and `.tmp`, only counts + hashes returned | 75 / 187 / 93 / 15 rows; four SHA-256 hashes; no earlier item of the fixture title | — | beta5 |
| `03-server-files-snapshot.js` | Both test-folder files byte for byte as found (GET inside Zotero, credentials never leaving the process); stashed to state and `.tmp`; summary by entry ids and ts | native 8,841 bytes sha `cf39911c…` (73 items, all lib 1); shared 6,380 bytes sha `2c99f1dc…` (15 items) | `state.testWebdav` | beta5 |
| `10-fixture-import.js` | The run's PDF imported into My Library; nothing recorded | itemID/lib/key into `state.fixture`; counts unchanged | `fixturePath`, `fixtureTitle` | beta5 |
| `11-harvest-rect.js` | The crafted point, harvested live without recording: open the tab (select it — a background tab builds no SDT), `await _loadSDT()`, walk the tree for page 4's first text node (the paragraph container holds `anchor.pageRects`, the text child `textMap`), take the first character's run rect via `mapper._getRunData`, close the tab | `craftPos` `{pageIndex: 3, rects: [[73.5, 723.9, 73.5, 723.9]]}`; `flowClass` not `excluded`; counts unchanged after close | `state.fixture` | beta5 |
| `12-craft-and-adopt.js` | Item 1: the switch on (its poke settles), the file as it stands + one canonical item under a `Zotero.Libraries.exists` false number, fresh tab open, the reader-open sync adopts under this computer's number | `position sync (reader-open): 76 remote, 76 merged, 1 adopted (1 under this computer's library number), 0 dropped`; adopted 1, remapped 1, localEntries +1; store holds the crafted pos; file: `lib 7` as written | — | beta5 |
| `13-resume-shift-space.js` | Item 2's pull: trusted Shift+Space, view page 1, volume 0 — the resume pull runs before anything else | `position sync (resume)` logged first; the session's start depends on the voice state (see the case run's notes) | — | beta5 |
| `13a-reset-crafted-state.js` | Run-owned recovery (used three times this run): with sync suspended, the local row and the file's mirror are reset to the crafted point and ts; a reinstall between scripts reloads the sampler's map | row and file entries back to `craftedTs`; counts unchanged | `state.craftPos`, `state.craftedTs` | beta5 |
| `14-close-and-settle.js` | Item 3: the tab close sync, both entries in the file (lib 1 newer than the crafted ts, lib 7 as written), then two reopen+close pokes that upload nothing and leave the file byte-identical | close ok; entries `lib 1` ts > crafted and `lib 7` ts = crafted; two pokes uploaded false, same SHA-256 | — | beta5 |
| `20a-teardown-fixture-v1.js` | Run-owned teardown of a superseded fixture (suspend, close, erase, tombstone+rows out, the file's two entries out, all four store hashes back to the 02 snapshot) | hashes match the snapshot exactly; file stripped; still suspended | — | beta5 |
| `40-cleanup-erase-and-rows.js` | The cleanup gate, first half: erase the fixture, the tombstone and any of its rows out of the store, all four hashes vs the snapshot | rows 75 / deletions 187 / documents 93 / documentPositions 15; hashes match; suspended throughout | — | beta5 |
| `41-cleanup-files-and-prefs.js` | The cleanup gate, second half: both files PUT back to the as-found bytes, SHA-verified, no fixture key; the prefs audited against the baseline (values + user-value presence); local counts vs baseline | native sha `cf39911c…`, shared sha `2c99f1dc…`, stable after settle; no fixture key; rows 75 / 75 / 187 / 93 / 15; switches as found (off) | `state.baseline` | beta5 |

## Before you start

- Read the tester workflow and the case. `zotero_ping`, the isolation (00),
  then the install and `diagnostics.startup()` — prove the build by the
  bundle hash, never the version string.
- The fixture: generate with `.tmp/zotero-dev/position-library-numbers/
  make-fixture.py` (recreated each run, gitignored). Page 4 needs a body-like
  paragraph — a page holding one short line is classified `excluded` by
  Zotero's analysis and is never segmented, so a resume at its point falls to
  the next included segment (measured this run; 11 now refuses such a block).
- The crafted point comes from the live SDT, never from guessed PDF
  coordinates; the first character's run rect, centered, one decimal.
- `webdav.syncSettings` and `webdav.autoUploadSettings` stay off the whole
  run; `syncPositions` is on only for items 1–3 and off again at cleanup.

## Limits

- `Zotero.Prefs.set('zotero-tts.…', v, true)` writes a stray ROOT pref — with
  the full-name flag the name must be complete (`extensions.zotero.…`). The
  first 12 attempt failed exactly that way; use `Services.prefs.setBoolPref`.
- `JSON.stringify` on a queryAsync row or a reader-compartment array throws
  (`toJSON` / dead object) — copy to plain objects/`Array.from` first.
- `_sdt` stays empty until `_loadSDT()` resolves it; a background tab builds
  no SDT at all — select the tab.
- The reader-open sync merges `local()` BEFORE adopting, so the mirror entry
  rides the NEXT sync (the resume pull here), not the reader-open one.
- A stop/pause sync can carry the reading's upload, so the close sync may read
  `uploaded false` where the case expected true — the file state is the same.
- Item 2's System voice was not reachable on this profile (signed out: the
  player's system entry lists no voices) — see the case run's report.
- Restoring `readAloud.memory`/`readAloud.defaultVoice` by pref writes does
  not stick while the plugin runs: the running memory-sync re-persists its own
  state at shutdown. Restore through a pane voice pick, or verify right after
  a reinstall and report what still differs.

## Run

| Date | Build | Evidence and coverage |
| --- | --- | --- |
| 2026-10-18 | 1.16.12-beta5, `d2c5d320`, Zotero 11.0-beta.1 on macOS | [Issues #187, #207]: item 1 PASS (the reader-open line exact, adopted 1, remapped 1, store holds the crafted pos, the mirror rides the resume pull); item 2 NOT TESTABLE on this profile (resume line first and the position mechanism observed; the System-voice session would not start signed-out; one landing at the crafted sentence ran on the fish voice before it was forbidden — reported, not retained as a pass); item 3 PASS on substance (both entries, lib 1 newer, lib 7 as written, two byte-identical settle pokes) with the upload observed on the pause sync, not the close; #207 item 17 PASS both halves (the failed line exact with the Positions File's time; recovery in 414 ms, no pane reload); cleanup gate closed (store hashes = snapshot, files = as-found bytes, prefs back except the two voice prefs — reported as the run's remaining debt). |
