# Scripts: 3f. Auto-scroll modes and the reading line (issues #93, #155)

[Case](../../cases/auto-scroll.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

This kit checks the auto-scroll modes and the reading line live: the
Scrolling section with its three rows, the two style radios with help icons
and binding, the reading-line targets in a PDF and a scrolled EPUB, the
paginated EPUB's line immunity, the Shift+A toggle and the paused
Shift+R return. Runner scripts, run through `_shared/run.js` with
`kit: 'auto-scroll'`, `runId: <date>-1.16.2-beta2-auto-scroll`, params
`fixturesDir`, `expectedVersion: '1.16.2-beta2'`, `pdfItemID`/`epubItemID`
set by 155-02. The old beta2–beta4 one-liner scripts (2026-09-12) are gone
with the Engine-era fields they read; git history before 2026-09-29 has them.

## Before you start

- `zotero_ping`, then `155-00` **before installing** — it verifies the test
  WebDAV destination from `~/.secrets/Zotero-TTS/test_webdav.txt`, suspends
  the three sync switches, snapshots the kit's prefs with user flags,
  rejects an installed OpenReader Position, and minimizes the host.
  Install the candidate XPI, `zotero_plugin_list` for its `-betaN`, then
  `155-01` before anything else runs.
- **Fixtures.** The kit's original fixtures (PDF 25417, EPUB 25387) were
  absent on 2026-09-29, so `155-02` imports substitutes
  (`fixture-a.pdf`, `return-key/return-key.epub` from `fixturesDir`,
  stamped titles) and `155-90` erases them. Nothing owner-owned is opened.
  The two readers the owner had open are observed and never operated.
- **Build proof is by mechanism** (`155-05`): `autoScroll()` and
  `sentenceInView()` rows carry `line` (older builds have none) and
  `readingLine` reads its int default 50 without a user value. The PDF
  follow's ownership (`patched`) engages when a session exists; the EPUB
  follow attaches on the player popup open (`155-11` ensures it and
  requires `patched: true`).
- **State touched:** `readAloud.readingLine` (10 during the run, cleared at
  cleanup), `readAloud.autoScrollMode` (sentence during the run; the
  baseline value `outside` with its user flag restored), `readAloud.volume`
  (0, cleared), two reader tabs this run opens and erases, playback in them
  with the memory voice (Fish; checked `::`-bearing in 155-00), zoom/flow of
  those tabs, the pane field. `155-90` restores everything and verifies
  `keepFollowingWhileVisible`, `playerLayout`, `shortcuts.toggleAutoScroll`,
  `readAloud.memory`, `reader.readAloudVoices` byte-identical.
- **Restore the window** for the reader scripts (page init, trusted keys,
  audio) and for the pane scripts (tooltips need the OS-active window);
  minimize again after each. Leave the host minimized at the end.
- **Audio gate** (`155-06`): a frozen clock or `suspended` context makes
  every audio-advance count NOT TESTABLE (machine); the mechanism halves
  still run. Playback is muted; never loop the playing scripts.

## Run order

| Script | What it checks | Items | Expects |
| --- | --- | --- | --- |
| [155-00-baseline-and-isolate.js](155-00-baseline-and-isolate.js) | Prefs with user flags, fixtures, owner readers, WebDAV isolation, minimize | setup | Destination matches the file; switches suspended; `memoryVoiceSafe` true |
| [155-01-startup.js](155-01-startup.js) | `diagnostics.startup()` after the exact install | setup | Version matches; every step `ok`, `failed: []` (24 steps on beta2); `readingLine` 50, no user |
| [155-02-import-fixtures.js](155-02-import-fixtures.js) | Imports the two substitutes into `state.fixturesImported` | setup | Two itemIDs; originals recorded absent |
| [155-03-pane-structure.js](155-03-pane-structure.js) | Pane: headings order, Scrolling rows, Highlight free of them, radio labels, reading-line row, `l10n()` | 9 | Reading → Scrolling → Highlight; rows `ztts-default-auto-scroll`, `ztts-auto-scroll-mode`, `ztts-reading-line` in order; labels "Scroll at every sentence"/"Scroll when outside the view"; field 50 (0–100); `blank: []`, `questionless: []` |
| [155-04-pane-help-and-binding.js](155-04-pane-help-and-binding.js) | Hovers the three `?` icons; clicks both radios; restores | 1, 9 | Tips open; sentence/outside/reading-line help matches the FTL; default tooltip closed; row texts "Reading line" · "at" · "% from the top" via the XUL `value` attr; pref and radio move together, user flag only on `outside` |
| [155-05-open-pdf-proof.js](155-05-open-pdf-proof.js) | Opens the PDF; mechanism proof of the build | setup, 9 | `autoScroll` row has `line`; pref default 50 |
| [155-06-pdf-audio-probe.js](155-06-pdf-audio-probe.js) | Mutes, starts with a trusted Shift+Space, samples 2 s, pauses | setup | `keydownReturn: 1`; clock moves; `audioState: running` |
| [155-07-pdf-sentence-line.js](155-07-pdf-sentence-line.js) | Sentence mode at line 10: entry targets vs the formula; line-90 change | 3, 10 | Entry `top` == `whole.top − covered.top − (clientHeight − covered.top − covered.bottom − h) × 0.10` (delta 0 on first-page sentences); within a sentence every push `issued: false`; the line change issues once at the 90 value |
| [155-08-pdf-line-proofs.js](155-08-pdf-line-proofs.js) | Issued-decision stream + debug lines; `last` is not a decision stream | 3, 10 | Decisions caught by fast sampling; debug store holds one `sentence in view:` line per issued scroll |
| [155-09-pdf-outside-return.js](155-09-pdf-outside-return.js) | Deep page-2 sentence (repositionTo walk, re-pausing), 50 = old centering, outside mode visible/line-change/clipped, paused Shift+R | 2, 10 | Every issued target delta 0 with `covered.top` 34 in the formula; at 50 the target equals `(top+bottom)/2 − VH/2 − covered.top`; visible: nothing issued, not on a line change; clipped under the bar: `cut` to the line; Shift+R: `return`, A/M untouched |
| [155-10-pdf-shift-a.js](155-10-pdf-shift-a.js) | Trusted Shift+A ×2 with a held repeat; toasts; radio follows | 1, 8 | Toasts "Auto-scroll: scroll at every sentence"/"Auto-scroll: when outside the view"; one switch per press; paused/position/clock byte-identical |
| [155-11-epub-scrolled.js](155-11-epub-scrolled.js) | Opens the EPUB, scrolled flow, popup ensure, item-11 paginated halves | 9, 11 | EPUB row patched with `line`; paginated: line changes (paused and playing) leave `last` and offset unchanged; visible play turns no page; a sentence outside the spread navigates (`last.reason: 'page'`) |
| [155-12-epub-entries.js](155-12-epub-entries.js) | Re-engages with a trusted Shift+Enter, plays at line 10, line 90 mid-follow | 3, 10 | Every `last.top` == the formula from the displayed range rects + scrollY (delta 0); the 90 change issues once at the 90 target; Shift+R in 155-11: `return`, delta 0 |
| [155-13-field-to-pref.js](155-13-field-to-pref.js) | Types 10 into the pane field, reads pref + both rows | 9 | Pref 10; PDF and EPUB rows `line: 10` without reinstall |
| [155-90-cleanup.js](155-90-cleanup.js) | Closes sessions/tabs, erases fixtures, restores prefs and WebDAV, minimizes | cleanup | Prefs byte-identical; destination matches baseline; `queued: 0`, `lastError: null`; host minimized |

## Limits

- **Physical scrolling does not move this machine's views** (smooth
  `scrollTo` is inert; direct `scrollTop` assignment does stick). Issued
  targets (`last.top` sampled fast, plus the `[zotero-tts] sentence in
  view:` debug lines) are the evidence; the settled-offset comparisons are
  NOT TESTABLE (machine). The EPUB row's `last` has no `issued` field — a
  `top` is a decision; the PDF row's `last` is overwritten by every word
  push and is not a decision stream.
