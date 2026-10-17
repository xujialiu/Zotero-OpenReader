# Scripts: System voices

[Case](../../cases/system-voices.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | What it expects | Params / state |
| --- | --- | --- | --- |
| `00-baseline-and-mute.js` | Snapshots the named prefs with user flags, owner readers, host window and tabs, position rows; mutes; turns the debug store on; the favoritesOnly precondition | Redacted baseline in `state.baseline`; volume 0; favoritesOnly off; rows 75 | `state.baseline`, `state.host`, `state.rowsBefore` |
| `01-enable-system-voices.js` | Turns System voices ON through the pane's own switch (`#ztts-enable-system`), then closes the window; skipped when already on | Label Enable → Disable; `system.enabled` true; window closed | — |
| `02-list-and-dedup.js` | `diagnostics.systemProvider()`: platform, count, dedup; Daniel/Moira/Rishi/Samantha/Tessa by identifier tail; the `macOS lists N voices` debug line; points `readAloud.defaultVoice` at Daniel (free) | `platform: "mac"`, 193 voices, no repeated id, the five once each, debug says 193 | `state.memoryVoice`, `state.baseline` |
| `03-voice-browser-column.js` | Reopens the settings window on the pane, waits out the listing, reads the first column | `System (193)` among the tier entries; leaves the window open | `state.settingsWindow` |
| `04-fixture-player-voices.js` | Imports fixture-a, opens it, opens and pauses the Player, probes the audio device, walks `_allVoices` by index | 193 ids starting `system::`, none twice; Daniel auto-picked | `state.fixtureItemID`, `state.fixtureTabID` |
| `05-shift-period-steps.js` | System + English (US), the voice before Samantha committed, trusted Shift+. ×3; reads the pending handoff target after each press; Play commits; restores the start voice by committing it back | Pending target steps Samantha → Sandy → Shelley (three distinct, list order, Samantha among them, never the same twice); `selectedVoiceID` follows each Play | `state.fixtureItemID` |
| `06-cleanup.js` | Closes and erases the fixture (rows back), clears the fixture's `documentVoices` entry, restores `reader.readAloudVoices`, turns System off through the pane, restores azure.region / `readAloud.defaultVoice` / volume / `readAloud.memory` (last), the WebDAV folder snapshot back and confirmed, windows and debug store back | Rows 75; every pref byte-identical; `"folder": true`; window minimized | `state.baseline`, `state.fixtureDocVoicePref` |

## Before you start

- `zotero_ping`, install the xpi, prove the build by the bundle (beta3: `sampleSetup` and the
  Windows-helper stop string in `content/zotero-tts.js`; beta2 has neither), then
  `diagnostics.startup()` — every step `ok`.
- WebDAV first (run not about WebDAV): snapshot the folder switch privately, switch it off,
  confirm `"folder": false` in `diagnostics.positionSync()` — again after the install. Note:
  `setBoolPref` to a value equal to the default leaves no user value (Gecko drops it); the
  original user value must be restored by name.
- Mute (`readAloud.volume` 0) before anything can play; the samples and the reading stay inaudible.
- The player never activates with a paid voice: `readAloud.defaultVoice` (what memory-sync
  applies) must name a listed free voice before the first popup opens — 02 writes it, 06
  restores it verbatim; `readAloud.memory` is only the legacy carrier.
- Restore the host window from the taskbar for 05 only (trusted input) and minimize again after.
- Item 1.18 is Windows only: NOT TESTABLE on macOS, never attempted.

## Limits

- A fixture document gets a `documentVoices.<lib>/<key>` entry seeded from the then-current
  `readAloud.defaultVoice` at its first popup open; a fixture reused after a voice change keeps
  the old voice. 06 clears the entry it created (core/document-voices.ts `open()`).
- With a live session every pick parks in the Handoff (`voice-pick.ts begin()`): the keys step
  the pending target and `selectedVoiceID` follows at the next Play. The state "manager active
  with the session ended" is not reachable on this build (an activation that resolves a listed
  voice plays); a `prepareHandoff` with nothing to land on logs
  `OpenReader: no prepared handoff boundary was reached` (one entry, from a play at the
  document's last segment).
- `diagnostics.voiceSwitch()`'s per-reader `selected` reads Xray-blind (null); read the
  selection through `waiveXrays(manager).selectedVoiceID` and the handoff from
  `diagnostics.engine()`.
- Zotero 11.0-beta.1 suspends a script-started session's AudioContext until a trusted press
  (Shift+Space) plays it; the trusted press supplies the gesture the gate wants.
- The settings pane clears the default voice when its provider is switched off while the pane
  is open (Disable System with a System default) — restore the pref after the pane work, and
  verify with the pane closed.
- A paused Handoff expires (a deadline) — a pending target can vanish between scripts; 05
  re-derives everything from the settled state.

## Runs

| Run | Items | Result |
| --- | --- | --- |
| 2026-10-18 · 1.16.12-beta3 · `…-system-voices(-r2…r7)` | 1.17: systemProvider 193/dedup/five names, `macOS lists 193 voices`, browser column `(193)`, `_allVoices` 193 `system::` none twice, Shift+. steps the pending switch Samantha → Sandy → Shelley and commits on Play — PASS; 1.18 NOT TESTABLE (macOS) | Scripts 00–06 as they stand; 04/05 revised after their first runs (free-voice order, Handoff reads); 05a dropped (its idle precondition is unreachable — see Limits) |
