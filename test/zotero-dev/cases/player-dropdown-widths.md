[Checklist index](../README.md)

## The Player's three dropdowns share the bar's width (issue #227)

In the Top bar and the Bottom bar the provider, language and voice
dropdowns are always equally wide. They grow and shrink together with the
bar, between a floor of 7.3em (94.9 px at 13 px) and a cap of 16.5em
(214.5 px at 13 px), where Arabic (United Arab Emirates) fits. Room past
the cap stays before the layout button. Below the floor the bar overflows
to the right as before. The Floating panel's dropdowns stay as wide as the
panel. Expected values are derived from `addon/content/player.css` and
`test/ui/player-css.test.ts` unless a run is cited.

Run the baseline first; WebDAV off as `MEMORY/testing.md` says. Fixture:
`fixture-a.pdf`, its Player opened **muted** (`readAloud.volume` 0), not
playing. Nothing is picked in the Player, so no document voice changes.
Save and restore `extensions.zotero.zotero-tts.readAloud.playerLayout` and
close the Player at cleanup if it was closed before. Never touch the
owner's readers.

Evidence comes from the fixture reader's `#ztts-player-frame` and its
`contentDocument`. `F` is the computed `font-size` of `.player` in px
(13 unless Zotero's font size is changed). A dropdown is
`.voice-group .field`, its name `.picker .value`. Boxes are
`getBoundingClientRect()` in CSS px. To vary the bar's width, set the
frame's `style.width` and measure in the same script. The host puts the
width back at its next layout pass, so there is nothing to restore.

### 1. Equal widths in the bars

For the Top bar, then the Bottom bar (`Shift+P`, or the layout menu):

1. With the frame at 2000 px, the three dropdowns are each 16.5 × `F` px
   wide (214.5 at 13 px), within 0.5 px. The layout button's right edge
   is 10 px (the bar's padding) inside the bar's right edge, and the gap
   before it is wider than 8 px.
2. With the frame at 500 px, the three are each 7.3 × `F` px (94.9 at
   13 px), within 0.5 px. `.player`'s `scrollWidth` exceeds its
   `clientWidth`, so the bar overflows to the right as it did before.
3. With the frame at the width that leaves the dropdowns between floor and
   cap, try 900, 1000 and 1100 px. Wherever the three are between
   7.3 × `F` and 16.5 × `F`, they are equal within 0.5 px, and the layout
   button's left edge is 8 px (one gap) after the previous visible
   control, so no free room is left.
4. In every state above, the frame is 34 px high and every dropdown's top
   is the same.

### 2. The names fit at the cap

1. With the frame at 2000 px, the language name shows whole:
   `.value`'s `scrollWidth` ≤ `clientWidth` for every dropdown whose
   current name is under 29 characters.
2. Set the language dropdown's `.value` `textContent` to
   `Arabic (United Arab Emirates)`, then to `English (United States)`, and
   the provider dropdown's to `OpenAI Compatible`, then to
   `Zotero Premium`. Each time `scrollWidth` ≤ `clientWidth`. Only the
   text node changes, and the next update from the host rewrites it.
3. The language dropdown's `title` is `Language: ` plus its whole name, in
   an English Zotero. Whether the tooltip shows on hover is a human check.

### 3. The Floating panel is unchanged

1. In the Floating panel, each dropdown is as wide as `.voice-group`,
   within 0.5 px: 282 px in the 300 px panel (300 minus 8 px padding and
   1 px border on each side).
2. The three dropdowns sit one under another, as before.

### 4. Human check

On the owner's usual window, Top bar: the three dropdowns look equally
wide, and English (United States) reads whole. A screenshot of the bar is
enough.
