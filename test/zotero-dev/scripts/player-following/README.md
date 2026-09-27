# Player following verification evidence

[Case](../../cases/player-following.md) · [Checklist index](../../README.md)

The current acceptance criteria are issue #153's persistent manual follow.
The older `107-*` and `117-*` scripts in this directory are historical and
contain superseded recovery expectations. They are not a current runnable
acceptance kit. Do not use their old hard-coded identities or restoration
values for a new run.

## September 27, 2026: issue #153

Tested implementation: `c6e99a9`, `1.16.1-beta`; XPI SHA prefix `221876b4`,
embedded bundle SHA prefix `c2e00f6c`. The unit suite passed 2,755 tests,
typecheck and build. No production code changed during live verification.

| Area | Accepted evidence | Limit |
| --- | --- | --- |
| Startup | No failed startup steps; expected bundle symbols present | Version alone was not the identity check |
| A/M | Player and follow diagnostics agreed in PDF and both EPUB flows; M survived later reading, pause/resume and Player reopen | Smooth visual following was not established in PDF/scrolled EPUB |
| Defaults | Default off produced new-tab M, default on new-tab A; existing choices stayed unchanged | Live settings-sync round-trip was not run; serialization has unit coverage |
| Keys and UI | Shift+Enter/R/M/A routing, skips, custom return, editable guard, checkbox and wrapped label observed | First scripts returned unconditional PASS; the report relies on individual recorded observations |
| Actual positioning | Paginated native flow offset moved 0 to 53995, then Shift+R returned to 0 | PDF and scrolled EPUB controls are bounded below |
| Current-state cleanup | Fresh private typed baseline restored exactly; fixture readers/items absent, position rows 85, transports idle, host minimized | This does not restore or prove the original pre-incident state |

The final controls started PDF at scrollTop 2129 and scrolled EPUB at
scrollY 6984. Native positional scrolling reached 0 in both. Native smooth
scrolling stayed at those starting offsets after 1.2 seconds; plugin
Shift+R also stayed there while recording a return request. Subsequent M
segment changes kept the viewport stable. Therefore physical PDF/scrolled
EPUB return remains NOT TESTABLE in this environment; paginated return was
observed. Neither target diagnostics nor unchanged offsets alone prove a
successful visible return.

## Isolation incident and unresolved restoration

The first fixture import ran with Zotero core auto-sync enabled. Disposable
fixture metadata reached the owner API/test WebDAV; the tester subsequently
acknowledged deletes and found no fixture items, cache rows or deletion logs.
The original baseline retained summaries instead of private raw values.
The first cleanup reconstructed voice memory/native voice values and used
an unrelated earlier value for the owner WebDAV URL. Exact original-state
restoration cannot be established. The September 22 profile backup was
excluded because it differs from the known September 27 state.

The test did not directly write WebDAV username/password or machine ID.
It did change the URL and voices; syncState changed during the run. Core
auto-sync was observed enabled without a user value when the incident was
discovered, but was not captured before the run. It remains disabled with
a user value. Plugin sync switches remain off. The owner paused Player was
closed for testing and was intentionally not reopened.

Later probes took exact private CURRENT-state snapshots, kept core/plugin
sync off, and restored those snapshots exactly. This is evidence of safe
later cleanup, not recovery of missing original values. The original-state
uncertainty and decision about re-enabling sync are still open with the owner.

## Scripts and next run

The proposed replacement `153-*` kit was rewritten after the first pass but
never rerun as a kit. It is not published here as verified reusable code.
Unverified drafts are retained in the worktree's ignored
`.tmp/zotero-dev/player-following-153-unverified/`; executed control probes
are `.tmp/zotero-dev/current-position-{setup,check,finalize}.js`.
They are diagnostic artifacts, not a safe reusable setup/cleanup contract.
A future driver must capture exact typed private state and validate isolation
before importing fixtures, restore only its own fixture records, and retain
the final scripts that actually pass. Never infer secret equality from length
or restore values from another session's globals.

## Historical runs (superseded behavior)

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-09-16 / 1.12.12-beta | Full manual-follow baseline through cleanup; all scripts ran, with the single PDF/outside later-visible finding above | `2026-09-16-1.12.12-beta-player-following-full` |
| 2026-09-16 / 1.12.12-beta | Three fixture kinds, A/top/B layouts, pause retention, explicit M/A, stale old pref, two-reader isolation and close/reopen; all checks PASS | `2026-09-16-1.12.12-beta-player-following-ui4` |
| 2026-09-16 / 1.12.12-beta | Trusted Shift+Enter, previous/next sentence and previous/next paragraph in PDF, scrolled EPUB and paginated EPUB; all expectations PASS | `2026-09-16-1.12.12-beta-player-following-shortcuts2` |
| 2026-09-16 / 1.12.12-beta | Direct-versus-trusted return comparison and real play-button resume; all expectations PASS | `2026-09-16-1.12.12-beta-player-following-return-compare2` |
| 2026-09-17 / 1.12.12-beta | Narrow PDF boundary diagnostic with selected/visible preconditions and assertion; fixed and gated resume plus later-visible reentry PASS | `2026-09-17-1.12.12-beta-player-following-boundary2` |
