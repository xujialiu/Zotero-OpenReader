[Checklist index](../README.md) · [Scripts](../scripts/auto-scroll/README.md)

## 3f. Auto-scroll modes and the reading line (issues #93, #155, #157)

Run baseline section 0 and cleanup section 7. Use one PDF with a real
cross-page or cross-column sentence and one EPUB; record title, viewport,
flow, scale, chosen voice, real word timing, build hash and Zotero version.
Use `diagnostics.autoScroll()` for both formats and
`diagnostics.sentenceInView()` for PDF geometry. This is a focused pass,
not permission to run the entire checklist.

Recorded runs: beta2 failure and routing correction (2026-09-12, 1.12.3-beta2),
beta3 verification (2026-09-12, 1.12.3-beta3),
per-option help verification (2026-09-12, 1.12.3-beta4),
reading line verification (2026-09-29, 1.16.2-beta2, issue #155's
closing comment); Scroll at every line (issue #157) is new on 1.16.2-beta4.
Reusable scripts: beta2 probes (2026-09-12, 1.12.3-beta2),
beta3 probes (2026-09-12, 1.12.3-beta3),
help probes (2026-09-12, 1.12.3-beta4).
These records distinguish observed behavior from untested cases; their
historical values are not fresh PASS results on another build.

1. **Setting and persistence.** Scrolling offers three radio options,
   in this order: Scroll at every line, Scroll at every sentence and
   Scroll when outside the view. Scroll at every line is the default
   since issue #157 (every sentence before it, named Center each
   sentence, in Highlight, before issue #155): without a user value the
   pref reads `line`. Each option has its own adjacent help icon;
   hovering them displays different explanations for that option.
   Changing the choice updates the preference
   `readAloud.autoScrollMode` to `line`, `sentence` or `outside`, is reflected in
   open readers, and does not change the audio controller or playback
   clock. File backup includes it; restore and sync use the existing
   settings path. Do not upload to the user's WebDAV during this pass;
   backup and sync schema coverage is automated.
2. **Outside mode, PDF and scrolled EPUB.** Place a fitting active
   sentence fully inside each viewport edge, including inside the old
   quarter-screen trigger. State/word updates cause no automatic motion.
   Clip its top or bottom, or a continuation on another PDF page/column:
   the whole extent goes to the reading line (item 10; centered at the
   default 50), clamped to document limits. Record the
   expected target from the whole range and the actual final position.
3. **Sentence mode, PDF and scrolled EPUB.** Natural audio advances to
   at least three distinct fitting sentences: each new sentence produces
   its centered target, including a sentence already visible near an
   edge. Repeated word updates within the same sentence do not produce
   new centering requests. Prove audio advancement, not only word timers.
4. **Manual intent and explicit return.** Trusted wheel or PageDown enters
   persistent M in both formats, regardless of sentence visibility. Later
   sentences, reentry and pause/resume keep M. Shift+R locates once without
   changing A/M; Shift+Enter locates and switches to A; Shift+M switches
   A/M. Skip in M changes only the spoken position, whereas skip in A also
   locates it. All keep paused audio paused. Run
   [Player following](player-following.md) for default/tab lifetime and
   shortcut behavior. Delayed automatic scrolling does not enter M.
5. **Oversized sentences.** On entry, locate the first reading-order
   rect, including a column-crossing sentence whose whole box begins
   above its first line. Thereafter follow a real word only when clipped.
   A wordless voice locates the beginning once and does not repeatedly
   drag the view back. Never infer word progress from a whole-segment
   timestamp. Deterministic oversized geometry has unit coverage if a
   suitable real sentence is unavailable; label that live case untested.
6. **Paginated EPUB.** Retain pagination. A wholly visible sentence in
   outside mode does not turn a page; a new sentence outside the spread
   brings in its starting page. A spread-crossing sentence begins at its
   head and follows a real word onto the next page when available, without
   alternating between its head and tail. Section changes mount the next
   section before highlighting. Check both modes and return while paused.
7. **Visibility and lifecycle.** Hidden playback defers movement. On
   return, following views locate the latest sentence; manually disengaged
   views remain disengaged. Split views share their document's intent;
   separate documents remain independent.
   Dispose/reload restores native methods and helper properties without
   errors. Preserve current PDF section 3d ownership/input regressions.
8. **Toggle shortcut.** Trusted Shift+A in PDF and EPUB cycles
   `line` → `sentence` → `outside` → `line` (issue #157), with a
   localized toast naming the new mode ("Auto-scroll: scroll at every
   line" / "自动滚动：每行都滚动" for `line`) and the settings radio
   group following the change. Works
   while playing, paused and before playback; does not alter audio,
   position lock or manual disengagement. Holding the key produces one
   switch. Typing in editable controls is unaffected. The shortcut row
   defaults to Shift+A, accepts a custom chord and supports clearing;
   restore its original binding after checking.
9. **Scrolling section (issue #155).** The pane has a Scrolling section
   (滚动) between Reading and Highlight holding, in this order, Default
   scrolling, Auto-scroll style and Reading line; Highlight holds no
   scrolling row. The reading line row reads `Reading line  at [30] %
   from the top` (`阅读线  距顶部 [30] %` in zh-CN; 30 is the default), its `?` hover shows
   the reading line help, and `diagnostics.l10n()` reports no blank
   element and no `?` without its glyph. Typing 10 into the field sets
   `readAloud.readingLine` to 10, and `diagnostics.autoScroll()` then
   reports `line: 10` for an open PDF and EPUB without a reinstall.
10. **Reading line, PDF and scrolled EPUB (issue #155).** At line 10 in
   Scroll at every sentence, each new fitting sentence's issued target
   (`last.top`) is its top less the covered top, less a tenth of the
   uncovered height minus the sentence's height: `top − covered.top −
   (clientHeight − covered.top − covered.bottom − height) × 0.10`,
   within 1 px, or clamped at the document's start or end. State the
   expected value from `diagnostics.sentenceInView()` (PDF) or the
   range (EPUB) before reading the actual one. The PDF row's `last` is
   rewritten by every word push, so catch the issued decision by fast
   sampling and the `sentence in view:` debug line, not a later read;
   the EPUB follow runs only with the player open. Settled offsets are
   not observable on the test machine (kit Limits). Changing the line to 90
   while a sentence is followed issues one new target for it at once.
   In Scroll when outside the view a line change leaves a visible
   sentence in place, and a clipped one goes to the line. Shift+R
   returns to the line. With the Top bar docked, the line is measured
   in the part below it. Back at 50 the targets equal item 3's centering.
11. **Paginated EPUB and the reading line (issue #155).** In paginated
   flow a change of the line turns no page, and item 6 holds unchanged
   at line 10.
12. **Scroll at every line, PDF and scrolled EPUB (issue #157).** With a
   word-timed voice, the Word switch on and the default line 30, sample
   `last` fast (PDF: `diagnostics.sentenceInView()`, EPUB:
   `diagnostics.autoScroll()`). While the word moves along one line
   nothing is issued and `placedLine` stays. When it moves onto a new
   line, one target is issued, reason `line`: the word's first rect top
   − `covered.top` − (`clientHeight` − `covered.top` − `covered.bottom` −
   the rect's height) × 0.30, within 1 px or clamped; `words: 'word'`
   and `placedLine` equal to that rect. A new sentence starting on the
   line the previous one ended issues nothing at its start; its first
   push reads `words: 'coming'` with nothing issued until its first
   word. A move to the next column or page up the view issues a target
   above the current offset. State each expected value before reading
   the actual one.
13. **Without a highlighted word (issue #157).** With the Word switch off
   (Shift+W) the rows read `words: 'sentence'`, and each new sentence
   issues item 3's sentence target once and nothing more; Shift+W back
   on issues the current word's line at once. With a voice without word
   timing (its active timestamp reads `stand-in`), each sentence is
   placed whole once, `words: 'sentence'`.
14. **Return at every line (issue #157).** Shift+R, while a word is
   active, issues its line's target with reason `return` even when that
   line was already placed; A/M and paused audio unchanged.
15. **Paginated EPUB at every line (issue #157).** A word moving within
   the page turns nothing; the word reaching the next page navigates to
   the word's page once (`last.reason: 'page'`). Without a highlighted
   word, item 6's sentence paging holds.

Keep the scripts that worked in `test/zotero-dev/scripts/auto-scroll/` with
prerequisites, expected results and restoration; the run's table is on the
issue. Restore only state touched by the pass:
preferences, voice/speed, flow, zoom, player, position and temporary items.
Preserve the original transport/bookmark snapshot throughout retries.

Human judgment: comfort of per-sentence and per-line movement, smoothness, interruption
while an animation is visibly moving, and whether highlights feel stable.
Synthetic errors, invalid preference values and exact boundary arithmetic
are unit checks; do not relabel them as live results.
