[Checklist index](../README.md) · [Scripts](../scripts/global-speed/README.md)

# The global speed travels (issue #82)

Run the baseline first. Use the setup and restoration rules of
[settings sync](settings-sync.md): the dedicated test WebDAV for both
plugins before anything is installed or changed, automatic sync and backup
suspended until cleanup. Privately snapshot `readAloud.memory`,
`readAloud.speedPercent`, `globalSpeedMigrated`, `readAloud.globalSpeed`,
Zotero's `reader.readAloudVoices`, `webdav.syncState` and the sync
switches. Use fixture attachments only. The design is design/ADR 0012.

The mechanism diagnostic is
`JSON.parse(Zotero.ZoteroTTS.diagnostics.readAloudMemory())`:
`memory.speed` (the global speed as a speed), `speedPercent` (its pref, in
hundredths; `null` means no user value, which reads as 100),
`speedMigrated`, `zotero.<lang>.speed` and each reader's `speed`. The sync
side is `diagnostics.settingsSync()` (`stamps`, the last sync's counts)
and `diagnostics.sharedSettings()` (the file as this machine reads it).
Verify the installed beta by these fields, not its version string.

1. **The update copies the speed and sends it nowhere.** Before installing
   the beta, record the old build's global speed: the `speed` of the
   `readAloud.memory` JSON (not a secret; the snapshot holds the rest).
   Turn the settings sync on against the test WebDAV and let it seed, then
   install the beta in place. Expected: `speedMigrated` true,
   `speedPercent` the recorded speed × 100 (or `null` when it was 1.0),
   `memory.speed` the recorded speed, `startup()` failed `[]`. The
   `stamps` of `settingsSync()` have no `readAloud.speedPercent`, and the
   shared file has no `readAloud.speedPercent` item after a sync.
2. **A change here travels.** Change the speed with the player's slider or
   Shift+X. At once every open reader's `speed` and every
   `zotero.<lang>.speed` follow. Within about 10 s the stamps hold
   `readAloud.speedPercent` and the shared file an item with the new
   hundredths and `by` this machine.
3. **A speed from another computer arrives with no player open.** Close
   every player, leaving a fixture's reader tab open. Write a newer
   `readAloud.speedPercent` item (170) into the test shared file and
   trigger a sync (open the settings pane). Expected: the pref 170,
   `memory.speed` 1.7, the fixture reader's `speed` 1.7, every
   `zotero.<lang>.speed` 1.7, the stamp equal to the item's `ts`, nothing
   pushed back. The voice browser's slider reads `1.7×` and its status
   line ends `Global speed: 1.7×`.
4. **It waits while a player is open.** Open a fixture's player and pause
   it. Write a newer item (190) and trigger a sync. Expected: the sync
   reports it deferred, the pref and the reader's `speed` unchanged. Close
   the player's popup: the next sync applies it (pref 190, reader `speed`
   1.9). Pausing alone never releases it.
5. **Backups.** With no player open, restore a settings backup whose
   `readAloud.speedPercent` differs: it applies as in item 3. With a
   fixture's player open, restoring such a backup is refused and names the
   tab; nothing changes. A backup without the key leaves the speed as it
   is.
6. **Use one speed everywhere off.** Turn the switch off, write a newer
   item, and sync with no player open. The pref and the pane's slider
   follow; no reader's `speed` and no `zotero.<lang>.speed` change.
   Restore the switch.
7. **Cleanup.** Restore every snapshotted pref, delete what the case wrote
   to the test shared file, erase the fixtures, and only then restore the
   original sync and backup settings. No new plugin errors.

Covered by unit tests only: the migration's fallback to Zotero's own
per-language speed and its run-once marker, the JSON losing its speed
field, the refusal of a pane-slider write to spread twice, and older
builds passing the unknown key through their merge.
