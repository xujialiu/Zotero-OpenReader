# Live cases and script kits — Zotero-OpenReader

Read before preparing a verification case or full live pass, reviewing a
script-kit diff, or changing checklist structure. `MEMORY/testing.md` owns
the live-run safety and evidence rules. The tester carries its operational
copy in `.agents/zotero-tester-kits.md`; synchronize shared changes.

## Prepare the case before the handoff

`test/zotero-dev/README.md` indexes cases, baseline and cleanup. Each
`cases/<name>.md` owns **one user-facing behavior**, wherever its checks
run. Each item gives its observation/diagnostic, expected output, permitted
state changes, and what only a human can judge (2026-09-01, 2026-09-13).

The main session writes or updates the case **after the fix is built and
before its verification brief** (2026-09-14). Expected outputs come from
the design and build's diagnostics, not a guessed PASS; correct them from
the tester's table afterward. A changed expected output changes in the
same commit. The tester writes scripts, not cases; research creates no
case file.

A verification brief runs the behavior's case plus baseline section 0.
A behavior with no case gets its own file, items numbered from 1, and an
index entry under its group. Split a case covering several behaviors;
preserve each item's number as a `### <section>.<item>` heading so old
reports still resolve. Preserve existing numbers when moving checks.

## Scope a full pass

Run the **whole checklist only on the user's request**: not automatically
after a release, Zotero update or accumulated changes. The first requested
full pass was the 1.10.1 bug hunt on 2026-08-31 (issues #31–#39).

Retain methods incrementally. Reuse preparation methods, not earlier PASS
results: each new full pass checks every case again. On an interrupted
run's return, verify build identity, environment and restored state first;
changed conditions invalidate affected results. A failure/rebuild still
restarts from the first check. Keep per-case baseline and cleanup instead
of sharing unverified temporary state.

`limitations.md` holds human-only checks and coverage gaps; keep them
there rather than adding `manual.md`. Documentation reorganization is not
a reason to rerun live checks or backfill unverified scripts. Backfill old
cases from executed scripts and observations in the next requested full
pass.

## Review the kit the tester leaves

One scripts folder per case: `test/zotero-dev/scripts/<name>/` contains
`README.md` and scripts only, with no per-run, build or issue subfolders
and no second folder beside it. `_shared/` is the exception: the runner
and steps common to kits, moved from successfully executed kit code.

The tester writes the kit as work proceeds, including successful scripts
omitted from the short report. Keep prerequisites, fixtures, expected
outputs, allowed state changes and cleanup with the scripts that actually
ran. Revised scripts replace old revisions; add new checks, drop obsolete
or broken scripts, and keep only successfully run scripts. Distinguish
executed revisions from prepared-but-unrun ones after interruption. A run
that produces reusable scripts for several cases updates each case's kit.
The main session reviews and commits the diff.

The tester writes in the repository only under
`test/zotero-dev/scripts/`; research probes stay under the gitignored
`.tmp/zotero-dev/<topic>/`. It writes no `cases/`, `src/`, `notes/`,
`MEMORY/` or agent files and makes no commits. Keep credentials and raw
preference snapshots out of kits and commits. A new case gets its kit
folder and README on its first verification run.

### README contract

The README is **table first and at most 150 lines** (2026-09-14):

- Script order: script | check | expected measured values | params read.
- Before-starting bullets: build/bridge, fixtures, state touched, cleanup.
- Limits: a failed attempt leaves a line, not a separate file.
- Runs: date, build, issue comment with the table, items PASS/FAIL and
  NOT TESTABLE attempts, and the run each script last executed in.

Cut superseded detail. The next run brings an oversized README under the
cap. The case links its kit; it cites a run only where an expected output
or limit came from that run. Next runs begin with the kit README, not by
loading every script.

### Runner contract and evidence

Zotero executes a kit from disk through
`test/zotero-dev/scripts/_shared/run.js`; its README documents the calls.
The runner starts scripts in the background and returns capped results;
full results live in `.tmp/zotero-dev/<runId>/results/`. Scripts use
`Zotero.ZoteroTTSRun.params` / `.state`, not hard-coded paths or item ids.
Keep common executed steps in `_shared/`, not copied into every kit.

The measured reason matters: on the 2026-09-13 angle-brackets verification,
44 kit files read into the context (50k tokens) before the first bridge
call, 254k characters of scripts retyped as tool input, 58M context tokens
processed in 73 minutes. On 2026-09-14 a 12 s bridge script returned and a
35 s script did not; bare `undefined` also means a throw. The earlier
believed ~8 s window was throws. Operational handling is in the tester's
driving reference, not a reason to reload every kit script.

## Keep reports, not run archives

`test/zotero-dev/runs/` was deleted on 2026-09-14 and remains in earlier
history. A run's record is its table:

- Verification: issue closing comment.
- Research: issue evidence.
- User-requested full pass: that day's NOTES entry.

A failed attempt adds a line to the kit README's limits. The checklist
exists to repeat the behavior; kits exist to lower the next run's cost,
not to archive transcripts.
