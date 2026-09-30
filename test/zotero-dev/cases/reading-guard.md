[Checklist index](../README.md) · [Scripts](../scripts/reading-guard/README.md)

## The reading guard (issues #11, #71, #80, #121, #160)

Item 3.9 retains its original number. Issue #121 replaces the blanket
stop-and-continue question with a refusal only for affected reading sessions.
Issue #160 gives that refusal *Close and continue*, which closes the player in
exactly the listed tabs and applies the change, and never refuses turning a
provider on.

### 3.9

Use the baseline, two disposable fixture readers, and configured providers.
Keep automatic settings sync and backup off during temporary preference edits.
Restore their switches last. Never print keys or raw settings snapshots.

| Check | Expected result |
| --- | --- |
| Startup | `diagnostics.startup()` has no failed steps, including `live voice choices`. |
| Unused provider | While a fixture reads with provider A, disable and re-enable unused provider B through the settings pane. No refusal; A's selected voice, controller and playback position remain unchanged. The player's choices remove/add B without closing the player. |
| Used provider | Disable A through the pane. The pane's own dialog (`#ztts-notice`) reads `This change affects the reading in a tab:`, lists only A's fixture (not B's), and has **Close and continue** and **Cancel**, Cancel focused. Cancel and a trusted Escape each leave the pref true, A's session as it was and its player open. A trusted Enter on the focused Cancel cannot be produced through the bridge (see the kit's limits); it stays human-verifiable. |
| Close and continue | Disable A again and click **Close and continue**. `diagnostics.players()`: A's fixture `popupOpen` and `active` false, its reader still in `Zotero.Reader._readers` (the tab open); B's fixture still open, its controller and voice identical and its clock advancing. `A.enabled` is false after the same click, no second dialog. |
| Close for the other refusals | Favorites-only over an unmarked current voice of A's fixture, every voice B's fixture protects marked first (a handoff protects two): **Close and continue** closes A's fixture's player only, and `readAloud.favoritesOnly` is written in the same click. File and WebDAV restores open native dialogs and are unit-tested only. |
| Enable never asked | With A's fixture reading and a player open whose voice is not known yet (`readingImpact()` marks it `uncertain`), Enable a disabled provider C whose check does not synthesize (`zotero-standard`; Fish's check synthesizes a probe and can time out). No dialog; the check runs and `C.enabled` goes true; `readingImpact({ "C.enabled": true }).affected` is `[]`; `liveVoiceList()` `applied` increases for the open players while A's controller and voice stay identical. |
| Background and paused | A second fixture paused on B protects B even when its tab is unselected. A change unrelated to both sessions is allowed. `diagnostics.readingImpact(changes)` names exactly the affected titles. |
| Favorites filter | With each current voice marked, enable favorites-only: allowed. Mark/unmark another voice: allowed. Unmark a current voice, or enable the filter over an unmarked current voice: refused without any pref or playback change. Exercise both the settings browser and plugin player. |
| Continuous audio | Use a long sentence and running audio output. Across an allowed list refresh, the controller and current voice object remain identical, playback time advances, and that sentence receives no new synthesis request. `diagnostics.liveVoiceList()` shows `applied` increasing. A muted or suspended clock alone does not prove continuity. |
| Prepared voice handoff | Start a switch to another voice, then change an unrelated provider/list entry while preparation is pending. Both original and target voices remain protected; the handoff finishes normally, without cancellation from the list refresh. |
| Failed discovery | Omit the playing provider's voices using a bounded fixture transport stub. Refresh choices. The current voice remains listed, controller unchanged, no fallback or new synthesis; `retained` increases. Restore the stub in the same script. |
| Restore | A harmless complete restore succeeds; one affecting any current voice/configuration is refused as a whole, including unrelated keys in that file. File picker/native confirmation paths are unit-tested, not driven through blocking native prompts. |
| Background sync | Feed newer settings for used provider A, unused provider B, and an unrelated shortcut through a controlled sync transport. Only A is deferred; B and the shortcut apply. Closing A's player (without closing its tab) triggers the deferred apply. Pausing does not release it. Keep fixture transport data separate from the owner's real WebDAV data. |
| Closed player | Close a fixture player, change its provider/list settings, and reopen it. The old cached list cannot start a removed voice; fresh choices and the normal remembered-voice resolution apply. |
| Teardown | Close fixtures, restore exact pref values and user-value presence, stop temporary transports, and read new plugin errors. No dead-object burst or stale list application. Leave Zotero minimized. |

`diagnostics.readingImpact()` reports session titles, protected voice IDs and
provider names; it does not return configuration values. A handoff protects
both voices. A player whose initial list is still loading is conservatively
protected until its voice is known.

`diagnostics.liveVoiceList()` reports per reader `applied`, `loading`,
`retained`, and `revision`. `retained` counts protected voices absent from a
fresh listing that were kept from the current session. This is recovery from
discovery failure, not permission to remove a current voice through settings.

Unit tests cover delayed and stale list results, shutdown during discovery,
restore atomicity, combined favorites changes, and a failed provider check
that returns after a reading session starts. For #160 they also cover a
player that would not close (its close throws: the OK-only notice names it,
the change is refused) and a tab that became affected while the question was
up (not closed, named in the notice); neither is produced live, a dead reader
being unsafe to make on purpose. Live checks cover compartment
access, native choices, real playback continuity, and the actual UI refusals.
Subjective sound quality and moving highlight alignment remain human-only.

Verified on 1.12.12-beta6 (candidate 163fc22): [observed values and
limits](https://github.com/xujialiu/Zotero-TTS/issues/121#issuecomment-5713289694).

The #160 rows verified on 1.16.3-beta4 (candidate f656619): [observed values
and limits](https://github.com/xujialiu/Zotero-TTS/issues/160#issuecomment-5903420541).
