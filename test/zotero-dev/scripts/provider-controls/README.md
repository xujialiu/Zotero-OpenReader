# Scripts: A provider section: locked fields, Test connection and Enable

[Case](../../cases/provider-controls.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Items 1.3 (locked sections), 1.6.1 and 1.6.2 (issues #214) of the
checklist. The kit drives the **OpenAI Compatible** section against a
local, credential-free stub, and owns its own cleanup.

## The stub — `stub-server.cjs` (this folder, committed)

Local OpenAI-compatible server; loopback only; stores counters only — it
never reads or logs Authorization headers, request bodies, or URLs.

- Launch: `node stub-server.cjs <port>` (default 8931; keep it off
  privileged ports). Stop: `POST /control/stop`, or SIGTERM.
- `GET /v1/models` → one model; `GET /v1/audio/voices` → one voice;
  `POST /v1/audio/speech` → **held** until released (30 s self-fault 504).
- `POST /control/release?mode=pass|fail` finishes every held reply;
  `POST /control/reset` settles held replies (as fail) THEN zeroes the
  counters — a pending check never hangs on a dropped connection;
  `GET /control/state` → `{held, speechTotal, released}` (counts only).

## Scripts

Run in this order through `_shared/run.js` (`kit: 'provider-controls'`),
`params: { stubBase, altBase }` — both **must be loopback** (every script
refuses otherwise); `altBase` (`http://127.0.0.1:8932`) has nothing
listening and is never fetched, only written to the pref for the stale
tests.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-baseline-and-stub.js` | Requires WebDAV folder off. Opens the pane fresh, snapshots the WHOLE Compatible section — actual values including secrets, kept only inside `state.pc` — refusing to overwrite an unfinished snapshot; turns Compatible off through its button (throws on any guard dialog); points it at `stubBase`, empty key/headers/model | `snapshotRecorded`, `disabledForTest`, `fieldFollowsPref` (lengths/flags only in the result) | `stubBase`, `altBase` |
| `01-enable-held-lock.js` | 1.6.1: Enable held — buttons, every input and both secret eyes disabled; a disabled provider stays editable; an `api-key` notification must not unlock; release pass → enabled, success line, fields stay locked | `allHeldLocked`, `controlStayedEditable`, `notifyDidNotUnlock`, `finalEnabledPref`, `lineIsSuccess`, `finalStillLocked` all true | `stubBase` |
| `02-test-held-unlocks.js` | 1.6.1: Test connection on the disabled section — locked while held; released pass → unlocked, switch off, success line stays | `heldAllLocked`, `finalAllUnlocked`, `lineIsSuccess`, `switchStayedOff` all true | `stubBase` |
| `03-enable-failed-release.js` | 1.6.1: Enable with a failing reply (HTTP 500) — switch off, failure line visible, everything unlocked | `switchStayedOff`, `failureVisible`, `allUnlocked` all true | `stubBase` |
| `04-stale-enable.js` | 1.6.2: Enable held, `altBase` written to the pref while held, pass released — stale rejection | `stillLockedAfterWrite`, `lineIsStaleMessage` (`Settings changed during the check. Check again.`), `changedURLRetained`, `stayedOff`, `unlockedAfter` all true | `stubBase`, `altBase` |
| `05-stale-test-then-fresh.js` | 1.6.2: the same via Test connection — no stale success, switch unmoved; fresh test of the restored address passes | `noStaleSuccess`, `staleIsCheckAgain`, `switchUnchanged`, `freshPassed`, `baseURLRestoredToStub` all true | `stubBase`, `altBase` |
| `06-close-window-pending.js` | 1.6.2: Settings closed while Enable is pending, reply released — no late enable, no new plugin error; reopened pane shows the prefs | `noLateEnable`, `reopenedReflectsPrefs` true; `newPluginErrors: 0` | `stubBase` |
| `99-cleanup-restore.js` | Kit cleanup: settles any held reply (as fail), closes Settings BEFORE the restore, restores all six prefs (value AND user-value presence), verifies equality, and discards the snapshot's secret values only after verification | `settledHeld` ≥ 0; every field `valueEqual`+`presenceEqual`; `allVerified`, `snapshotDiscarded` true | — |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list`,
  `diagnostics.startup()` all ok; prove the build by the bundle's SHA-256,
  not the version string.
- **WebDAV owner: the run-level isolation step, never a kit script.**
  Snapshot `zotero-tts.webdav.enabled` (value + user-value flag)
  privately, settle pending work, confirm `diagnostics.positionSync()`
  `folder: false` before and after any install, and put the snapshot back
  — value and user-value presence — at the end, last. `00` asserts
  folder-off before mutating; `99` never touches WebDAV.
- Launch the stub (contract above); a held reply must be released inside
  the client's 15 s check timeout — the scripts hold ~0.1 s and release
  in-script, via chrome-side `fetch` to `/control/*`.
- Cleanup: run `99` even after a failure (it settles, closes Settings
  first, restores, verifies, then discards secrets). An interrupted run
  leaves `state.pc` unfinished — the next `00` refuses to overwrite it
  until `99` has restored and cleared it. No readers may be open (00
  throws otherwise); this kit never exercises the reading guard.
- Secret values never cross the script boundary: the report carries
  lengths and user-value flags only.

## Limits

- The held point is the synthesis probe: models and voices answer at
  once, so the section locks ~0.1 s after the click.
- Success line with an empty Model field: `Connected. 1 voices available.
  Synthesis works.`; a failing synthesis surfaces the server reason after
  the status (`serverReason`, issue #198's shape).
- The loopback guard in 01–06 was added after their 2026-10-20 first-pass
  execution; 00, 03 and 99 have executed in the safety-revision form.
  `test/live-kit-guards.test.ts` runs the five later guard additions
  without Zotero: 22 allowed/rejected-address checks pass before live
  access. Those guards have local, not repeated live, verification.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-20 (follow-up) | 1.16.13-beta (SHA-256 fed53c1d…a63), Zotero 11.0-beta.1+b551fb670 | [Verification and kit follow-up](https://github.com/xujialiu/Zotero-OpenReader/issues/214#issuecomment-6288334322) | 00 revised PASS (412 ms; nonempty synthetic credential snapshotted privately, overwrite refused on re-run), 03 revised PASS (217 ms; poll fixed — v1 ran 12.7 s), 99 PASS (542 ms; settled 1 held reply from an abandoned Enable, closed Settings first, all six fields value+presence equal incl. the nonempty key, snapshot discarded) | 01/02/04/05/06 executed only in their pre-guard form; guard additions verified by 22 local tests, not re-executed live |
| 2026-10-20 | 1.16.13-beta (SHA-256 fed53c1d…a63), Zotero 11.0-beta.1+b551fb670 | [Verification](https://github.com/xujialiu/Zotero-OpenReader/issues/214#issuecomment-6288334322) | 1.6.1 PASS, 1.6.2 PASS (7 scripts) | 03's v1 poll defect fixed the same day |
