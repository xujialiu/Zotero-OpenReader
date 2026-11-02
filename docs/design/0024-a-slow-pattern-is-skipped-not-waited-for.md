# A slow pattern is skipped, not waited for

*The engineering half is [ADR 0024](../adr/0024-regular-expressions-run-in-a-worker-under-a-time-limit.md).*

A replacement can be written as a regular expression: a pattern such as
`IL-(\d+)` read as *interleukin $1*, which covers every interleukin at
once. Some patterns, written a particular way, take practically forever on
particular sentences: the computer tries one way of matching after
another, and the number of ways doubles with every extra letter. Zotero
lets its own code run as long as it likes, so a pattern like that, met by
the wrong sentence, would freeze Zotero until it is forced to quit. The
owner's answer of 2026-11-02 (issue #237): keep the full pattern language,
and never let a pattern freeze Zotero.

## What happens

- **Patterns are tried on the side, against a clock.** Zotero stays
  responsive whatever a pattern does.
- **A pattern that runs out of time is skipped for that sentence.** The
  sentence is read with every other replacement applied, and the reading
  goes on. The player's `!` names the pattern, and the replacements
  window marks its row, so the owner can rewrite it.
- **Other sentences still use it.** A slow pattern is usually slow only on
  some text; it keeps working everywhere else.
- **Exact rows are never slow**, and run as they are.

## What it costs

- **A little time per sentence** while a document has regular-expression
  rows, a few milliseconds; the prefetch absorbs it.
- **A sentence that hits the limit waits for it** before its audio is asked
  for, about a quarter of a second, usually while an earlier sentence is
  still being read.

## Turned down

- **Running patterns directly.** Simplest, the full pattern language, and
  instant; but one careless pattern can freeze Zotero, and only a forced
  quit ends it.
- **A pattern language that can never be slow.** No freeze and no clock,
  but no looking behind or ahead and no matching the same text twice
  (`(?<=…)`, `\1`), with a library of someone else's added to the plugin
  to provide it.
