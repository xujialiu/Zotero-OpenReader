# Text cleaning is automatic; a replacement still has the last word

*The engineering half is [ADR 0025](../adr/0025-text-cleaning-is-scoped-and-keeps-replacements-verbatim.md).*

A Chinese PDF can sound broken even when its words are right: spaces left
between characters make the voice pause in the middle of a phrase. The
reporter of issue #240 confirmed that removing these spaces with a
Replacement made the reading fluent. Nobody should have to learn a pattern
language to get that correction.

## What happens

The plugin maintains its own Text cleaning rules, separate from the
Replacements a person writes. They run automatically and change only what
the voice reads, never the document or where its words are highlighted.
There is no new switch or editing window. Rules change with plugin updates.

Each rule names the document types and Providers it applies to. The first
rule applies to every document and every Provider, including System voices
and the Zotero voices; a future rule can have a narrower scope. The text
itself determines whether there is Chinese to clean, not the language of
the chosen voice.

Only one rule is included now: remove whitespace between Chinese
characters, or between a Chinese character and Chinese punctuation. For
example:

- “这 是 一句 话” is read as “这是一句话”.
- “中文 ， 测试” is read as “中文，测试”.
- “BNN 结构”, “第 3 章” and “hello, world” stay as written.

Ordinary, full-width and nonbreaking spaces, tabs and line breaks follow
the same rule within one sentence. Separate sentences or paragraphs are
never joined. Spaces between punctuation marks alone are not removed.

If bracket removal is on, the spaces it leaves behind are cleaned too:
“中 [文]” is read as “中文”. This does not turn bracket removal on or change
which brackets it removes.

## A replacement still has the last word

A person's Replacements keep matching the document as written. Cleaning
cannot first erase a space that an existing Replacement needs to find.
Nothing written in Read as is cleaned: a Replacement from “中 文” to
“甲 乙” still has the voice read “甲 乙”, with that space intact.

## What it costs

- Deliberate spaces inside Chinese text can disappear from the reading as
  well. A Replacement can preserve the intended reading of a phrase.
- There is no switch to disable this correction alone. A changed built-in
  rule arrives with a plugin update, not through the replacement editor.
- English and numeric spacing, punctuation-only gaps and other extraction
  problems are left alone. This is not a repair of where Zotero cuts a
  sentence or how it interprets a page.

## Turned down

- **Leave the correction to a user-written Replacement.** It works, but
  leaves everyone who has not found the instructions with broken reading.
- **Remove every space or use every kind of punctuation as a boundary.**
  Broader cleanup risks damaging English, numbers and mixed-language text.
- **Clean before matching Replacements, or clean their Read as text too.**
  It would make some existing rules stop matching or change a reading the
  person explicitly asked for.
