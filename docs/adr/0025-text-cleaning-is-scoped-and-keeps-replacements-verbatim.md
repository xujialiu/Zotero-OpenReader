---
status: accepted
date: 2026-11-06
issue: 240
---

# Text cleaning is scoped and keeps Replacements verbatim

*The product argument is [design 0025](../design/0025-text-cleaning-is-scoped-and-keeps-replacements-verbatim.md).*

Issue #240 reports Chinese PDF whitespace causing pauses within phrases.
The reporter confirmed that a regex Replacement with empty Read as fixes
that document. That establishes a useful correction, not that every
Chinese space is accidental. The accepted trade-off is automatic,
conservative Text cleaning, with explicit user Replacements taking
precedence. Settled on 2026-11-06.

ADR 0023 already requires Replacements to match the original Segment and
keeps Read as opaque. Normalizing the original before those matches would
silently change existing exact and regex rules. Text cleaning extends
speech preparation without changing that contract.

## Decision

- Maintain a plugin-owned list of Text cleaning rules, not additional rows
  in Global replacements. Each rule has a stable identity and an explicit
  scope of document types and Providers. The dispatcher respects that
  scope; the initial rule uses all document types and all Providers,
  including System and Zotero Standard/Premium. Voice locale is not a
  content-language gate.
- Rules ship with the plugin. There is no new preference, user editor,
  sync record or migration of existing Replacement rows. Existing bracket
  removal, invisible-text filtering and provider-specific hints are not
  moved into this list by #240. Voice samples are unchanged.
- Replacements still match the original Segment, document rows before
  global rows, as ADR 0023 specifies. Read as remains verbatim, including
  any whitespace or provider instruction it contains.
- Apply cleaning to the remaining document-derived speech text after
  bracket removal. Thus bracket removal followed by cleaning turns
  `中 [文]` into `中文`. This neither changes bracket pairing nor cleans
  Replacement output. No rule joins Segments or changes Document analysis,
  Segmentation, Position or the document's stored text.
- Keep one shared preparation path for ordinary requests, Prefetch,
  Handoff, cache forgetting and the speech comparison after a Replacement
  edit. Preserve a composed UTF-16 speech-to-document map for real word
  timestamps; never alter cached provider timings in place or invent word
  timings. Audio identity remains based on the prepared speech text and
  the existing provider/voice/configuration identity.

The scope is an enforced rule condition, not a descriptive label. A later
restricted rule must receive the metadata its condition needs; missing
metadata must not broaden it to every document or Provider. The initial
all/all rule needs no document-language inference.

## Initial rule: Chinese whitespace

The initial list contains only `chinese-whitespace` (issue #240), with all
document types and all Providers as its scope.

Within one Segment, remove a nonempty whitespace run only when its two
neighbors are Han characters or members of a fixed Chinese punctuation
set, and at least one neighbor is Han. Han uses Unicode `Script=Han`,
including supplementary characters. Whitespace follows JavaScript `\s`,
including ordinary, full-width and nonbreaking spaces, tabs and line
breaks. This is not general removal of invisible characters.

The conservative punctuation set is:
`，。！？；：、（）【】《》〈〉「」『』“”‘’〔〕［］｛｝…—·`.
It is not Unicode `\p{P}`. Punctuation-only gaps, ASCII punctuation gaps,
leading/trailing whitespace, Latin boundaries and numeric boundaries are
not cleaned by this rule. In particular, `BNN 结构`, `第 3 章` and
`hello, world` stay unchanged.

For example, `这 是 一句 话` becomes `这是一句话`, and `中文 ， 测试`
becomes `中文，测试`. An existing Replacement `中 文` → `甲 乙` still
matches and produces `甲 乙` unchanged.

The fixed rule must have bounded work; adding a rule list is not license
to run arbitrary regular expressions on Zotero's uninterruptible chrome
thread. User regex Replacements retain ADR 0024's worker and time limit.
Any future built-in rule needing unbounded pattern execution must meet
the same safety constraint.

## Rejected

- **Require the workaround as a Global replacement.** Users would still
  need to find and copy it; plugin updates would have no distinct rule
  ownership or applicability scope.
- **Clean before user matching or clean all final output indiscriminately.**
  Either can change existing Replacement semantics and makes explicit
  Read as text unreliable.
- **Adopt the reporter's broad punctuation regex as the default.** Its
  `\p{P}` includes punctuation in non-Chinese text and it also removes
  whitespace between punctuation marks alone.
- **Restrict the first rule to PDFs or Chinese-locale voices.** The chosen
  correction is content-based and applies to EPUBs and snapshots too;
  voice language is not the language of every phrase in a document.
