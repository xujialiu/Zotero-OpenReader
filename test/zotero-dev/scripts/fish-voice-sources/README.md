# Scripts: 1b. Fish Audio voice sources (issue #91)

[Case](../../cases/fish-voice-sources.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Items 1–9 of the case were verified live on 2026-09-12
(1.12.2-beta2; the run's notes hold the table). Item 10 (issue #216) has
its own script, added 2026-10-20.

## Scripts

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `10-manual-ids-restricted.js` | Item 10 (issue #216): Fish off + Manual voices off keeps Model IDs disabled through Test connection, a failed Enable (empty key → local no-key failure, no request) and an account-only notification; Manual on permits edits only while the section is unlocked; the saved text is retained when the switch goes off. Safety: requires WebDAV folder off, reuses (never overwrites) an unfinished snapshot, runs every mutation in try/finally, closes Settings BEFORE the pref restore, verifies value AND user-value presence, discards the privately stored key only after verified cleanup | `idsDisabledBefore: true`; `testFailedLocally` / `enableFailedLocally: true` (line `No API key set for this provider.`), `enableLeftOff: true`; after each failure `after*OrdinaryEditable: true` and `after*IdsStillDisabled: true`; `afterNotifyIdsStillDisabled: true`; `idsEditableWhenManualOn: true`, `prefTookProbe: true`; `idsDisabledWhenManualOff: true`, `fieldRetainedProbe` / `prefRetainedProbe: true`; `settingsClosedBeforeRestore: true`; `allRestored: true`, `restoredKeyLen` = snapshot length | — |

## Before you start

- WebDAV owner: the run-level isolation step (snapshot privately, confirm
  `diagnostics.positionSync()` `folder: false` before mutations, restore
  value + user-value presence last). The script asserts folder-off before
  mutating and never touches WebDAV itself.
- The script opens the pane fresh (closes any open settings window first)
  and needs NO working Fish key: the empty key makes both checks fail
  locally (`missingKey()` throws before any request — a paid probe is
  never sent). Fish's own switch is turned off through its button; a guard
  dialog aborts the script (no readers may be open); the try/finally
  restore runs anyway.
- Snapshot: `fish.enabled/apiKey/voices/includeManual` — the key's VALUE
  is stored only in `Zotero.ZoteroTTSRun.state` (inside Zotero) and the
  report carries its length and user-value flag. Restore honors
  user-value presence (`clearUserPref` where there was none); `enabled`
  is restored by a pref write so no check (and no paid request) runs on
  restore. An interrupted run leaves an unfinished snapshot, which the
  next attempt reuses instead of overwriting; the key value is discarded
  from state only after verified cleanup.

## Limits

- The retention probe writes a harmless placeholder
  (`manual-retention-probe-123`) through the field while editable and
  restores the original text afterwards; the placeholder is the retention
  subject, not the owner's saved text.
- Items 1–9 need a working key and their own fixture; see the case.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-20 (follow-up) | 1.16.13-beta (SHA-256 fed53c1d…a63), Zotero 11.0-beta.1+b551fb670 | [Verification and kit follow-up](https://github.com/xujialiu/Zotero-OpenReader/issues/216#issuecomment-6288335087) | 10 revised PASS (2.6 s; same expectations, now with folder:false assert, try/finally restore, Settings closed before restore, value+presence verification, key discarded after verified cleanup) | first run clean in revised form |
| 2026-10-20 | 1.16.13-beta (SHA-256 fed53c1d…a63), Zotero 11.0-beta.1+b551fb670 | [Verification](https://github.com/xujialiu/Zotero-OpenReader/issues/216#issuecomment-6288335087) | 10 PASS (every expectation above true; key restored to len 51 with its user value; enabled restored true by pref write) | first run clean; profile had fish on (real key), manual off, one saved Model ID link |
| 2026-09-12 | 1.12.2-beta2 | issue #91 closing comment | 1–8 PASS, 9 restored | full-table run predates item 10 |
