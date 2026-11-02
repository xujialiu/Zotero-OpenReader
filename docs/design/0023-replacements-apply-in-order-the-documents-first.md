# Replacements apply in order, the document's first

*The engineering half is [ADR 0023](../adr/0023-replacements-apply-in-list-order-document-before-global.md).*

A replacement has the voice say other text in place of a piece of the
document's text: `IL-6` read as *interleukin six*, a name spelled the way
it sounds. The owner keeps two lists of them: the global replacements in
the settings, for every document, and the document replacements of one
document, edited from the player. The owner's answers of 2026-11-02
(issue #237).

## What happens

- **One list, top to bottom.** For a document, its own replacements come
  first and the global ones after them. Each replacement, in turn, replaces
  what it finds in the text that the ones above it left alone. The order
  is the owner's: rows are dragged up and down, and a new row goes to the
  end of its list.
- **What a replacement put in is never matched again**, by any later row
  of either list. Writing `IL` → `I L` does not make a later row for `I`
  see two letters.
- **A row above wins, even when a row below matches more.** With `IL-6` →
  *interleukin six* first and `anti IL-*` → *anti-interleukin \** second,
  "anti IL-6" is read *anti interleukin six*: the second row no longer
  finds `IL-6`, which the first already replaced.
- **The document wins over the settings** for the same text: a document
  row for `IL` takes every `IL` before a global row for `IL` can.

## What it gives

- **Predictable.** What a row does depends only on the rows above it, and
  the owner can see and change that order.
- **The document has the last word.** A term that means something else in
  one paper is fixed there without touching the global list.

## What it costs

- **Order matters.** A broad row placed above a specific one hides it;
  the owner has to drag the specific one up.
- **A global row can be starved in one document.** A document row that
  consumes part of the text a longer global row needs keeps that global
  row from applying in that document.

## Turned down

- **The longest match wins, the document only on a tie.** More often right
  without thinking about order, but a document row could not override a
  longer global one, and the owner could not predict which row wins
  without comparing lengths.
- **Scanning left to right, the earlier row winning at each place.** A row
  lower in the list could still beat a higher one by matching earlier in
  the sentence, which the order on the screen would not show.
