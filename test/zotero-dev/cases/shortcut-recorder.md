[Checklist index](../README.md) · [Scripts](../scripts/shortcut-recorder/README.md)

## The shortcut recorder

Trusted presses through `nsITextInputProcessor` (rulebook step 9): the
recording on the settings window, the new key on the main chrome window
with a fixture reader open; `keydown()` = 1 means someone consumed the
key.

Item 4.8 of the checklist, under its original number.

### 4.8

8. **The recorder.** Click a shortcut field → `Press the new keys… (Esc
   cancels)`; Shift+V through the TIP on the pref window → the field and
   the pref read `Shift+V`, the new key fires on a reader and the old
   one does not; a bare letter is rejected with the modifier message;
   Escape cancels. Restore the pref; the row repaints from its own
   handlers only.

### 2. Keys outside the letters, digits and named keys (#210)

Record Faster with trusted Shift + the ISO extra key (`IntlBackslash`;
if the TIP cannot produce it, Ctrl+Pause): the row reads
`Shift+IntlBackslash` (not `(invalid)`), the pref holds the same text, and
the key fires Faster on a fixture reader. A key the parser cannot read is
unit-tested only (the message `This key cannot be used for a shortcut.`,
the binding kept). Restore Faster to its default.

### 3. A recording left armed (#211)

Click Slower (armed), then click into a text field of another section
(OpenAI Compatible's Base URL): the row stops showing `Press the new
keys…`. Type Backspace and Cmd+A there: they reach the field (its text
changes; snapshot and restore it), Slower still reads `Shift+X` and its
pref is unchanged. Arm Slower again and click into Zotero's settings search
box: the same. Arm Slower and press a combination without moving the
focus: it records as before.
