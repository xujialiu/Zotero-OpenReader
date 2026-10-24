# Git workflow — Zotero-OpenReader

The main session owns Git housekeeping and releases. Read
`MEMORY/MEMORY.md` for commit/push authorization, including the standing
pre-tester commit exception. Work only within the user's authorized scope.

## Prepare a commit

- **Branch scope:** simple docs, wording and one-line work goes directly
  on `main`; hard bug fixes/features use `fix/...` / `feat/...`, merged
  into `main` with `--ff-only` when told.
- **Message:** short `feat: …`, `fix: …`, `docs: …` or `chore: …` subject,
  usually with no body; add a line or two only when the why is unclear.
  English and American spelling; no `Co-Authored-By` trailer.
- **Staging:** review every file's diff before staging. Include only the
  brief's files and hunks; report unrelated work and leave it untouched.
  For mixed hunks, keep the relevant hunks in a patch and apply it with
  `git apply --cached`. Use explicit paths, never `git add -A`,
  `git add .` or `commit -a`.
- **Windows:** Git Bash uses `$HOME/Works/...` paths. Heredocs have failed;
  pass commit paragraphs through separate `-m` arguments.

## Push safely

1. `git fetch --prune`, then inspect `git status -sb`. Push only when
   ahead and not behind.
2. Scan the history being pushed for keys. For the usual main range,
   inspect `git log -p origin/main..main` for
   `sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|\b[0-9a-f]{32}\b`.
   Suppress matched text before it reaches output. Any hit stops the
   push; report its commit and file, never the key.
3. Push only within the authorized scope. Never force-push.

## Merge and finish a worktree

Merges into `main` use `git merge --ff-only`. When the user says "merge"
or "finish worktree" and `main` moved on, bring the branch to current
`origin/main` without another permission round (2026-10-18, issue #187):

- Never-pushed branch: `git rebase origin/main`.
- Pushed branch: `git merge origin/main`; preserve its published history.
- Resolve textual conflicts so both sides survive. A product conflict
  where one purpose undoes the other goes to the user.
- Rerun `npm test`, `npm run typecheck`, `npm run build` after resolution;
  only then fast-forward `main`. Report every conflict and resolution.
- After pushing a rebase, add new hashes in a one-line comment to closed
  issues whose closing comments named the replaced hashes.

**"finish worktree"** authorizes **commit, merge and push** (commit added
2026-10-24, issue #229; merge/push settled 2026-10-18). Complete it in order:

1. Review the current task's diff, stage only its files/hunks and commit
   any uncommitted task work. Keep unrelated uncommitted changes intact,
   exclude them from the commit and report them.
2. Verify the committed tree against its `MEMORY/testing.md` requirements.
   `npm test`, `npm run typecheck` and `npm run build` must be green on
   the final integration tree, including for documentation work. Unrelated
   local edits are not verification input; use a clean checkout if needed.
3. Bring the branch up to current `origin/main` as above, repeat checks if
   integration changed the tree, then fast-forward `main` and apply the
   push checks.

A failing check stops before merge or push. Existing task commits need no
replacement commit; the request includes committing pending task work,
not sweeping unrelated files into a clean working tree.

Use noninteractive operations. History rewriting — `rebase`,
`commit --amend`, `reset --hard` — needs explicit authorization except for
the never-pushed-branch merge adaptation above.

## Delete merged branches

Run `git worktree list` first. Leave a branch checked out in another
worktree alone and report it. Only delete branches already merged into
`main` / `origin/main`, verified with `git branch --merged main` and
`git branch -r --merged origin/main`. Use local `git branch -d`, never
`-D`, and remote `git push origin --delete <branch>`. Preserve `main`.

## Outside contributions — terms first

Part of this plugin is copied into the App Store app OpenReader.
AGPL-3.0 alone does not permit that for code the owner does not own
(2026-10-10, issue #178, ADR 0018). Every incoming line is the owner's or
given under `CONTRIBUTING.md`:

- Merge an external PR only after its author ticks "Contribution terms"
  in the description; confirm who ticked it in edit history. Until then,
  ask for the tick and leave the PR open.
- Keep unticked PR lines and externally pasted issue code out of all
  commits, including the owner's. Solve the reported problem in new code,
  written from the problem rather than the diff (#169 once took seven
  lines from #168; ADR 0018).
- Put code marked "Submitted on behalf of a third party" to the owner
  with source and license before merging.
- Code copied from here into OpenReader contains nothing from Zotero or
  others. Author history alone cannot establish provenance: ADR 0006's
  Zotero copies carry the Corporation for Digital Scholarship's notice
  even though the owner committed them.

## Releasing

Only on a release request, read [MEMORY/releases.md](releases.md) in full
and follow its numbered steps. It owns release preparation, tags/assets,
update publication and the main session's release-only bridge check.
