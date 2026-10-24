# Issues — Zotero-OpenReader

Read when finding a bug, starting a feature needing a design decision,
starting/resuming issue work (research and verification included), or
operating on an issue. Use GitHub through the adapter in
`docs/agents/issue-tracker.md`; this file owns policy.

## Decide whether an issue is due

- **Bug:** always an issue, even a ten-minute fix. It is the public
  production-incident record; notes still retain durable findings
  (2026-08-29).
- **Feature:** an issue when a design decision or more than one session
  is needed. Issues replaced README TODO steps.
- **Chore:** docs, wording/layout, refactors or housekeeping that leave
  behavior alone get a short public record when worthwhile; a one-line
  tweak needs none. A chore body is a couple of what/why lines, with no
  evidence section or NOTES entry.

**Permission first:** propose a title and one-line reason, then wait for
explicit approval before opening any bug, feature or chore (2026-09-08).
The issue opened unasked that day was deleted. Open to clarify a current
problem, not to defer it: an open issue is a promise to strangers, and
stale enhancements make a public project look abandoned.

## Read the existing record first

Before opening an issue or touching one the user names, read **every open
and closed title** with `gh issue list --state all`, using enough results
to cover the repository. Read related issues with all comments, then state
their numbers, relevance and whether a new issue would duplicate them
before proceeding (2026-09-06). Closed issues may already settle the
problem, evidence and plan.

Once taking an issue on, add `working` **before** investigating, discussing
a plan, implementing or verifying (2026-10-18). Keep it while awaiting
user decisions, results or commit permission. Remove it on closure or
explicit pause/abandonment; restore it before resuming. Browsing or
organizing the list is not active issue work. Change this label without
altering the other labels; it is independent of triage state.

## Write the problem, then the plan

### An issue requested by the user

"提 issue" / "创建 issue" is a requirement-writing task, not code research
(2026-09-09, issue #81). Read the list, ask about requirements you would
otherwise have to invent, write the user's side and stop: current behavior,
its cost and the requested behavior. Leave implementation, files and
approach out. Ask gaps in one round of concrete alternatives, marking the
recommendation; settle them before writing instead of parking questions
in the issue. For an unsettled product default, choose a new switch off
so existing users are unchanged; state that default and that it can be
overruled in the handoff.

### Bug or feature investigation

Write the issue **before the fix**: what goes wrong, when, the user impact,
evidence and Zotero internals cited by file/line (#6 is the shape). Keep
solutions out of this problem record; the approach is not known yet.

Every issue research ends with a plain-language recommendation, not just
findings (2026-09-08, issue #71): choice, reason, user benefit, cost and
remaining decision, plus a line on a rejected option. Apply the user
proposal rule in `MEMORY/MEMORY.md`.

Once the user accepts the approach, post a **plan comment before
implementation**: mechanism, files, ordered steps, alternatives and why
they lost. While working, comment as soon as a step proves wrong, a late
constraint appears or the approach changes. Keep the issue as the running
log; notes retain reusable knowledge, not a duplicate of the issue.

## Label by cause and user impact

Use `bug`, `enhancement` or `chore`. Every bug gets exactly one severity;
features and chores get none (2026-08-31):

| Severity | User impact | Scheduling |
| --- | --- | --- |
| `severity: critical` | Spends money, loses unrecoverable data, or takes Zotero down: crash, hang, plugin not starting | Before other work; patch release |
| `severity: major` | A documented feature fails in an ordinary setup or a setting changes silently | Next release |
| `severity: minor` | Cosmetic, uncommon edge case, or wrong diagnostic | When convenient |

Choose severity from impact, not fix size; update it when evidence changes.
Label the cause, not the report title: a docs fault is `chore`. Other allowed
labels are `working`, the five roles in `docs/agents/triage-labels.md`, and
`wayfinder:*` (2026-10-04). Use no milestones.

## Finish at the finishing commit

1. Post a closing comment describing what was built, how verified and
   what remains open. It is about this change; keep durable Zotero
   knowledge in notes. Post it **before** the finishing commit.
2. The authorized commit subject names the issue, for example
   `fix: … (#5)`.
3. Run `gh issue close 5` immediately after that commit, not after merge,
   push or release (2026-09-23, issue #133). A subject's number links a
   commit but does not close the issue. Remove `working` on closure.

## Reply to outside reporters

For an investigated report, post two separate comments in order
(2026-09-07, issue #73):

1. Evidence: failure, user cost, measurements and Zotero internals cited
   by file/line, no solution.
2. Human reply: open `@<reporter> Thanks for the report, …`, explain the
   finding, workaround and the one thing still to confirm in plain words.

After the fix is **released**, reply on the closed issue in the reporter's
language: thanks, completion and the version they can install (2026-09-06,
issue #50). Keep it separate from the closing summary and write like a
person, not a changelog. Ask for a star only when the user explicitly asks
for that request in that reply (2026-10-05).

## GitHub Markdown

One paragraph per line in issue, PR and comment bodies; separate blocks
with blank lines. GitHub renders single newlines as `<br>` (`breaks: true`),
so 80-column wrapping creates a ragged narrow column (2026-08-30).
Repository English Markdown keeps its different hard-wrapping convention.
