# Testing — Zotero-OpenReader

Read before building a test xpi, verifying an implementation or using the
zotero-dev bridge for live work, including research. First choose the
verification tier in `MEMORY/MEMORY.md`. Select the driver and apply
blocked-agent ownership through `MEMORY/agents.md`.

## Prepare the evidence contract

- **Verification brief:** xpi path, every behavior to verify, diagnostic
  and expected output, case/kit to run, and state the run may touch.
- **Research brief:** question to settle and state it may touch. The
  driver states the hypothesis and deciding observation; the installed
  build is the subject unless the brief authorizes an install.

Before sending a verification brief, read
[MEMORY/test-kits.md](test-kits.md), write/update the case and include its
baseline. Before reviewing kit changes or preparing a full pass, read that
same contract. Expected outputs are stated before the run.

Choose reuse **per run**, not merely per question (2026-09-11). Resume
when reconstructing existing evidence, probes and reasoning costs more
than retaining them; start fresh when a concise handoff is cheaper than a
large transcript. A new question or verification after research usually
favors fresh context, but neither choice is automatic. State why the route
costs less. A resumed tester's fourth brief on 2026-09-08, a few state
reads, cost 204k tokens where a fresh agent starts from 60k.

A fresh brief carries verified findings, remaining question, build/state
hashes, fixture, precautions, and live probes or cleanup still owed. Use
the harness's supported resume/message mechanism (`SendMessage` where
available); keep one live driver. The main session owns the issue, fix,
case files and commits; the report is evidence.

## Building for a test

For an implementation change requiring verification, run tests, typecheck
and build before handing off the xpi. `zotero_plugin_install` upgrades it
in place without a restart. Ordinary documentation and translation use
the tiers in `MEMORY/MEMORY.md`, not this implementation pipeline.

**Test builds carry a beta version.** Every xpi built for testing sets
`addon/manifest.json`'s `version` to the next version plus `-beta`
(`1.7.4-beta`), and a second test build of the same version counts up
(`-beta2`, `-beta3`, …), so Tools → Plugins shows at a glance which build is
actually installed. `package.json` stays at the released version — it is not
what Zotero displays, and leaving it alone keeps the lock file out of it.
Two worktrees started from the same base can name the same `-betaN`
(2026-09-06: #59 and #60 both built 1.11.0-beta3, and one was installed
over the other in the middle of a verification): before naming one, check
`origin/main` and the other worktrees' `addon/manifest.json`, and prove
which build a profile runs by a grep of its bundle or by a diagnostic field
the build adds — never by the version string alone.

**The next version is a patch bump unless said otherwise** (settled
2026-09-07): a test build and a release take `X.Y.(Z+1)` — `1.11.2` →
`1.11.3-beta`, then `1.11.3` — whatever the change is, a feature
included. A minor bump, `+0.1.0`, happens only when the user says
`+0.1.0` or names the version; never because the change looks big.

**Every build is verified by its mechanism, not only by its visible
effect** — a diagnostic that proves the code path ran, with the expected
output stated before it runs. A fix that merely looks right may be working
by accident (2026-08-26, multilingual-first: the dropdown looked fixed
while diagnostics showed the patch absent — the "fix" and the symptom's
cause had not actually met); every such delivery quietly turns into debt.
Prefer `Zotero.ZoteroTTS.diagnostics.*`, which runs inside the plugin
sandbox — chrome-scope JS (`zotero_execute_js`, Run JavaScript) cannot
reproduce the sandbox's view. A purely visual change states that instead,
and names exactly what to check by eye.

## Protect live state before driving

Use the **zotero-dev MCP bridge**, `introfini/mcp-server-zotero-dev`,
with *MCP Bridge for Zotero*: Zotero opens RDP at 127.0.0.1:6100 on start.
"Test with zotero dev" / "用 zotero dev 测试" means this bridge, not another
route (settled 2026-08-28). Main-session direct research follows
`.agents/zotero-tester.md`; delegation leaves that workflow with the
tester. Its driving reference is loaded by topic.

