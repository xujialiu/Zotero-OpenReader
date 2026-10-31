[Checklist index](../README.md) · [Scripts](../scripts/breaks-and-images/README.md)

# A sentence holding a line break or an inline image keeps its highlight (issue #209)

First run 2026-10-31 on 1.16.16-beta4 (items 3, 4 and 7 failed on the
EPUB, [#209 comment](https://github.com/xujialiu/Zotero-OpenReader/issues/209#issuecomment-6545425233));
the expected outputs below are corrected from its table for 1.16.16-beta5.
Every build stamps its own time into the bundle, so the brief names the
hashes to expect.

In an EPUB or a web snapshot, Zotero spells a Segment's text with a newline
for an unspaced `<br/>` and with an inline image's `aria-label` or prose
`alt`, read from the source file, while the page holds neither. Before the
fix the plugin took that for a sentence on the wrong text: at Word, a voice
without word timing showed nothing for the sentence, and a voice with word
timings showed the word without the sentence around it. The EPUB view
also relabels every image not inside a link `aria-label="Zoom In"`
(Zotero 10.0.6 `reader.js:55590-55601`), so the image's text cannot be read
back from the page; the fix leaves a gap there instead.

## Prerequisites and permitted state

- Run [baseline](../baseline.md). This is not a WebDAV test: snapshot the
  folder switch, turn it off, confirm `positionSync().folder === false`,
  and restore its exact value/user-value state after cleanup.
- Fixtures: `test/fixtures/br-alt-text/br-alt-text.epub` imported as a
  standalone attachment, and `br-alt-text.html` as a snapshot attachment
  (the [html-compatibility kit](../scripts/html-compatibility/README.md)
  creates disposable snapshot attachments). Their paragraphs, in order:
  1 plain (control); 2 a stanza with three unspaced `<br/>`, one Segment;
  3 a `<br/>` followed by a newline (control); 4 an image with
  `alt="x over y"`; 5 an image with `aria-label="x sub i"`; 6 an image
  with the path-like `alt="figure-1.png"` (control); 7 plain.
  `build.py` beside them rebuilds both.
- Voices: one without word timing (a macOS System voice, or Fish Speech,
  OpenAI Compatible or Xiaomi MiMo where configured) and one with word
  timings (Kokoro-FastAPI, Azure Speech, Fish Audio or Speechify where
  configured). Never Zotero's Standard or Premium: they spend credits.
  Mute through the plugin volume and keep its user-value flag. Bound real
  playback to the paragraphs under test.
- The Highlight switches stay at their defaults, Sentence and Word on, so
  Zotero's level is `word`; record and restore them if they differ.
- Delete the disposable attachments at the end. Snapshot every other
  changed preference privately and put it back.

## Checks

The primary's color is read in chrome scope through the reader's primary
view, `view._getSpotlightColor('ReadAloudActiveSegment')`, while the
paragraph is being read. The plugin's sentence and word colors are
`style.sentenceColor` at `style.sentenceAlpha` and `style.wordColor` at
`style.wordAlpha` from `diagnostics.highlight()`, written `#rrggbbaa`.

### 1

1. **The beta is the one installed.** The installed bundle holds
   `function rangeSpells` (1.16.16-beta4 held `function segmentTextOf`
   instead) and hashes to the bundle hash the brief names, and
   `diagnostics.startup()` lists no failed step.

### 2

2. **A stanza with unspaced line breaks, a voice without word timing
   (EPUB).** Read paragraph 2. Expected: the primary's color is the
   plugin's sentence color (`#ffff00b3` at the defaults), not
   `#00000000`; `diagnostics.highlight()` shows `primaryShown: true` on
   the DOM view; a screenshot shows the whole stanza highlighted, all four
   lines. `toString()` alone disagrees with the Segment here, which is
   what makes the pass mean something. Was: `#00000000`, nothing drawn
   while the stanza was read.

### 3

3. **Inline images with alt text or an aria-label, a voice without word
   timing (EPUB).** Read paragraphs 4 and 5. Expected as in item 2 for
   each sentence, though every image on the page reads
   `aria-label="Zoom In"`. 1.16.16-beta4 failed here: `#00000000`,
   `sentencePieces: false`.

### 4

4. **The same paragraphs with a voice with word timings (EPUB).** Read
   paragraphs 2, 4 and 5. Expected, sampled mid-sentence on a word that is
   on the page (a sample on the image's own text, "y" of "x over y", has
   no place on the page: `primaryShown` false there is not a failure):
   `diagnostics.highlight()` `sentencePieces` is an object, not `false`,
   its `head`, the word and its `tail` together the sentence's page text
   (read uncut; the diagnostic cuts at 40 characters); the primary's color
   is the plugin's word color (`#3478f6b3` at the defaults); a screenshot
   shows the word inside the highlighted sentence. Was:
   `sentencePieces: false`, the word alone.

### 5

5. **The controls are unchanged (EPUB).** Paragraphs 1, 3 and 6 with
   either voice: highlighted as in items 2 and 4, as they were before the
   fix.

### 6

6. **The same in a web snapshot.** Repeat items 2 to 4 on the snapshot
   attachment, paragraphs 2 and 4 at least. Expected as there.

### 7

7. **Nothing in the logs for the sentences under test.** Across items 2
   to 6, `zotero_read_logs` holds no `highlight: sentence selector does not
   resolve to the sentence and no rewrite does`, no `highlight: word
   position shows the wrong text and no rewrite fixes it` in the blocks of
   paragraphs 2, 4 and 5, and `zotero_read_errors` holds no error from the
   plugin (a Permission denied or dead-object line from the walk over the
   page would be one). Each named line is written once per plugin
   lifetime, so a later identical failure is silent: items 2 to 4's
   per-sample values, not this line, are the evidence for each paragraph.
   The word-position line in the EPUB's paragraph 6 with a word-timed
   voice is not expected either since 1.16.16-beta6: its first word "A",
   one character, was written as a point CFI and painted transparent
   through 1.16.16-beta5 (issue #235, case
   [one-letter-words-and-last-blocks](one-letter-words-and-last-blocks.md)).

The snapshot's paragraph 7 (`body > p:last-child`), which the reader's two
appended `<div>`s left undrawn through 1.16.16-beta5, is that case's too
(issue #236).
