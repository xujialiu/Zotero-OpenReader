# Replacements: have the voice say it right

**English** · [简体中文](replacements.zh.md)

Papers are full of abbreviations and names that even the best voices get
wrong. A replacement has the voice say other text in place of a piece of
the document's text: `IL-6` read as *interleukin six*, a name spelled the
way it sounds. The document is not changed, and the highlight stays on its
text. Replacements work with every voice, Zotero's own included.

## Two lists

- **Global replacements** apply to every document. Edit them under
  **Edit → Settings → OpenReader → Reading → Replacements: Edit…**
- **Document replacements** apply to one document. Click the **A→B**
  button in the player: left of the layout button in the top and bottom
  bars, at the bottom-left corner of the floating panel. Its window lists
  this document's rows above the global ones, with an *Applies to* column;
  a global row edited there changes for every document.

Each attachment has its own list: the PDF and the EPUB of one item do not
share one.

## Add a row

Click **+** under the list. Fill in:

- **Text** — what to look for. Text you selected in the document before
  clicking the player's button is filled in for you.
- **Read as** — what the voice says instead. Leave it empty to skip the
  text.
- **Match** — Exact, Wildcard or Regular expression, below.
- **Match case** — on by default: `IL` does not match `il`.
- **Applies to** — this document, or all documents; only in the player's
  window.

**Edit…**, or a double-click, changes a row; **−** removes the selected
rows. Nothing is saved until you click **OK** in the replacements window.

## Match

### Exact

The default. It matches whole words, and a word goes on through `-`, `/`
and `_`:

- `IL` matches `IL`, `(IL)`, `IL,` and `IL's`;
- `IL` does not match `IL-2`, `IL_2` or `ILLUMINATE`.

In Chinese, Japanese, Thai and other text written without spaces, a row
matches anywhere.

### Wildcard

`*` stands for any part of a word, nothing included, and `?` for exactly
one character. Neither goes past a space or any punctuation other than
`-`, `/` and `_`. Each `*` and `?` in **Read as** is filled with what the
one in the same place in **Text** matched:

| Text | Read as | `IL-6 and IL-10 rose` is read |
| --- | --- | --- |
| `IL-*` | `interleukin *` | interleukin 6 and interleukin 10 rose |
| `H?O` | `water ?` | (for `H2O`) water 2 |

Write `\*`, `\?` and `\\` for the characters themselves, in either field.

### Regular expression

JavaScript's regular expressions. In **Read as**, `$1`, `$2` and
`$<name>` repeat a group, and `$&` the whole match. No word boundary is
added: write `\b` where you want one.

| Text | Read as | Read |
| --- | --- | --- |
| `\bIL-(\d+)\b` | `interleukin $1` | `IL-6` as *interleukin 6* |
| `(\d+) ?mg\b` | `$1 milligrams` | `5mg` as *5 milligrams* |

**OK** refuses a pattern that does not compile, and one that can match
nothing at all.

**A slow pattern is skipped, never waited for.** Some patterns, such as
nested repetition like `(a+)+`, take practically forever on some
sentences. When a wildcard or a pattern takes more than a quarter of a
second on a sentence, it is skipped for that sentence only: the other
replacements still apply, the player's **!** names it, and its row turns
red in the window. Zotero never freezes on one. Simplify the pattern.

## Order

Rows apply from the top down, this document's before the global ones.
Each row replaces only text the rows above it left alone, and text a row
put in is never matched again. Drag a row within its list, or press
**Alt+↑** / **Alt+↓**, to change what comes first; a new row goes to the
end of its list.

| Row | Text | Read as |
| --- | --- | --- |
| 1 | `IL-6` (Exact) | `interleukin six` |
| 2 | `anti IL-*` (Wildcard) | `anti-interleukin *` |

`anti IL-6` is read *anti interleukin six*: row 2 no longer finds `IL-6`,
which row 1 replaced. With the two rows swapped, it is read
*anti-interleukin 6*.

In the player's window a global row turns gray when this document has a
row with the same text, match and case: the global one never applies here.

## While reading

Click **OK** while a document is read, and the reading goes on:

- **The sentence being read**, if its text changed, switches to the new
  text the way a voice switch does: at a word both versions mark, else at
  the start of the next sentence.
- **Sentences fetched ahead** are asked for again only where their text
  changed. On a paid provider those few sentences are billed again.
- **Paused**, the next **Play** reads the new text.

To hear the change at once, skip back a sentence.

## Brackets and the highlight

- **Brackets** — rows look at the document's text before *Remove enclosing
  brackets when reading* takes brackets out, so write the text as you see
  it, such as `[12]`. **Read as** is sent exactly as written: brackets in
  it stay.
- **Highlight** — while the voice says the **Read as** text, the whole
  replaced text is highlighted.

## Backup and sync

Both lists travel with **Backup settings** and **Sync settings** between
computers. A list goes whole: edit the same list on two computers before
they sync, and only the later edit is kept. The OpenReader app on your
phone does not use them.

## Limits

- A row never matches across two sentences.
- The voice browser's ▶ sample is read without replacements.
