[Checklist index](../README.md) · [Scripts](../scripts/replacements/README.md)

## Replacements (issue #237)

Text the voice says in place of a document's text: the document's rows,
then the global ones, each in order (ADR 0023); wildcard and pattern rows
in a worker under a time limit (ADR 0024). Run the [baseline](../baseline.md),
then import `test/fixtures/replacements/replacements.epub` as a temporary
standalone attachment (regenerate it with its `build.py`). Use only this
fixture for playback; leave the user's tabs alone. Snapshot
`extensions.zotero.zotero-tts.readAloud.replacements` and every
`extensions.zotero.zotero-tts.documentReplacements.*` before changes, and
restore them at the end. Use a free voice (Fish Audio's free model, or the
configured Kokoro-FastAPI); a Zotero voice only through a stubbed transport.

The window is modal: open it with `diagnostics.openReplacementsWindow(index)`
(no index: the global rows alone), which returns at once, then find it with
`Services.wm.getMostRecentWindow(null)` by its `id`,
`ztts-replacements-window`; a row's own dialog is
`ztts-replacement-row-window`. Click buttons with `doCommand()`; accept or
cancel a dialog with its `<dialog>`'s `acceptDialog()` / `cancelDialog()`.
Never click the tutorial link: it opens the system browser.

1. **The settings row.** Reading has `Replacements:` with an `Edit…`
   button (`ztts-replacements-open`) and a `?` whose help mentions the
   player. Its window has no *Applies to* column and the intro says
   *For every document*. Expected: the global rows alone.
2. **The Player's button.** With the Player as Top bar, then Bottom bar:
   `.replacements` is the element just before `.layout-menu` in
   `.controls`, and its right edge is within 2 px of `.layout-menu`'s left
   edge. As Floating panel: `.replacements` is in the bottom row, at its
   left edge (its left within 10 px of `.player`'s left), while
   `.status-button` stays at the right. Its title is `Replacements`
   (`替换` in zh-CN). A click opens the window over the reader: intro
   *For “Replacement fixture” and for every document*, four columns, the
   fixture's rows above the global ones.
3. **Adding and refusing rows.** `+` opens the row dialog: Text, Read as,
   Match (Exact selected), Match case (checked), Applies to (This document)
   with three `?`. Refused at OK, with the dialog still open and its message
   shown: empty Text; regex `IL-(\d+` (syntax, message names the error);
   regex `a*` (matches nothing); wildcard `IL-*` read as `* *`
   (placeholders); the same Text, mode and case as a row already in that
   list. Accepted rows land at the end of their list. A text selected in
   the document before the Player's click is the new row's Text.
4. **Saving.** OK in the window writes, for the rows below:
   `readAloud.replacements` (global rows, JSON) and
   `documentReplacements.user/<KEY>` = `{ rows, ts }` for the fixture, and
   increments `documentReplacementsChanged`. Cancel writes nothing.
   `diagnostics.replacements()` lists the fixture's reader with
   `rows`/`documentRows` matching.
5. **What the voice is given** — `diagnostics.replacementsPreview(text, index)`
   with document rows `IL-6` → `interleukin six` (Exact) and
   `anti IL-*` → `anti-interleukin *` (Wildcard), and global rows
   `IL-*` → `interleukin *` (Wildcard), `(\d+) ?mg\b` → `$1 milligrams`
   (Regex):

   | text | expected `speech` |
   | --- | --- |
   | `IL-6 levels rose after the second dose.` | `interleukin six levels rose after the second dose.` |
   | `IL-2 and IL-10 were measured as well.` | `interleukin 2 and interleukin 10 were measured as well.` |
   | `Anti IL-6 therapy was not given.` | `Anti interleukin six therapy was not given.` |
   | `The patients took 5mg of the drug [12].` | `The patients took 5 milligrams of the drug 12.` (brackets on) |
   | `抑制IL-6表达的药物。` | `抑制interleukin six表达的药物。` |

   `runner.workers` is 1 after them; `ms` under 50 each.
6. **The request and the highlight.** Reading the fixture with a
   word-timed voice: the request for sentence 2 carries
   `interleukin six levels rose …` (record the outgoing request, not a
   debug line); while *interleukin* and *six* are heard the word highlight
   covers `IL-6`. Re-reading sentence 2 is served from the cache; after an
   edit that changes it, a new request goes out.
7. **A slow pattern.** Add a global regex row `(a+)+$` → `x` and preview
   sentence 7 (`aaa…a!`): the answer comes within 1 s with `timedOut`
   naming that row's index and `speech` unchanged; `runner.timeouts` 1,
   `runner.workers` 2; a bridge call right after answers at once (Zotero
   not frozen). Reading sentence 7: the Player's `!` shows
   *The replacement “(a+)+$” took too long …*, and the window marks that
   row red.
8. **An edit while reading.** Playing sentence 2 before *levels*, change
   the `IL-6` row's Read as and click OK: `diagnostics.replacements()`
   shows `lastEdit.outcome` `handoff`, then `lastEdit.report.last.kind`
   `word` (or `sentence` for a voice without word timings) and the new
   speech text in `held` for sentence 2; only sentences whose text changed
   were requested again (count the requests). Paused, the same edit gives
   `handoff`, and Play reads the new text. An edit that changes no held
   sentence gives `none`.
9. **A Zotero voice.** With the native transport stubbed (no paid request),
   the Standard/Premium route receives a copied segment whose `text` is the
   replaced text, and its word ranges come back in the document's
   coordinates.
10. **Human checks.** The window and the row dialog look like Zotero's own
    dialogs in light and dark appearance, in English and Chinese; dragging a
    row shows where it lands and keeps it within its list; the `A→B` icon
    matches the Player's other icons.
11. **Cleanup.** Restore the snapshotted preferences, close and erase the
    fixture, remove its reading-position record, and compare the user's
    tabs and settings to the baseline.
