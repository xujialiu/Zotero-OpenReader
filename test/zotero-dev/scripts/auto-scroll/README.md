# Scripts: 3f. Auto-scroll modes and the reading line (issues #93, #155, #157)

[Case](../../cases/auto-scroll.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

This kit checks the Scrolling section (Default scrolling, the three-way
Auto-scroll style, Reading line), the per-option help, the Shift+A cycle,
the reading-line targets, Scroll at every line (#157: PDF, scrolled EPUB,
fallback without a word, paused Shift+R, paginated EPUB). Runner scripts,
run through `_shared/run.js` with `kit: 'auto-scroll'`,
`runId: <date>-<build>-auto-scroll`, params `fixturesDir`,
`expectedVersion`, `pdfItemID`/`epubItemID` (25417/25387 — absent, so
155-02 imports substitutes). Each 157 script restores what it flips in its
own `finally`; 157-90 restores the pass.

## Before you start

- `zotero_ping`, then `155-00` **before installing** — test WebDAV
  destination from `~/.secrets/Zotero-TTS/test_webdav.txt`, suspends the
  three sync switches, snapshots the kit's prefs with user flags, rejects
  an installed OpenReader Position, minimizes the host. Install the XPI,
  `zotero_plugin_list` for the `-betaN`, then `155-01` before anything.
- **Build proof by mechanism**: without a user value
  `readAloud.autoScrollMode` reads `line` on beta4 (`sentence` before);
  `autoScroll()`/`sentenceInView()` rows carry `words` and `placedLine`
  (155-05 checks the older `line`/`readingLine` fields on the beta2 path).
- **State touched:** `readAloud.autoScrollMode` (each script sets `line`;
  the baseline may hold a user value such as `outside` — 157-90 restores
  value AND flag; a no-user baseline must end no-user), `readingLine`
  (untouched at its default/user value 30 — never write it),
  `readAloud.volume` (0 during the run, baseline restored),
  `highlight.word` (toggled by 157-05/157-06, restored byte-identical),
  two imported fixture tabs with muted playback on the memory voice (Fish,
  `::`-bearing, word timing `real`), the pane. Nothing owner-owned.
- **Restore the host window** for reader scripts (trusted keys, playback,
  sampling) and the pane scripts (hover needs the OS-active window);
  minimize again after each; leave it minimized at the end.
- **Audio gate**: 157-02 samples the muted session three times (0.649 →
  1.801 → 2.927 on beta4); a frozen clock demotes audio-advance counts to
  NOT TESTABLE (machine), the issued-target halves still run.

## Run order

| Script | What it checks | Items | Expects |
| --- | --- | --- | --- |
| [155-00-baseline-and-isolate.js](155-00-baseline-and-isolate.js) | Prefs with user flags, fixtures, owner readers, WebDAV isolation, minimize | setup | Destination matches the file; memory voice `::`-bearing; host minimized |
| [155-01-startup.js](155-01-startup.js) | `diagnostics.startup()` after the exact install | setup | Version matches; 24 steps all ok; readingLine at 30 |
| [155-02-import-fixtures.js](155-02-import-fixtures.js) | Imports the two substitutes | setup | Two itemIDs; originals absent |
| [157-01-pane-line-radio.js](157-01-pane-line-radio.js) | Reopens the pane (a pre-install window holds the old pane); radios, help, clicks, `l10n()` | 1, 9r | Radios in order line/sentence/outside with labels "Scroll at every line"/"…sentence"/"…outside the view", `?` ids `ztts-help-auto-scroll-{line,sentence,outside}`, line help == FTL text; hover opens the plugin tip, Zotero's tip closed; clicks set line(user flag dropped)/sentence/outside; `pane: {blank: [], questionless: []}` (223 elements); baseline restored (no user value) |
| [157-02-pdf-shift-a.js](157-02-pdf-shift-a.js) | Opens the PDF, muted session, audio gate, Shift+A cycle with held repeat | 8 | Cycle line→sentence→outside→line, toast per step ("Auto-scroll: scroll at every line" is the new one), radio follows, one switch per hold (the repeat keydown needs `repeat: true`), paused/position/clock/following unchanged |
| [157-03-pdf-lines.js](157-03-pdf-lines.js) | Lines on the PDF: fast `sentenceInView()` sampling + debug lines | 12 | Along a line words `word`, no issue, placedLine holds; new line → one issued `line`, `top == placedLine[1] − covered.top − (clientHeight − covered.top − covered.bottom − h) × 0.30` clamped (delta 0); sentence starts read `coming`, nothing issued; clamped-equal targets issue nothing; page-2 line issues (delta 0, debug `on page 2`); one `[zotero-tts] sentence in view:` line per issued scroll |
| [157-04-epub-lines.js](157-04-epub-lines.js) | Lines on the scrolled EPUB through `autoScroll()` (popup open, A intent) | 12 | EPUB row has `words`/`placedLine`, `line: 30`; issued `last.reason: 'line'` delta 0 (covered.top 34, height 816 on beta4); `coming` entries with `placedLine: null` issue nothing; a sentence starting on the placed line re-places it with no decision |
| [157-05-word-off-fallback.js](157-05-word-off-fallback.js) | Shift+W off: fallback targets; Shift+W on: the word's line at once | 13 | Rows read `words: 'sentence'`; each new sentence issues the sentence target once (reason `sentence` via the line→sentence recursion; delta 0); Shift+W on issues `line` within ~1 s (delta 0); restore the flag |
| [157-06-return-and-word-on.js](157-06-return-and-word-on.js) | Paused Shift+R with a word active re-issues its line | 14 | One issued `return`, `top` == the line formula (delta 0) even for an already-placed line; A/M, mode, paused, position unchanged |
| [157-07-epub-paginated.js](157-07-epub-paginated.js) | Paginated EPUB at every line | 15 | Within a page: no decisions; the word onto the next page: one `last.reason: 'page'`, the offset turns once; a resume outside the spread turns once (`coming`) |
| [157-90-cleanup.js](157-90-cleanup.js) | Closes sessions/tabs, erases fixtures, restores prefs and WebDAV, minimizes | cleanup | Prefs byte-identical (see the autoScrollMode note); untouched verify all same; `queued: 0`, `lastError: null`; host minimized |
| [155-05-open-pdf-proof.js](155-05-open-pdf-proof.js) … [155-13-field-to-pref.js](155-13-field-to-pref.js) | The issue #155 path: pane rows, sentence/outside targets at lines 10/90, field→pref | 2, 3, 9, 10, 11 | See their git-era rows; unchanged since the beta2 run |

## Limits

- **Smooth scrollTo is inert on this machine**; paginated turns are
  instant and do move. Issued targets (`last` sampled fast), the
  `[zotero-tts] sentence in view:` debug lines and paginated offsets are
  the evidence; settled offsets in scrolled flows are NOT TESTABLE
  (machine). The PDF `last` is rewritten by every push and is not a
  decision stream — fast sampling missed 3 of 14 issued scrolls (100 ms
  cadence); the debug store is the complete issued record.
- **The EPUB follow needs the player popup open AND A intent**; a stuck M
  (`following: false`) never updates the row — 157-04/157-07 re-engage
  with a trusted Shift+M when needed. `internal.popupOpen` reads false
  through any wrapper; `diagnostics.players()` is truthful.
- **A watch that runs into the document's end sees no pushes** (the
  manager rewinds, pushes stop until Play). 157-05/157-06 reposition to 4
  first; a 9 s on-watch that caught nothing after the Word toggle was
  superseded by an ungated cadence probe (`.tmp/zotero-dev/
  157-word-toggle-cadence.js`, logic = 157-05's sampler).
- **A new line whose clamped target equals the current offset issues
  nothing and still advances `placedLine`** (reason `none`) — correct, do
  not count it as a missed issue.
- **Not covered live**: zh-CN wording (unit-tested only); wordless-voice
  `stand-in` fallback (would need a free non-word-timed voice/tier switch;
  the Word-switch-off path covers the same `words: 'sentence'` branch);
  Shift+A while playing; the shortcut recorder; smooth motion and comfort
  (human checks).
- 157-03's shipped `sameLineStarts` detector compared heads by reference
  (buggy); the on-disk pushes settled the sub-check offline and the
  detector is fixed in the script (prepared, not rerun).

## Runs

| Run | Items observed | Notes |
| --- | --- | --- |
| 2026-09-29-1.16.2-beta4-auto-scroll | 1, 8, 9(radio), 12, 13, 14, 15 PASS; PDF same-line start NOT TESTABLE (no natural occurrence — observed on the EPUB instead); stand-in fallback NOT TESTABLE (see Limits); settled offsets NOT TESTABLE (machine) | Build 72f0f947…ba0503 / bundle 888d59b8…00af5; startup 24/24; PDF 11 caught + 14 debug issued `line` all delta 0; EPUB 6 issued `line` all delta 0; cleanup byte-identical |
| 2026-09-29-1.16.2-beta2-auto-scroll | 1, 2, 3, 8, 9, 10, 11 PASS; zh-CN and smooth motion NOT TESTABLE | Scripts 155-03…155-13 executed there |
