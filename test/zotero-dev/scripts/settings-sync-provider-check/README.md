# Scripts: A synced provider that fails its check goes off here only (issue #68, 1.11.7)

[Case](../../cases/settings-sync-provider-check.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Runs on the setup of [settings sync](../settings-sync/README.md): the same
test WebDAV folder, shared file, `webdav.syncState` handling and crafted
items; that kit's `90-restore-and-final.js` is this kit's cleanup too.

| Script | What it checks | What it expects | Params / state it reads |
| --- | --- | --- | --- |
| `40-item-6.23-hold-azure.js` | Item 3.20's hold (the setup for 6.23): Azure enabled here first if the profile has it off (a pref write — no check), its change sync gives the file `azure.enabled: true` at the machine's stamp (the resting state); then `azure.apiKey: "not-a-key"` crafted at `Date.now()+1000` by "tester" and a switch-on trigger | resting state true; the trigger `adopted 1`, `pushed 0`, `uploaded false`, `applied ["azure.apiKey","azure.enabled"]`; the pref `azure.enabled` false; `state.held.azure.reason` the 401 wording; the stamp = the file item's ts; `sharedSettings()` still `azure.enabled: true` | `state.realAzureKey` (settings-sync opener), writes `state.item623` |
| `41-item-6.23-enable-ends-hold.js` | Item 6.23: the real key back into the local pref (stamps newer than the crafted item) without a trigger; Settings → OpenReader opened (pane-open poke), the line read during the hold, **Enable** pressed, polled in the same script | line names "Azure stays off on this computer: Connection failed: …" (no raw id); the check passes ("Connected. …"); `azure.enabled` true; `webdav.syncState.held` has no `azure` at once; after the quiet period the change sync is `ok`, `adopted 0`, `pushed 1`, azure gone from `transport.held`, and the line no longer names Azure; window closed | `state.realAzureKey`, writes `state.item623Enable` |
| `50-item-6.24-held-line-names.js` | Item 6.24: keeps `webdav.syncState` first, writes held records `openai-official`, `compatible`, `zotero-premium` (`{ ts: Date.now(), reason: "tester" }`), opens the pane, reads the Sync group's settings line, restores the kept state byte-exact | the line names them "OpenAI stays off on this computer: tester", "OpenAI Compatible stays off …", "Zotero Premium stays off …" and contains none of the three ids; the restore read back byte-identical | writes `state.item624` |

## Before you start

- The settings-sync kit's opener (`00`) must have run this session: the real
  Azure key lives only in `state.realAzureKey` — the hold's adoption
  overwrites the local pref and it cannot be read back afterwards.
- No player may be open anywhere: a paused player defers the provider items
  (the reading guard) and the item's numbers do not come out.
- Azure's check is the only provider request of this kit: at most three per
  run (3.20's failing one, 3.20's passing one if run, 6.23's Enable). The
  2026-10-18 run spent two: the hold's failure and the Enable's pass.
- If the profile has `azure.enabled` false (this one had), `40` turns it on
  with a pref write first — no check, and the file item it pushes gives the
  recipe's resting state (file `azure.enabled: true` at the machine's stamp).
- `41` and `50` drive the settings window: no other `zotero:pref` window may
  be open (both close what they open; a window the owner left open must be
  closed first, per the driving notes §1).

## Limits

- `41`'s `paneOpenSync` poll waits for `lastTrigger "pane-open"`, but the
  real-key write's `change` sync and the poke coalesce in the single-flight
  and the pane-open sync often completes before the first poll: the captured
  `waited: false` with a later `change` sync is expected and not an
  assertion. The real key's having travelled is proved by the post-Enable
  sync pushing exactly one key (`azure.enabled`).
- The `held.zotero-standard` witness the settings-sync kit's item 6.22
  plants stays in `webdav.syncState` until that kit's `90` restores it: during
  `41` the line and `transport.held` legitimately also show "Zotero Standard
  …: tester". The item's own assertion is that `azure` is gone.
- The line joins its sentences with single spaces without adding periods
  (measured 2026-10-18), so the case's "… tester. …" punctuation is prose.

## Runs

| Run | Build | Items | Result |
| --- | --- | --- | --- |
| 2026-10-18 | 1.16.12-beta2 (issues #192, #193) | 3.20 hold, 6.23, 6.24 — table on the closing comments of #184, #192, #193, #205 and #203 | all PASS |