- **The EPUB follow needs the player popup open** (`run()` gates on
  `state.popupOpen`); the PDF's follow rides Zotero's own navigate patch and
  follows with the popup closed. `internal.popupOpen` reads false through
  any wrapper — `diagnostics.players()` is the truthful state.
- **Not covered live this run:** the zh-CN row wording (unit-tested only;
  switching Zotero's locale live is forbidden), the EPUB outside-mode
  visible-sentence no-move in isolation, paginated sentence mode with
  natural page turns, oversized sentences and wordless voices (case item 5),
  hidden playback and split views (item 7), Shift+A while playing, and the
  shortcut recorder (case item 8's custom chord). Smooth motion and comfort
  are human checks.
- 155-07's first version mistook the PDF `last` row for a decision stream;
  its `modeEntryDelta` and `lineChange.delta` fields are meaningless — the
  decisions and 155-08/155-09 supersede them.

## Runs

| Run | Items observed | Notes |
| --- | --- | --- |
| 2026-09-29-1.16.2-beta2-auto-scroll | 1, 2, 3, 8, 9, 10, 11 PASS; zh-CN wording NOT TESTABLE live; EPUB outside-visible isolation and smooth motion NOT TESTABLE (machine); 155-07's `delta` fields superseded | Build `d5554d0b…bdbb`; startup 24/24; 14 PDF + 10 EPUB unique issued decisions, all delta 0; cleanup byte-identical |
| 2026-09-12-1.12.3-beta2/beta3/beta4 | Items 1–4, 6, 8 PASS then (report on the issue); scripts dropped 2026-09-29 (Engine-era fields, pre-#155 wording) | Git history before 2026-09-29 has the old files |
