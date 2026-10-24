# Releases — Zotero-OpenReader

Read only for a release request, after `MEMORY/MEMORY.md` and
`MEMORY/git-workflow.md`. The main session performs this workflow; its
release check is not a functional test and leaves WebDAV alone. Steps
below retain the numbering used by the release scripts' references.

Installed copies auto-update through the manifest's `update_url`, which
points at `update.json` on `main`: until step 6 points it at the new
release, every installed copy stays on the old version. X.Y.Z is the
patch bump of `MEMORY/testing.md` unless the user names the version.

"Release X.Y.Z", with a line or two of release notes, runs the whole
release on a tree whose fix commits are already in — anything
uncommitted is not the release's and stops the run. In order,
each step's output in the report:

1. `git fetch --prune`, `git status -sb`, `git worktree list`,
   `git log origin/main --oneline -5`: `git tag -l vX.Y.Z` must print
   nothing and no `chore: release X.Y.Z` may already sit on
   `origin/main` — another worktree may have shipped that number the
   same morning (2026-09-06); then the number is wrong, and the run
   stops.
2. `node scripts/release-prepare.mjs X.Y.Z` — the two version lines (a
   test build's `-betaN` dropped), the lock file, tests, typecheck, build,
   the xpi's manifest checked.
   It refuses a dirty tree, a version that is not newer and an existing
   tag, and a failed check ends it; any refusal ends the run, reported
   verbatim. It touches nothing but the three files it names.
3. Commit exactly `package.json`, `package-lock.json` and
   `addon/manifest.json` as `chore: release X.Y.Z`; `git tag vX.Y.Z`
   (lightweight, no `-a`).
4. Bring `main` up and push: on a branch, `git merge --ff-only` into
   `main` in the primary checkout found with `git worktree list`; when
   that checkout is busy — another session's uncommitted files there —
   push the branch straight to the remote main from here,
   `git push origin <branch>:main`. Apply the key scan in
   `MEMORY/git-workflow.md`, then `git push origin main` (or the
   `<branch>:main` form) and
   `git push origin vX.Y.Z`. A `main` that does not fast-forward is not
   yours: stop and report.
5. `gh release create vX.Y.Z build/Zotero-OpenReader.xpi --title vX.Y.Z --notes "<the brief's notes>"`
   — the asset must be named `Zotero-OpenReader.xpi`, which `build/` gives
   and `update.json` names (ADR 0017).
   When the brief has no notes, the subjects of
   `git log <previous tag>..vX.Y.Z --oneline` are the notes.
6. `node scripts/release-point.mjs X.Y.Z` — it checks the asset answers
   200 and rewrites `update.json`; commit `update.json` alone as
   `chore: point update.json at X.Y.Z`, and push as in step 4.
7. `node scripts/release-point.mjs X.Y.Z --verify` — the raw
   `update.json` on `main` must serve X.Y.Z and the link answer 200.
   raw.githubusercontent.com caches for up to five minutes: exit code 2
   names the wait; wait it out and retry, up to three times, before
   calling it a failure.
8. The main session checks that the installed copy is offered the update.
   Load `zotero_ping` and `zotero_execute_js` from the configured zotero-dev
   bridge: ToolSearch for deferred Claude tools, or `codemode` in a pi
   main session. Ping, then run this verbatim:

   ```js
   (async () => {
     const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
     const addon = await AddonManager.getAddonByID('zotero-tts@xujialiu.top');
     const result = await new Promise((resolve) => {
       let offered = null;
       addon.findUpdates({
         onUpdateAvailable: (a, install) => {
           offered = { version: install.version, from: install.sourceURI.spec, state: install.state };
           install.cancel();
           offered.after = install.state;
         },
         onNoUpdateAvailable: () => {},
         onUpdateFinished: (a, status) => resolve({ installed: addon.version, offered, status }),
       }, AddonManager.UPDATE_WHEN_USER_REQUESTED);
     });
     return JSON.stringify(result);
   })()
   ```

   Expected: `installed` the beta this machine runs, `offered.version`
   X.Y.Z, `offered.from` the release asset, `status` 0, and the install
   cancelled — `state` 0 (available) then `after` 12 (cancelled), the
   beta left installed; the gear menu would install, this does not.
   `offered` null within five minutes of step 6 is the cache of step 7,
   not a failure: wait and run it again. A bridge that does not answer
   is reported, and the release stands.

Report: every command with its output, then `git log --oneline -8` and
`git status -sb`, and anything left undone and why. For a release,
also the tag, the release URL, what `--verify` printed and what the
`findUpdates` script returned.
