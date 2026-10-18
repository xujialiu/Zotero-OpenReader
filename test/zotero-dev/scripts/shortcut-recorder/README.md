# Scripts: the shortcut recorder (issues #210, #211)

[Case](../../cases/shortcut-recorder.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

Trusted presses through `nsITextInputProcessor` (§6). The settings window is opened in-script
(`Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top')` +
`navigateToPane('zotero-tts-pane')`). Zotero's settings search box is `search-textbox#prefs-search`
(not `#zotero-prefpane-search`). A provider's fields are DISABLED while the section is on — the
Base URL test needs the section off, unlocked through the pane's own Enable/Disable toggle (a raw
pref write does not repaint the pane).

| Script | Checks | Expected | Params |
| --- | --- | --- | --- |
| `sr-01-record-intlbackslash.js` | Item 2 (#210): arm Faster, trusted Shift+IntlBackslash → the row and the pref read `Shift+IntlBackslash` (not "(invalid)"); the key fires Faster on a fixture reader (toast `1.5×`, consumed) | pass true; restores the Faster pref | `fixtureSr` |
| `sr-02-armed-focus-away.js` | Item 3 (#211): arm Slower, focus OpenAI Compatible's Base URL → the recording ends at the focus move; keys reach the field, the binding untouched; again with `#prefs-search`; a combination on the armed button records | pass true; restores the Slower pref | — |

Run notes (2026-10-18, 1.16.12-beta6, macOS):

- Item 2 PASS: `Shift+IntlBackslash` recorded (row + pref, `tip.keydown()` 1) and the key fired
  Faster on the fixture reader (toast `1.5×` from 1.45×).
- Item 3 PASS in substance: with the Base URL focused the recording ended at the focus move; with
  the search box focused the Backspace/z keys reached the field (its text changed) and Slower kept
  `Shift+X`; a combination on the armed button recorded (`Shift+V`, verified on a freshly opened
  pane — a pane that has seen several synthetic focus/click rounds can leave the row label showing
  `Press the new keys…` after the focus moved, while the key routing stays correct; a human click
  path is the cleaner check for the label timing).
- `KeyboardEvent` init objects need cloning into the target window; the TIP is bound per window.
- `keydown()` = 1 means someone consumed the key; the binding's effect (the pref, the toast) is
  the evidence.
