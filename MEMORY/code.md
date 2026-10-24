# Code — Zotero-OpenReader

Read before changing `src/`, `addon/` or `test/`, or inspecting Zotero's
source/profile. Follow `MEMORY/MEMORY.md` and the area's decision records.

## Change the implementation

1. **Red first:** write a failing test before the fix or feature. Inject
   Zotero dependencies so logic is unit-testable; `memory-sync.ts`,
   `backup-rows.ts` and `read-aloud-shortcuts.ts` show the pattern.
2. **Keep the boundary:** `src/core/` is pure logic with no Zotero
   globals. Direct Zotero globals belong only in `src/index.ts`,
   `core/settings.createZoteroPrefs` and `ui/prefs-pane`; declarations
   live in `src/globals.d.ts`. Inspect the source tree for current module
   locations rather than maintaining a second inventory here.
3. **Bound I/O:** every network call uses `core/timeout.withTimeout`.
   Surface failures as errors instead of leaving a request hanging.
4. **Preserve capabilities:** providers enable independently; OpenAI
   voices/models are not the sole hard-coded option because many servers
   are OpenAI-compatible. Use real per-word timestamps only; a voice
   without them uses `remote-interface.wholeSegmentTimestamp` and
   sentence highlighting.
5. **Verify:** apply the tier in `MEMORY/MEMORY.md` and the implementation
   workflow in `MEMORY/testing.md`. `package.json` defines commands;
   `npm test` includes a build through `test/build.test.ts`.

The Engine's `time-stretch`, `word-onset` and `speech-chain` were copied
from Zotero 10.0.3 (ADR 0006). Apply the Git topic's contribution/copying
rules before bringing code into this repo or into OpenReader.

## Zotero-facing work

Before touching reader realms, preferences, FilePicker, Read Aloud
internals, installed Zotero source or its profile, read
[MEMORY/zotero.md](zotero.md) in full. It holds the verified pitfalls,
source/profile paths and test-server discovery rule. The core's
`notes/NOTES.md` requirement still applies to Read Aloud internals.

## Preference pane

- **Initialization:** register no `scripts` with the pane: Zotero runs
  them before markup exists. Initialize from the root
  `<vbox onload="Zotero.ZoteroTTS.prefsPane.onPaneLoad(document)">`.
  `preference=` inputs redraw on pref change; unbound rows such as
  shortcuts expose `refresh()`.
- **Effect first:** before changing visible text, read `MEMORY/docs.md`
  §User-facing text: effect first. Labels and `?` tooltips explain what
  the setting gives the user and its cost/limit; implementation belongs
  in notes (issue #18). README carries user-facing background.
- **Tooltip budget:** at most two sentences: the effect, then a cost or
  limit such as billing, platform or when it takes effect (2026-09-29).
  Omit a tooltip that only repeats its label. Keep label-implied Off
  behavior, edge cases and defaults already shown by the row out of it.
  Turn a standalone explanatory line into its row's `?`.