Isolation depends on the **operation**, not the driver: functional tests
and research through the bridge follow the same rules below. An install
alone or release update check is not a functional test and leaves WebDAV
alone (clarified in issue #229).

- **WebDAV first: off, or the test folder** (settled 2026-10-05; the
  folder's switch is issue #173). Every functional test driven through
  the zotero-dev bridge — by `zotero-tester`, research included, or by
  the main session — first sorts itself by whether it is about WebDAV:
  the WebDAV folder, the sync or the server backup.
  - *Not about WebDAV:* after `zotero_ping`, before installing a build or
    driving checks, snapshot the folder's switch privately (its value and
    whether it had a user value), settle pending requests, and switch the
    WebDAV folder off (`webdav.enabled` false; on a build without the
    switch, the three sync and server-backup switches instead). Confirm
    `"folder": false` in `diagnostics.positionSync()` — again after every
    install, since an upgrade may turn the folder on. The owner's WebDAV
    settings are not otherwise touched and the test configuration is not
    needed. At the end, including failed or interrupted runs, put the
    snapshot back and confirm it.
  - *About WebDAV:* use `~/.secrets/Zotero-TTS/test_webdav.txt` for the
    dedicated test WebDAV configuration, to protect the owner's bookmarks
    and reading positions. On Windows and macOS, resolve `~` to the
    current user's home directory, including when working in a worktree.
    After `zotero_ping`, before installing a build or driving checks,
    snapshot the affected settings privately, suspend automatic
    sync/backup and settle pending requests, then switch
    Zotero-OpenReader to the test configuration. Confirm the effective
    destination matches the file before proceeding; report only the
    match result, never its contents or credentials. If the file is
    unavailable or isolation cannot be confirmed, stop the live run and
    report the blocker; never fall back to the owner's normal WebDAV.
    During cleanup, keep
    sync/backup suspended until test-created or downloaded
    bookmark/position data and pending writes are isolated and the
    original local state and settings restored; only then restore
    automatic sync/backup. Restore the original WebDAV configuration
    after every such run, including failed or interrupted runs.

  Either way a run is not complete until restoration is confirmed; if
  cleanup cannot be confirmed, leave the folder off or sync/backup
  suspended and report the blocker and the recovery still owed. Include
  the isolation and restoration evidence in the report. An install-only
  request and a release's update check are not tests and leave WebDAV
  alone. Mirrored in `.agents/zotero-tester.md`.
- **Never open a native dialog through the bridge** (settled 2026-10-05,
  issue #175's run). The save and open panels behind *Backup settings…*,
  *Restore settings…* and *Export / Import reading positions…* — any
  button that calls Zotero's `FilePicker` — are system windows the bridge
  can neither press nor dismiss, and so are the prompts `limitations.md`
  §8 lists as human-only. A script that replaced `FilePicker.prototype.show`
  did not intercept the panel: each click opened a real one, seven
  stacked on the owner's screen; an earlier probe of `nsIFilePicker`
  crashed Zotero (SIGSEGV). A check that needs such a dialog is a human
  check or a unit test's: a case item asking for one is reported NOT
  TESTABLE, never worked around. Mirrored in
  `.agents/zotero-tester.md`.

## Execute and accept the run

1. **Plan:** account for every new branch behavior and its check; for
   research, every question and the observation that settles it. Identify
   unit-only checks and human judgments with reasons.
2. **Run:** work the list to empty, then make a final pass over anything
   fixed along the way. A failure stops the pass: fix, rebuild, reinstall
   and restart from the first check.
3. **Inspect evidence:** verification reports are PASS / FAIL /
   NOT TESTABLE tables, observed values first. Open verbatim scripts and
   traces for failed, untestable or surprising rows; confirm every field.
   Research retains verbatim probes/results and Zotero source citations.
4. **Restore:** completion requires confirmed isolation and restoration,
   every changed state accounted for, errors reviewed and remaining gaps
   named. A blocked/untestable row is not a PASS. The test driver may close a
   paused player that blocks a required test through the workflow's
   permitted close; note the tab, report it and do not reopen it
   (2026-09-16, issue #121). This permission is mirrored in the tester.

The full checklist runs only on request; case/kit and report-retention
rules live in `MEMORY/test-kits.md`. The test driver's report format and
topic-specific mechanics live in its shared workflow.

## Human-only checks and bridge failure

- **The user takes over only** when a check needs a human — how a voice
  sounds, whether the word highlight keeps pace, how the popup behaves in
  motion (screenshots are static; nothing here records) — or when the
  bridge is down (`zotero_ping` fails: Zotero needs a restart, which only
  the user can do; `netstat -ano -p tcp | grep 6100` shows whether the
  listener is up). Then a hand round in the old form: at most 3
  self-contained steps, each with (1) what to do in Zotero, naming the UI
  by what it says on screen — "tab 1" / "tab 2", "the player" for the Read
  Aloud popup, "the language dropdown", "the ♥ next to Azure-Brandon" —
  never a letter or a variable name for a thing on screen; (2) the
  **complete** Run JavaScript code pasted in full in that step, never "the
  diagnostic code" or "as above", saying whether "Run as async function"
  must be checked; (3) the expected output field by field and what a
  deviation would mean. Snippets pick out the fields that matter (wrap
  `Zotero.ZoteroTTS.diagnostics.*` and `JSON.parse` its result) and name
  readers by the item's title, never by itemID.

## Diagnostics

`zotero_execute_js` runs in chrome scope, like Tools → Developer →
Run JavaScript: `Zotero`, `Zotero.Reader._readers`,
`reader._internalReader`, `Zotero.ZoteroTTS`. Return a string or JSON.
The sandbox's view comes from `Zotero.ZoteroTTS.diagnostics.*`;
`highlight()` reports what highlight-style.ts sees.

Read `zotero_read_logs` / `zotero_read_errors` for `[zotero-tts]` and
`JavaScript Error`. Without the bridge, ask for Help → Debug Output
Logging → View Output, saved as .htm. For installed source/profile paths
and discovering the configured test server, use `MEMORY/zotero.md`.
