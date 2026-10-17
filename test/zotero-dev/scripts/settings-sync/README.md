# Scripts: Settings sync over WebDAV (issue #68, 1.11.7)

[Case](../../cases/settings-sync.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | What it expects | Params / state it reads |
| --- | --- | --- | --- |
| `00-isolate-and-baseline.js` | "Test WebDAV first" opener, before the build is installed: typed snapshot of `webdav.*`, `fishspeech.*`, `azure.*`, `readAloud.volume`, transports settled, `webdav.url` → `~/.secrets/Zotero-TTS/test_webdav.txt` (match results only), shared file's baseline text kept in state, real Azure key kept in state, volume muted, errors/host recorded | `destinationMatched`, `effectiveDestinationMatched`, `transportsSettledBefore` all true; after the switch-on sync `lastOutcome "ok"`, `heldSections` per this machine's addresses; file baseline `existed` with its item list | writes `state.isolate`, `state.fileBaselineText`, `state.realAzureKey` |
| `00b-post-install-and-build-proof.js` | After the in-place install: isolation re-asserted (an upgrade may move switches), transports settled, and the build proved by its mechanism — Fish Speech at the default Address held (issue #184) | switches still test-url/suspended/switch-on; `heldSectionsAtDefaultAddress` contains `"fishspeech"`; the address change's own sync `pushed 0`, `uploaded false` | `state.isolate`, writes `state.buildProof` |
| `10-item-6.22-craft-and-trigger.js` | Item 6.22, first half: writes `held.fishspeech` + a `held.zotero-standard` witness into `webdav.syncState`, crafts `fishspeech.baseURL`/`fishspeech.enabled` at `Date.now()+1000` by "tester", fires a switch-on trigger | trigger `adopted 0`, `deferred 0`, `pushed 0`, `uploaded false`; the prefs keep the default Address / false; `lastApplied` unchanged; after the trigger `held.fishspeech` gone, the witness kept | `state.isolate`, writes `state.item622` |
| `11-item-6.22-headers-push.js` | Item 6.22, second half: local `fishspeech.headers` change is stamped but never travels; then the Fish Speech prefs are restored and the crafted items removed | stamp ≥ the change; the change sync `pushed 0`, `uploaded false`; no `fishspeech.*` item of this machine's at/after the stamp; the test value absent from the file; prefs back to snapshot; crafted items gone; the restores' sync settled | `state.item622`, `state.isolate` |
| `20-item-6.25-faster-clock.js` | Item 6.25: crafts `readAloud.volume` 120 at `Date.now()+60000` by "tester", triggers the adoption, then sets 80 within the minute | clean trigger `adopted 0`; adoption `adopted 1`, stamp = crafted ts, pref 120; after 80 the stamp = crafted ts + 1; the change sync `adopted 0`, `pushed 1`; pref stays 80; `sharedSettings()` shows 80 at crafted ts + 1 by this machine | writes `state.item625` |
| `30-item-6.26-preset-values-masked.js` | Item 6.26: crafts legacy `openai.presetValues` (JSON object with the made-up key) and `openai.apiKey` in the file, calls `sharedSettings()`, removes them; no trigger in between | both items listed as `<N chars>`; the made-up key absent from the whole output; file clean again | — |
| `90-restore-and-final.js` | Cleanup, last: local prefs restored (read-back each), the restores' syncs settled, the shared file back to its baseline text (byte-identical), `webdav.syncState` byte-exact, then the owner's WebDAV configuration and the suspended switches, effective destination match, settled on the original, debug store back, error ring delta, host minimized | every `ok` true; `fileRestored.byteIdentical`; `syncStateRestored.byteIdentical`; `effectiveDestinationMatchesOriginal`; `allRestored` true | `state.isolate`, `state.fileBaselineText` |

## Before you start

- Bridge up (`zotero_ping`), build under test installed only **after** `00`
  has run — it settles the previous build's transports first. `runId`
  `<date>-<build>-settings-sync`; the provider-check kit runs inside the same
  state (its own `runId`) and this kit's `90` cleans up for both.
- The dedicated test WebDAV configuration in `~/.secrets/Zotero-TTS/
  test_webdav.txt` (one URL line; credentials never printed — secrets are
  masked to lengths in every result, full values live only in runner state).
- The switch under test `webdav.syncSettings` is ON for the items;
  `webdav.syncPositions` and `webdav.autoUploadSettings` are suspended until
  `90` restores them last.
- No active Read Aloud session anywhere (an open session defers the
  provider-section items). The opener mutes `readAloud.volume` to 0; item
  6.25 legitimately raises it (120 → 80) and only `90` restores it.
- Item 6.22 runs with `fishspeech.baseURL` at its default
  `http://localhost:8080` — on a profile whose real Address is public (this
  one), `00b` sets it and `90` restores it; `heldSections` then reads
  `["fishspeech"]` alone (this profile's `local`/`compatible` addresses are
  public, so those sections are not address-held here).
- Triggers are the sync switch toggled off→on in-script (a `switch-on` poke);
  no fixtures, no reader opens. Quiet periods are 10 s — the scripts wait
  them out, so `11`/`20` belong in a runner group; `one()` only for the
  scripts that finish well under the bridge's 30 s (`00b`, `10`, `30`, `90`).

## Limits

- `00` throws and stops the run when the test configuration is unavailable,
  the destination does not take effect, or the transports never settle: no
  fallback to the owner's WebDAV.
- The crafted legacy items of 6.26 must not see a sync (one would derive
  `openai-official.*` from them): `30` crafts, reads and removes them in one
  script with the transport quiet.
- 11 and 20 were executed 2026-10-18 with the machine id hard-coded and were
  converted afterwards to read it from `diagnostics.settingsSync()` — that
  conversion has not been re-executed.

## Runs

| Run | Build | Items | Result |
| --- | --- | --- | --- |
| 2026-10-18 | 1.16.12-beta2 (issues #184, #205, #203) | opener, build proof, 6.22 (both halves), 6.25, 6.26, cleanup — table on the closing comments of #184, #192, #193, #205 and #203 | all PASS |
