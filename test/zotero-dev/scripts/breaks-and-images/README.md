# Scripts: A sentence holding a line break or an inline image keeps its highlight (issue #209)

[Case](../../cases/breaks-and-images.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Runner](../_shared/README.md)

Run through `_shared/run.js` (`kit: 'breaks-and-images'`, `runId: <date>-<build>-breaks-and-images`).
Item numbers are the case's. Every script below ran in the 2026-10-31 run (see Runs).

| Script | What it checks | What it expects (measured 2026-10-31) | Params / state |
| --- | --- | --- | --- |
| `00-webdav-off.js` | Snapshots the folder switch (value, user flag), settles transports, turns it off | snapshot `{bool, false, no user value}`; `folder: false` | writes `state.webdav` |
| `01-baseline.js` | Value, type and user flag of 35 named prefs (no credential), the whole `documentVoices.*` branch, window, tabs, debug store, readers, rows; then mutes and turns the debug store on | volume 19 user, memory and default voice the free System Samantha, 77 rows, 80 voice records | `ownerItemID`; writes `state.baseline` |
| `02-pre-install-owner-session.js` | Gate: installed bundle hash is the brief's "before" build, else stops with nothing touched. Records the owner's reader, closes its session with `toggleReadAloudPopup(false)`, minimizes | `gate: true`; `active` true to false; tab open; `stored` unchanged | `ownerItemID`, `expectedBefore`; writes `state.owner` |
| (install) | `zotero_plugin_install` of the brief's xpi, the tester's own call | | |
| `03-install-identity.js` | Item 1: `startup()` first, xpi and bundle SHA-256, `function segmentTextOf`, add-on version, folder still off, owner's saved position the same | 29 steps, `failed: []`; hashes equal the brief's; `folder: false`; `storedSame: true` | `expectedBundle`, `expectedXpi`, `expectedVersion`, `ownerItemID` |
| `10-import-fixtures.js` | Imports `br-alt-text.epub` (standalone) and `br-alt-text.html` (snapshot under a disposable webpage parent); hashes the sources before and after; stops over leftover `ztts209` items | EPUB 2,000 bytes, HTML 1,061 bytes, sources unchanged | writes `state.fx` |
| `20-open-reader.js` | Restores the window, opens a fixture, brings its Player up held paused and muted, lists Zotero's Segment list | 8 Segments: 0 title, 1 plain, 2 stanza (`<br/>` read as a space), 3, 4 `x over y`, 5 `x sub i`, 6, 7; voice `system::osx/…Samantha`; view `epub` / `snapshot` | `which`; writes `state.readers` |
| `25-pick-voice.js` | Picks a listed voice in the open Player; refuses an id without `::`; reports what the pick moved | Fish: 664 `fish` and 194 `system` voices offered; global default not changed; the fixture gets a manual voice record | `which`, `tier`, `preferId` |
| `30-read-paragraphs.js` | Items 2-6: reads Segments, samples once mid-sentence, pauses there. Primary color, `diagnostics.highlight()` fields, the text each slot draws uncut, the old check (`toString()` against the Segment text), Engine session, log lines | System voice: `kind: stand-in`, `granularity: sentence`, `primaryColor #ffff00b3`. Fish: `kind: real`, `granularity: word`, `#3478f6b3`, `sentencePieces` an object, head + word + tail = the page text. A failing sentence: `#00000000` or `sentencePieces: false` | `which`, `label`, `indices`, `maxMs`, `midFraction`; writes `state.samples` |
| `35-range-dom-probe.js` | Per Segment: `range.toString()`, the range's nodes, and a replay of `segmentTextOf` (and of a variant that skips the reader's own "Zoom In" label) against the Segment text | Snapshot: images keep their source `alt` / `aria-label`, replay equals the Segment. EPUB: every `<img>` reads `aria-label="Zoom In"`, class `clickable-image` | `which`, `indices` |
| `40-screenshot.js` | PNG of the window, with the plugin Player's iframe hidden for the capture and put back | 1443x946 PNG of about 100 KB, `popupRestored: true` | `which`, `name`, `shotDir` |
| `50-log-lines.js` | Item 7: every `[zotero-tts] highlight:` line per `ZTTS209-MARK` block, the two named lines, error-like lines | the two named lines only in EPUB / system / Segment 4 | none |
| `90-close-player.js` | Closes a fixture Player (and its tab with `closeTab`) | `after.active: false` | `which`, `closeTab` |
| `80-cleanup.js` | Fixture Players and tabs closed, items erased, voice records and every snapshot pref put back (native voice map second to last, memory last), 2.5 s settle, audit, folder switch, owner's tab, minimize, owner's reader compared | `ok: true`; only `readAloud.volume` had differed; 77 rows | none; writes `state.cleanupOk` |
| `85-final-audit.js` | Independent reread of build, prefs, voice records, items, readers, owner, rows, window; writes `samples-all.json` into the run folder | `ok: true` | `expectedBundle` |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list`. The brief names the bundle hash of the build to expect
  before the install and of the one under test; `02` stops on any other. Two branches named a `1.16.16-beta3`
  (2026-10-31), so the version string proves nothing, the bundle hash does.
- Order: `00`, `01`, `02`, install, `03`, `10`, `20` (epub), `25`/`30`/`35`/`40` as needed, `90`, `20` (snapshot)
  and the same, `50`, `80`, `85`. Not a WebDAV test: `00` before `01` mutes or changes anything.
- Fixtures: `test/fixtures/br-alt-text/` (`build.py` rebuilds both). Paragraphs 1 plain, 2 stanza with three
  unspaced `<br/>`, 3 `<br/>` plus newline, 4 image `alt="x over y"`, 5 image `aria-label="x sub i"`
  `alt="xi.png"`, 6 image `alt="figure-1.png"`, 7 plain.
- Voices: a free macOS System voice (no word timing, Zotero's whole-Segment stand-in) and a word-timed one that is
  already enabled (Fish Audio, free model `s2.1-pro-free`; Azure and Kokoro were off, Kokoro sits behind Cloudflare
  Access). Never Zotero's Standard or Premium. Mute stays on: `readAloud.volume` 0.
- Touches: volume, debug store, the fixtures' Document voice records, window and tab. `80` restores all from the
  `01` snapshot by exact full name; run it after a failure too.
- A bridge reply can be lost (`undefined`, "console actor" error) while the group runs on: collect with
  `Zotero.ZoteroTTSRun.api.wait(runId, ms, 0)`, never start the script twice.

## Limits

- Never write the owner's Fish voice id into a file: `fish::en/<32 hex>` trips the pre-push key scan. Scripts mask
  any 32-hex run in output and take the id from the snapshot at run time (`preferId`).
- `logChange` writes each of the two named lines once per plugin lifetime: a later identical failure is silent.
  Judge item 7 by the whole log and by each sample, not by one block, and expect a reinstall to reset it.
- `diagnostics.highlight()` cuts `sentencePieces` at 40 characters; `30` reads the pieces uncut itself.
- A word-timed sample can land on the alt-text word ("y"), which is no word on the page: `primaryShown` false while
  the sentence is drawn. `midFraction: 0.45` clears it.
- The snapshot's last `<p>` (`body > p:last-child`) never resolves, the reader appends two `<div>`s to the body:
  nothing is drawn for paragraph 7 there, with or without the fix.
- Screenshots: the floating Player covers the first lines of the short page; `40` hides the plugin's own iframe
  (`#ztts-player-frame`), not Zotero's `.read-aloud-popup`, which stays `display: none`.
- The EPUB view rewrites every image it shows (`reader.js` 55593-55600, Zotero 10.0.6: `aria-label` "Zoom In" and
  class `clickable-image`, unless the image sits in a link), so the live DOM no longer holds the source label.

## Runs

| Run | Result | Last executed |
| --- | --- | --- |
| 2026-10-31, 1.16.16-beta4 (bundle `840872b1…be27e`), Zotero 10.0.6; issue comment: pending, the main session posts the table | 1 PASS; 2 PASS; 3 FAIL (4 and 5 on the EPUB: primary `#00000000`, `sentencePieces: false`); 4 stanza PASS, 4 and 5 FAIL (no sentence around the word); 5 PASS; 6 PASS (snapshot, both voices); 7 FAIL (the two named lines once, Segment 4 on the EPUB); no NOT TESTABLE | every script above |
