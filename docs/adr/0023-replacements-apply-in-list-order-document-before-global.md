---
status: accepted
date: 2026-11-02
issue: 237
---

# Replacements apply in list order, document before global

*The product argument is [design 0023](../design/0023-replacements-apply-in-order-the-documents-first.md).*

## Context

Issue #237 adds Replacements: rules that change the text sent to a voice
while the highlight stays on the document's text. There are two lists,
the Global replacements (settings) and the Document replacements (one per
attachment, keyed like the Document voice, `user/KEY` or
`group-N/KEY`). Each row is a pattern (exact, wildcard or regular
expression, with a match-case flag) and its Read-as text. A Segment can
match several rows at overlapping places, so their precedence has to be
fixed. The owner settled it on 2026-11-02.

## Decision

1. **One ordered list per Segment**: the document's rows in their order,
   then the global rows in theirs. The order is the stored order; the
   dialog reorders by drag, and a new row is appended to its list.
2. **Sequential passes.** Row *k* runs over the whole Segment text and
   may match only where no earlier row replaced anything: a match
   overlapping an already replaced span is rejected and the search goes
   on after its start. Matching runs on the document's text (the Segment
   as Zotero cut it), before bracket removal (`core/speech-text.ts`).
3. **Read-as text is opaque.** No later row matches inside it, and bracket
   removal does not touch it, so a Read-as text can carry what a provider
   reads as an instruction (Fish's `[...]`).
4. **Offsets.** Each replacement records its document span and its span
   in the speech text. Word timestamps the provider returns map back
   through these spans: a timing inside a replaced output span covers the
   whole document span, so the highlight lights `IL-6` while
   *interleukin six* is heard. Bracket removal's `removed` positions
   compose with this map (`restoreSpeechOffsets` generalized).
5. **Exact match boundaries.** An exact or wildcard row whose edge is a
   letter, digit or mark matches only where the neighbor on that side is
   neither a letter, digit or mark, nor a joiner (`-`, `/`, `_`) with one
   beyond it. Characters of scripts written without spaces (Han,
   Hiragana, Katakana, Thai, Lao, Khmer, Myanmar) never count as such a
   neighbor and need no boundary themselves, so `IL-6` matches in
   `抑制IL-6表达`. A regular expression gets no implied boundary.

## Rejected

- **Longest match first, document only on a tie.** Proposed first; the
  owner chose explicit order so that a document row overrides any global
  row and the outcome is visible as order on the screen.
- **A left-to-right scan where the earlier row wins at each position.** A
  later row matching earlier in the Segment would beat a higher row.

## Consequences

- The Global replacements list is one setting and travels whole: the
  settings sync and backup apply last-write-wins to the whole list, as to
  any other setting. A Document replacements list is one record per
  document with its own timestamp, like the Document voice.
- The dialog greys a global row only when a document row has the same
  pattern, mode and case flag: by decision 2 such a global row never
  applies in that document.
