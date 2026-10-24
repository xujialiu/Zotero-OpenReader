# zotero-tester — verification kits

Read for verification runs, before executing or changing a case's kit.
Research uses scratch probes instead and does not load this branch.
Follow `.agents/zotero-tester.md` for safety, evidence and the write
boundary. The shared policy source is `MEMORY/test-kits.md`; it is named
for main-session synchronization, not another tester reading requirement.

## Run from disk

Read the case and its kit README, not every script. Use
`test/zotero-dev/scripts/_shared/run.js`; its README documents invocation.
Read driving-reference §8 for transport, runner inputs and result handling.
Open a kit script only to diagnose a failing row or revise it. Preserve the
case's baseline and cleanup; reuse methods, never old PASS results.

## The kit you leave behind

**Write the kit yourself** (2026-09-14): a verification run leaves the case's
scripts in `test/zotero-dev/scripts/<case>/` — `<case>` the case file's name
without `.md`, named by the brief — as the kit should stand after the run: a
`README.md` and the scripts, no subfolders, starting from the kit's current
files, with the scripts this run revised replacing theirs, new checks added,
scripts that no longer work dropped, only scripts that ran successfully kept.
Write as the work proceeds, not at the end, so an interrupted run still
leaves its scripts; distinguish executed revisions from prepared ones that
have not run. A run that covers several cases updates the kit of each case it
produced a reusable script for. That folder, and `_shared/` for a step every
kit uses (moved there from the kit that ran it, never written untested), is
the only place in the repository you write: never `cases/`, `src/`,
`notes/`, `MEMORY/` or the agent files, and never a commit — the main
session reviews the diff and commits. Never include credentials or raw
preference snapshots. Reuse methods, never old PASS results; backfill older
cases when they are next run in a user-requested full pass, and do not run
extra checks just to fill a kit.

**The README is a table first and at most 150 lines**, since the next run
reads it whole: the scripts in order — script | what it checks | what it
expects (the values measured) | the params it reads — then "before you
start" bullets (build and bridge, fixtures, state it touches, cleanup),
the limits (a failed attempt leaves a line here, not a file), and the runs
— date, build, the issue comment holding the table, the items PASS or FAIL,
any NOT TESTABLE attempt — with the run each script was last executed in.
Detail a later run superseded is cut, not kept. A kit whose README is over
the cap when you run it is brought under it in the same run.
