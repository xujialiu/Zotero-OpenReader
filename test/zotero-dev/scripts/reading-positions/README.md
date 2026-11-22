# Scripts: Reading positions

[Case](../../cases/reading-positions.md) · [Checklist index](../../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

| Script | What it checks | What it expects | Params read | Last run |
| --- | --- | --- | --- | --- |
| `00-baseline-and-seed-upgrade.js` | Baseline 0 and #22 setup: isolates WebDAV, snapshots named prefs and all position tables, imports one fixture, writes conflicting retired-pref and SQLite positions | WebDAV folder false and transports settled; fixture row added exactly once; no secrets or row values in output | `fixtureTitle` | `…reading-position-upgrade` |
| *(bridge)* | `zotero_plugin_install` with the brief's immutable XPI, followed by `zotero_plugin_list` and immediate `diagnostics.startup()` | `1.18.0-beta`; SHA-256 `99c53992582ae6b21e221119635cfbd202edaa175238b8a5ba2e15b9fd7788a8`; all startup steps `ok`, `failed: []`, no split step | XPI path | 2026-11-22 |
| `01-verify-upgrade-preservation.js` | #22: the same SQLite row and legacy pref survive; store startup and WebDAV diagnostics | Exact row bytes and timestamp; baseline tables plus one fixture row; store `open`; no legacy import diagnostic | state from `00` | `…reading-position-verify` |
| `90-remove-fixture-and-restore-rows.js` | Erases only the imported fixture, restores all four SQLite tables and the retired pref snapshot | Fixture absent; every table matches its baseline snapshot; WebDAV stays off for the in-memory store refresh | state from `00` | `…reading-position-cleanup` |
| *(bridge)* | Reinstall the identical XPI to reload the restored position tables, then list and immediately run startup diagnostics | Same XPI hash/version; all startup steps `ok`; baseline tombstones loaded | XPI path | 2026-11-22 |
| `99-final-restore.js` | Restores WebDAV, volume and debug-store state; audits prefs, rows, tabs and window | Original values and user-value flags; rows/tombstones at baseline; fixture absent; window minimized | state from `00` and `openai-split/00` | `…position-final-audit` |

## Before you start

- Use the READY disposable session and call every bridge tool through `node scripts/test-zotero.mjs call <session> <tool> [args.json]`.
- This kit's baseline script runs before `openai-split/00-seed-upgrade-legacy-prefs.js`; retain `Zotero.ZoteroTTSRun.state` between runs.
- Fixture: `fixture-a.pdf`, imported as a standalone attachment. No reader, provider, playback or native dialog is opened.
- Cleanup restores the original four-table snapshot and removes any test tombstone. The same-XPI reinstall clears in-memory store state before the final audit.

## Limits

- A failed attempt is recorded here, not kept as a reusable script. The separate unit-only checks are settings-file restore and shared-settings merge.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-11-22 | 1.18.0-beta; Zotero 10.0.9 | main-session report | 5.1 UPGRADE PASS | Previous 1.17.3-beta3 XPI `2094089c…`; candidate `99c53992…`; 1 SQLite row and the conflicting legacy pref survived exactly. Cleanup restored all four tables and removed the fixture/tombstone. 14 plugin lifecycle lines, zero dead-object lines; Zotero's error list had 4 expected install exceptions, 14 locale-resource notices and 2 React DOM attribute-sanitization warnings during erase. |
