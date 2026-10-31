# Scripts: A one-letter word in an EPUB and a snapshot's last block keep their highlight (issues #235, #236)

[Case](../../cases/one-letter-words-and-last-blocks.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Runner](../_shared/README.md) · [breaks-and-images kit](../breaks-and-images/README.md)

Run through `_shared/run.js` (`kit: 'one-letter-words-and-last-blocks'`, `runId: <date>-<build>-one-letter-words-and-last-blocks-<group>`;
one runId per group keeps each script's result file). Item numbers are the case's. The steps this case shares with
the breaks-and-images kit are **run from there by absolute path** (`B + '00-webdav-off.js'`, `B = root +
'/test/zotero-dev/scripts/breaks-and-images/'`; the runner takes absolute entries in `scripts`), not copied; the
three scripts that live here are new. Every script below ran in the 2026-11-01 1.16.16-beta6 run.

| Script | What it checks | What it expects (measured 2026-11-01, beta6) | Params |
| --- | --- | --- | --- |
| `00-before-gate.js` (here) | READ-ONLY gate before anything moves: the installed build is the brief's before-state (version, bundle SHA-256, bytes), the owner's reader is open and not playing, `fish.model` is the free model, no `ztts209` item left. Any miss throws, so the group stops with nothing touched | beta5, `50bdc7c7…1fd57`, 971,260 bytes; owner `active: false`; `s2.1-pro-free`; 0 leftovers; `ok: true` | `ownerItemID`, `expectedBefore`, `expectedBeforeBytes`, `expectedBeforeVersion`, `freeFishModel` |
| `breaks-and-images/00-webdav-off`, `01-baseline`, `02-pre-install-owner-session` | WebDAV switch snapshot and off; every pref, the Document-voice branch, window, readers, rows; mute and debug store on; owner session recorded (a paused one closed with `toggleReadAloudPopup(false)`), minimize | switch `{bool, false, no user value}`, `folder: false`; volume 19 user, memory and default voice System Samantha, 77 rows, 80 records; `hadSession: false`, `ok: true` | `ownerItemID`, `expectedBefore` |
| (install) | `zotero_plugin_install` of the brief's xpi, then `zotero_plugin_list` | `OpenReader v1.16.16-beta6` | |
| `breaks-and-images/03-install-identity` | **Item 1**: `startup()`, xpi and bundle SHA-256, `marker` found, `absentMarker` gone, add-on version, folder off, owner's position the same. Run it **alone** (it returns `ok:false`, never throws) | 29 steps, `failed: []`; xpi `ec33e2a1…e4cc`, bundle `9e8bdca1…866b7`, 972,117 bytes; `MAX_APPENDED_TO_BODY` found, `const value = typeof selector?.value === "string"` absent; `folder: false`; `storedSame` | `expectedBundle`, `expectedXpi`, `expectedVersion`, `ownerItemID`, `marker`, `absentMarker` |
| `breaks-and-images/10-import-fixtures`, `20-open-reader` | `br-alt-text.epub` / `.html` imported; the Player up, paused, muted; the 8 Segments | EPUB 2,000 B, HTML 1,061 B, unchanged; voice System Samantha; Segment 6 `A small figure sits in this sentence.`, 7 `The last paragraph is plain again, …` | `which` (`epub` / `snapshot`) |
| `breaks-and-images/25-pick-voice` | Picks a listed voice in the open Player | Fish: 664 `fish` + 194 `system` offered; the pick moves no global default | `which`, `tier`, `voiceId`, `preferId` |
| `30-read-and-sample.js` (here) | **Items 2-5**: per target, `repositionTo` then a 4 ms poll, `togglePaused()` in the tick that sees the word (`word: [s, e]`), or the first word at `mid` of the sentence, or 800 ms into a stand-in; keeps the sample only if the manager still names the word after the pause. Samples the primary: colour, selector (type / value / refinedBy), text drawn, client rects, Zotero's own selector for the same word and what it draws, `primaryShown`, `sentencePieces` uncut | EPUB Fish `A` [0,1]: `#3478f6b3`, `epubcfi(/6/2!/4/14/1,:0,:1)`, draws `A`, rect 11.63x20, `primaryShown: true`, pieces `{head: null, tail: ' small figure  sits in this sentence.'}`, Zotero's own `epubcfi(/6/2!/4/14/1:0)` draws `''`; `small` [2,7]: Zotero's own `…/1,:2,:7)`; stanza (System): `#ffff00b3`, `granularity: sentence`. Snapshot Seg 7 System: `#ffff00b3`, `body > p:nth-last-child(3)`, whole paragraph, Zotero's `body > p:last-child` draws null; Fish `plain` (22-27): `#3478f6b3`, same step + TextPositionSelector 22-27, head + word + tail = the paragraph; Seg 6 Fish `A` and `in`: Zotero's own `body > p:nth-child(7)` + TextPosition | `which`, `label`, `targets[]` (`name`, `index`, `word` / `mid`, `expectKind`), `maxMs`, `tries`, `pollMs`, `freeFishModel` |
| `breaks-and-images/90-close-player`, `91-minimize.js` (here) | Closes the fixture Player and tab; minimizes (the window stays restored only while a step needs layout) | `after.active: false`, `tabClosed: true`; `windowState` 3 -> 2 | `which`, `closeTab` |
| `breaks-and-images/50-log-lines` | **Item 6**, log half: `highlight:` lines per `ZTTS209-MARK` block (the sampler writes the same markers), the two named failure lines, error-like lines | `named: []`, `errorLike: []`; `word position repaired before drawing` once, in `epub/fish-A`; `sentence selector repaired` once, in `snapshot/system-last` | none |
| `breaks-and-images/80-cleanup`, `85-final-audit` | Players and tabs closed, fixtures erased, every pref and record back (volume 19 user, memory last), folder switch, debug store, owner's tab, minimize; an independent reread | `ok: true` both; only `readAloud.volume` had differed; 80 records, 77 rows, `windowState: 2` | `expectedBundle` |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list`. Run `00-before-gate.js` in the first group, **before** `00-webdav-off`
  (breaks-and-images/02 gates the same hash only after 00 and 01 have moved prefs). The bundle hash proves the build.
- Order: `api.reset()` (delete stale shared params except `preferId`, which holds the owner's Fish voice in memory only:
  never write it into a file, never call `status()`); group 1 `00-before-gate`, `00`, `01`, `02`; install; `03` alone;
  `10`, `20` (epub); `25` fish; `30` (EPUB `A`, `small`) as the **first reading after the install**; `25` system
  (`voiceId` = the Samantha id `20` reports), `30` (stanza); `90` closeTab, `91`; `20` (snapshot); `30` (Segment 7,
  System); `25` fish; `30` (Segment 7 `mid: 0.32`, Segment 6 `A`, `mid: 0.45`); `90`, `91`, `50`; `80`, `85`.
- Not a WebDAV test: the switch is snapshotted and turned off by `00`, `folder: false` is confirmed after the install (`03`)
  and again by `80`/`85`. Params outlive a run: pass `which`, `tier`, `voiceId`, `targets` every time.
- Fixtures: `test/fixtures/br-alt-text/` (the breaks-and-images fixtures). Segment index = paragraph number.
- Touches: volume (muted to 0), debug store, Document-voice records of the two fixtures, `reader.readAloudVoices`, window, tab.
- Replies: `20` restores the window and its bridge reply can come back `undefined` (the group still ran; seen once on the
  EPUB open): `api.wait(runId, ms, 0)`, never start twice. `zotero_read_errors` fails with "console actor" at that moment.
- Read `zotero_read_logs` (it reads the debug store) before `80` switches the store off.

## Limits

- The word is lit for a fraction of a second, so `30` polls every 4 ms from the `repositionTo` call. All seven targets were
  caught on attempt 1 (`A` at 1,932 ms: Fish synthesis; later words 52-900 ms); the `missed`, `not-held`, `not-paused` and
  `timeout` branches, and `00-before-gate`'s throw branches, have not been exercised.
- `logChange` writes each line once per change of its key: `word position repaired before drawing` shows only at the first
  repair after the install (the EPUB `A`, so paragraph 6 goes first); the snapshot's Segment 7 then logs only
  `sentence selector repaired`. Judge items 3-5 by the samples, the log only for item 6.
- The page text holds a double space at paragraph 6's image gap (`figure  sits`); compare head + word + tail normalized.
  The first word's `head` is `null` in the EPUB (collapsed cut) and `""` in the snapshot (empty, not collapsed).
- Zotero's own selector for a Segment is `body > p:last-child` (snapshot) and the point `epubcfi(/6/2!/4/14/1:0)` (EPUB "A"):
  `30` computes them with `_computeActiveWordSourcePosition` on a stand-in manager built in the reader's realm, no session moves.
- Noise in `zotero_read_errors`: `compatible: listing voices failed` x3 (the owner's dead local server, 127.0.0.1:8765),
  `Couldn't decrypt string` from Zotero's sync runner on every item change and reader open, locale `.ftl`, two
  `uncaught exception: undefined` per install. `01`, `02`, `03` write the owner's Fish voice into `.tmp/.../results/*.json`
  (git-ignored): mask `fish::<lang>/<32 hex>` there after the run.

## Runs

| Run | Result | Last executed |
| --- | --- | --- |
| 2026-11-01, 1.16.16-beta6 (bundle `9e8bdca1…866b7`), Zotero 10.0.6; issue comment: not posted by the tester | 1 PASS; 2 PASS; 3 PASS; 4 PASS; 5 PASS (EPUB `small` Fish, EPUB stanza System, snapshot Segment 6 Fish `A` and `in`); 6 PASS (named lines absent, no plugin error besides the dead `compatible` server); no NOT TESTABLE | every script above |
