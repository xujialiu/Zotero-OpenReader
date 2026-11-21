# Scripts: Favorite voices (#195)

| Script | Check | Expected measured values | Params/state |
| --- | --- | --- | --- |
| `00-baseline-isolate.js` | Snapshot and isolate this disposable Zotero profile | Zotero 10.0.9; favorites empty/off; volume 0; WebDAV folder false; no readers; host minimized | none; saves `state.fix4Prefs`, `state.fix4Host` |
| `01-startup-identity.js` | Candidate startup and highlight pin | 1.17.3-beta; 31 startup steps, all ok; pin Word | none |
| `02-fixture-open.js` | Open one disposable PDF and pause a free System voice | One fixture reader; System Albert selected, active+paused, Player open | `params.fixturesDir`; saves fixture, reader and voice in state |
| `03-reading-guard.js` | Real Player `zttsCommand('favorite', id)`: mark A with filter off, remove last favorite while A is held, then attempt removing A from `[A,B]` with filter on | First two changes `affected: []`; last removal stores `[]` and keeps A active+paused/open; blocked attempt affects the fixture and leaves `[A,B]`, A, and Player state unchanged | fixture, voice and pref snapshot in state |
| `04-voiceless-favorite.js` | Click the shown System voice-browser heart while the fixture Player is open with `selectedVoiceID: null` | System / English (United States) heart `♡` → `♥`; A stored; Player stays open and unselected; preferences restored | fixture, voice and pref snapshot in state; open Settings pane |
| `05-cleanup-restore.js` | Close Settings and fixture, erase only this imported PDF, restore prefs and runner state | Fixture absent; no readers or position rows; named prefs and user flags match baseline; WebDAV false; Word pin restored; host minimized | private baseline and fixture in state |

## Before you start

- Start a fresh disposable Zotero profile and isolated zotero-dev bridge. Before any state change, compare `zotero_ping`'s complete data-directory path with the disposable profile's declared path; stop on any mismatch. Candidate 4682892 was already installed: XPI SHA-256 `bb618b7a496403ff06f4e207e8a27c833c9b8bc3252af0447e088fb02a4c3f48`; embedded bundle SHA-256 `1b4d506e101aa068b0a5a955f44554a0e1f6b4cdd831c4506d7293e7edd1ebfe`.
- The only fixture used was `test/fixtures/fixture-a.pdf`, imported once into that disposable data set. All plugin network-provider switches were off; only free local System voices were used. The fixture Player was paused immediately after opening at volume 0; no voice sample or remote provider request was made.
- Touched state: favorites, favorites-only, default voice, saved voice memory, `reader.readAloudVoices`, Sentence/Word switches, volume, System enabled state, WebDAV switches, Settings window, and this fixture. `05` restores the baseline and leaves Zotero minimized.

## Limits

- The no-selection Player catalog contained 0 voices, so its `zttsCommand` path could not choose a favorite. The live mark used the actual Settings voice-browser heart while the real fixture Player was open and `selectedVoiceID` was null. `readingImpact` still reported A from the manager's retained internal voice, but `affected` was empty with favorites-only off.
- Failed drafts are not retained: an empty-string favorite pref needed `raw || '[]'`; an early Player heart selector was absent; staging B through a filtered Player list was rejected; cleanup initially treated numeric `database.rows` as an array. The final scripts handle these cases.
- No native dialog, remote provider, paid voice or sample playback was used. The fixture Player opened on local System Albert and was paused in the same script at volume 0. The native Player-command route for the no-selection catalog was NOT TESTABLE; the shown heart covered the mark behavior.

## Runs

- **2026-11-21, candidate 4682892 / 1.17.3-beta, Zotero 10.0.9**: #195 live checks PASS; no-selection `zttsCommand` route NOT TESTABLE as described above. [Verification table](https://github.com/xujialiu/Zotero-OpenReader/issues/195#issuecomment-7065240818).
- Last run: `00`/`01` `2026-11-21-1.17.3-beta-favorites-fresh`; `02` `...favorites-fresh-02`; `03` `...favorites-fresh-06`; `04` `...favorites-fresh-09`; `05` `...favorites-cleanup-11`.
