[Checklist index](../README.md) · [Scripts](../scripts/favorites/README.md)

## Favorite voices

Hearts, *Offer only favorite voices* and the default it allows.

Items 2.3–2.5 of the checklist, under their original numbers. Item 2.8,
the ♥ in Zotero's own player's list (issue #45), went with that player in
#134.

### 2.3

3. **Only a favorite can be the default** while only favorites are
   offered: a non-favorite row is refused silently (grayed, `BLOCKED_ROW_TITLE`),
   the memory unchanged; a favorite row makes the default (memory
   `{id, lang}`, the status line names it, Zotero's entry for its
   language gains it); the default row clicked again clears it
   (`Zotero's own choice per language`).

### 2.4

4. **Hearts.** ♥ appends to `readAloud.favoriteVoices`, un-♥ removes;
   an un-♥ and re-♥ reorders the pref (append) — parsed-equal, not
   byte-identical, by design. The Local list itself does not change.

### 2.5

5. **Offer only favorite voices, both ways.** The switch off clears the
   status line's not-a-favorite warning and unblocks every row; on
   again blocks them. **Since 1.10.2 the switch refuses to go on while
   the default is not a favorite** — the notice names the voice and the
   two ways out (`src/ui/voice-list-switches.ts`), the pref stays false.

### Reading guard on a favorite change (#195)

With an isolated fixture Player open and no selected voice, mark a listed
voice while *Offer only favorite voices* is off. The heart and stored
favorite change without closing the Player. With the filter on, unmark
the only favorite while that voice is in use. The list expands and the
voice stays selected. With two favorites, removing the one in use must
still be refused. Use a fixture voice separate from the Global default.

Read `diagnostics.readingImpact(changes)` before each action. Expect
no affected tabs for the first two and the fixture tab for the third.
Also check enabling the filter with an empty list. Capture and restore
the exact favorite settings, user-value flags and fixture voice choices.
