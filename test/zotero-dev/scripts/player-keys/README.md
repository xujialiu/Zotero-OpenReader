# Scripts: The player keys and the tab they reach

[Case](../../cases/player-keys.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `01-held-speed.js` | Held Shift+C/X from reader and plugin-player focus in paused and playing sessions; saturation, rebinding, input focus, and nonrepeat reset/skip/options | 0.05 steps at each trusted repeat; bounds 0.5–3 do not call setSpeed; old bindings fall through after rebind; reset/skip/options act once; search input blocks speed changes | fixture state from player-controls setup |
| `02-held-speed-supplement.js` | Explicit paused C/X retention, live repeat-flag observation, and old Shift+P fallthrough during Shift+L remap | PDF manager is active/paused before and after C/X; listener sees `false,true,true`; old P has `keyDown:0` while L cycles top→A | fixture state from player-controls setup |
| `03-212-outline-slider-keys.js` | Issue #212: with a paused session, the focused Outline item keeps its arrows (Right/Left and Shift+ variants expand/collapse, segment never moves, key not consumed); Appearance-slider arrows; control = page click + ArrowRight skips | Each press not consumed (`keydown() 0`), `.expanded` toggles with child `li` count, segment position/currentIndex unchanged, paused retained; slider part records NOT TESTABLE when the build has no range input; control skips +1 segment | fixture state from player-controls setup |
| `04-197-global-speed-unopened.js` | Issue #197: on a tab whose Player was never opened (`lang` null), with *Use one speed everywhere* on, C×3 then X×3 step the Global speed; opening the Player reads the last shown speed | Toasts `1.5×/1.55×/1.6×` then back (this build trims trailing zeros), `speedPercent` 145→150→155→160→145 after each press, Player label `1.45×`; profile `shortcuts.speedUp`/`speedDown` rebound for the presses and restored byte-exact | `fixturesDir`; fixture state |

Before you start:

- Install and identify the exact candidate (XPI SHA-256 `0b8f64998783a4ae4634513c4829beeb16a8b0d277de9f4afdad4c204271130c`; bundle SHA-256 `1d95a8918b5619d2d14f1d8407d544f1ac1018877b771be9b4e0ad2f13f26f3d`), run baseline/startup, and reuse `player-controls/02-fixtures.js` for muted disposable PDF/EPUB readers.
- Keep Zotero foregrounded for trusted input; do not start the owner's document. Restore all shortcut bindings, speed/memory values, fixtures, sync guard and host state in cleanup.
- Held speed coverage uses the disposable PDF in both reader-view and plugin-player control focus, including a PDF playing row; the position cycle separately covered PDF and EPUB frames.

Limits:

- 2026-10-21 (build 1.16.13-beta2 @ 8bf3240): #212 FAILED — with the Outline item `.active` and the session paused, plain and Shift+Arrow presses are consumed (`keydown() 1`) and the segment MOVES (position 6→7 on ArrowRight, 6→11→6 on Shift+Arrows); Ctrl+ArrowRight (unbound) passes through and Zotero's outline expands (`li` 2→4). The consumer is not the plugin: a research probe the same evening (`.tmp/zotero-dev/212-research/probe.js`, run `2026-10-21-1.16.13-beta2-212-research4`) recorded the one `skipAhead` call's caller as `reader.js:84550`, Zotero 11's own `KeyboardManager._handleKeyDown`, which skips on bare and Shift arrows while a session is open; see the case's #212 bullet for the mechanism check that replaces this script's expansion test. The Appearance-slider sub-check is NOT TESTABLE: this Zotero 11 build renders no `input[type=range]` in the Appearance popup (only Reading Mode/Scrolling/Spreads/Split View/Themes).
- 2026-10-21: this profile binds `speedUp` to an EMPTY value and `speedDown=Shift+V`; #197 ran with `speedUp=Shift+C`, `speedDown=Shift+X` rebound for the presses and restored byte-exact afterwards. The toast trims trailing zeros (`1.5×`, not `1.50×`).
- 2026-10-21: trusted input needs the Zotero window OS-active; scripts check `Services.focus.activeWindow` and refocus. The outline expands via the `.expanded` class + child `li` count (no aria-expanded), and only when the item is `.active` (click its `.title` first).
- Earlier attempts corrected probe setup/timing, foreground focus, modifier synthesis, stale DOM references and diagnostic assumptions; the final revisions listed below ran successfully.

- `nsITextInputProcessor` supplies trusted initial and repeat keydowns in one transaction; the event cadence is represented by the repeat flags. Natural audio quality remains a human observation.

Final results: [issue #122 completion table](https://github.com/xujialiu/Zotero-OpenReader/issues/122#issuecomment-5717278769).

Runs:

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-10-21 / 1.16.13-beta2 (8bf3240) | #212 FAIL as written (arrows consumed, segment moved 6→7, 6→11→6; Ctrl+Arrow expands) — the skip is Zotero 11's own (`reader.js:84550`, research run `…-212-research4`), not the plugin's; slider NOT TESTABLE (no range input); control skip +1 position PASS. #197 PASS: idle tab `lang` null, C×3 145→150→155→160 with toasts `1.5×/1.55×/1.6×`, X×3 back to 145, Player opened afterwards reads `1.45×` paused; shortcuts rebound then restored exactly | `2026-10-21-1.16.13-beta2-pk-212b`; `2026-10-21-1.16.13-beta2-pk-197c` |
| 2026-09-17 / 1.12.12-beta7 | Focused §4.1 held-speed and nonrepeat checks PASS; AudioContext running during playing row; the profile’s custom Options binding was restored | `2026-09-17-1.12.12-beta7-player-keys-held13` |
| 2026-09-17 / 1.12.12-beta7 | Supplement PASS: paused C/X state retained, live listener observed repeat flags, and old P fell through while L was active; exact cleanup PASS | `2026-09-17-1.12.12-beta7-player-keys-supplement1`; `one-90-cleanup.js` |
