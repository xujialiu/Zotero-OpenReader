# Scripts: Text cleaning (issue #240)

[Case](../../cases/text-cleaning.md) · [Runner](../_shared/README.md)

| Script | Check | Observed / required result | Inputs |
| --- | --- | --- | --- |
| `00-baseline-and-guards.js` | Retained/fresh baseline, encrypted originals, WebDAV and Zotero auto-sync gates, metered API and HTTP guards | Main continuation resumed its original baseline with both gates off; completed-run retry rejected without changing networking. Fresh capture branch was not independently repeated after cleanup. | `root`, `tmpDir`, optional `resumeMain` (normally false) |
| `01-system-ipc-tap.js` | Windows helper's actual framed stdin, via Gecko's mutable subprocess test implementation | Real `op:speak` frames captured before writing; public `Subprocess.call` is frozen and cannot be patched. Existing tap resumed in this continuation. | state from 00 |
| `02-direct-transport.js` | Shared native forwarding under a preinstalled API stub; real System request text; cache / forget / original offsets | Two uncached synthetic native ids: `中 文` → `中文`, marker/source metadata preserved, real route returns mapped `[0,3)`. System IPC exactly `这是中文。`, `中文，测试。`, `BNN 结构，第 3 章。`. Cache shares one synthesis across original spacing; forget adds one fresh synthesis. | ready inactive reader context; no matching document rows |
| `03-fixture.js` | Offline EPUB, free Huihui document voice, foreground reader and activation | Six actual Segments; only this fixture is played. This continuation reused its already imported fixture. Cold catalog readiness can require retrying this idempotent step before playback. | `root`; state |
| `04-moving-highlight.js` | Real audio-clock advance and rendered DOM word ranges | Six changing ranges across three Segments, every rendered text equal to the original substring, each with one rect; AudioContext running; original Segments unchanged. | fixture |
| `05-edit-comparison.js` | Stable paused/playing edits, no-op, resume handoff, empty identity | No-op/removal `none`, zero synthesis; paused and playing changes hand off and commit at the next sentence; held changed text `甲 乙。`; empty whole Segment gives held `""` with zero System requests. Waits for the current clip to actually start. | fixture |
| `90-teardown.js` | Scoped erase, four local tables, exact named prefs/user flags and document maps | Fixture absent; all unrelated table bytes equal baseline; rows 75; preferences/maps restored; networking stays off. Reload maps before 99. | retained original baseline |
| `99-final-restore.js` | Post-reinstall startup/maps/tabs/errors, restore wrappers and original networking | 31 startup steps, no failed/new plugin error; 21 named documents / 12 shared items after old residue removal; rows 75; original tabs, selection, volume/debug and sync flags restored, minimized. | 90 receipt + in-place reinstall |
| `100-post-restore-audit.js` | Read-only settle after original networking resumes | All four normal transports quiet; no fixture preferences/item; folder restored true. Also executed through `runner.api.one`. | 99 receipt |

## Before starting

- Read the case and baseline 0. Use the shared disk runner; scripts read its
  `params` and `state`. Windows `IOUtils` needs native paths; the runner
  normalizes `root`/`tmpDir`. Never paste a private snapshot into a result.
- An ordinary new run passes `resumeMain:false`. `resumeMain:true` is only
  for a main-session continuation whose original encrypted baseline and
  active guards still exist; a completed/unguarded run is refused.
- Require idle user readings and a ready inactive reader for API-only
  synthetic requests. No user's text or position is used for playback.
  Open/play only `test/fixtures/text-cleaning/text-cleaning.epub`.
- Keep **both** the plugin WebDAV folder and Zotero `sync.autoSync` off
  through fixture deletion, preference restoration and the final reinstall.
  The plugin folder alone does not prevent Zotero attachment uploads.
- Put the API stub **before** any native request. Do not enable/select a
  real Zotero tier for this text-preparation check. Synthetic native ids
  exercise the common forwarding route, not tier/catalog availability.
- Run 00/01, install the brief's xpi in place, verify plugin list/startup,
  then 02–05. Run 90, reinstall the same xpi to discard fixture memory,
  verify startup again, then 99/100. Never use disable/enable as reinstall.
- `03` must have its listed System voice and actual Segments before 04/05.
  For audio-clock checks restore/focus the fixture, refresh document user
  activation after catalog readiness, then minimize again. Keep volume 0.
- Use `Zotero.Prefs.set` for new Unicode JSON. `setCharPref` truncates new
  non-Latin-1 text; it is used only to round-trip raw original byte views.
- Private baselines are UTF-8/base64 encoded before SDR encryption; verify
  decryption before saving. Backups depend on this Zotero profile's key.
  The authorized incident backups were also copied outside the worktree.
- Inspect every measured flag, not just successful bridge transport. On a
  failed gate keep networking off, preserve originals and report the gap.

## Limits and retained incidents

- Subjective fluency and whether motion feels comfortable remain human
  judgments. Clock/range correctness was measured, not inferred from a
  screenshot or silently promoted into a listening verdict.
- The first tester run timed out. Its late native stub allowed four real
  synthesis requests; output blocking happens **after** fetch. Its cleanup
  also uploaded fixture residue. Those unsafe/unexecuted revisions are not
  retained here; the incident and authorized recovery are in the notes.
- Main verification captured the actual helper stdin, not just held speech
  or debug character counts. Debug counts use the original Segment length.
- Paused-edit evidence must start from a fetched, already-started clip.
  Foreground activation and a bounded readiness check resolved an earlier
  inconclusive last-edit observation. Inflight clips remain conservative.
- One-off normal-server repair is **not** part of this repeatable feature
  kit. It used encrypted backups, exclusive WebDAV locks, exact fixture
  identities and before/after unrelated-data comparisons under explicit
  authorization. Never replace a remote file from a local merge blindly.

## Run

2026-11-06, main-session continuation explicitly requested by the user,
`1.17.1-beta6`, production commit `57c70cf`, bundle SHA-256
`3b5b0c570f10292d2d50c115ea9ca32755335dca1cb3ecc1f4b2e60584fc1e14`.
The two native stub routes, three actual System texts, original-coordinate
cache sharing, forget, six moving highlight ranges and paused/playing edits
passed; no new metered request. Cleanup restored exact local originals,
removed both fixture identities, reloaded memory and restored networking;
a post-resume audit found no fixture in any of the four remote files and
both Zotero cloud attachment lookups returned 404. Evidence is under
`.tmp/240-main/` plus the final runner `one` receipt. The closing table is
on [issue #240](https://github.com/xujialiu/Zotero-OpenReader/issues/240).
