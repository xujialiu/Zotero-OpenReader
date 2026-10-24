# Issue tracker — GitHub

Read when a skill asks for tracker operations. Issues and specs live on
`xujialiu/Zotero-OpenReader`; use `gh`. Read `MEMORY/issues.md` in full
before the operation: it owns permission, issue lifecycle, labels and
body formatting. This adapter maps skill vocabulary and tracker features,
not a second policy source.

## Map the operation

| Skill operation | GitHub operation |
| --- | --- |
| Publish to the issue tracker | Create an issue after policy approval: `gh issue create` |
| Fetch the relevant ticket | `gh issue view <number> --comments` |
| Read structured body, labels and comments | `gh issue view <number> --json number,title,body,labels,comments` |
| List/filter | `gh issue list` with appropriate state/label and JSON fields |
| Comment | `gh issue comment <number>` |
| Add/remove label | `gh issue edit <number> --add-label <label>` / `--remove-label <label>` |
| Close | `gh issue close <number>` after the lifecycle's finishing commit |

Pass titles and bodies with `--title` / `--body`, or `--body-file` for a
prepared body. Inside a clone, `gh` infers the repository from remotes;
use `--repo xujialiu/Zotero-OpenReader` when it is ambiguous. Use CLI help
for routine options rather than extending this adapter into a command
catalog.

## Pull requests

**PRs as a request surface: no.**

This flag is consumed by `/triage`. Ordinary PR operations use the
`gh pr` equivalents; contribution permission is in
`MEMORY/git-workflow.md`, not the triage flag. If PR request triage is
enabled later, it uses issue states/labels and keeps only external authors
whose `authorAssociation` is `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` or
`NONE`, excluding `OWNER`, `MEMBER` and `COLLABORATOR`.

GitHub shares issue/PR numbers: resolve an ambiguous `#42` with
`gh pr view 42`, falling back to `gh issue view 42`.

## Wayfinding

`/wayfinder` uses one **map** issue and **child** ticket issues:

- **Map:** label `wayfinder:map`; body holds Notes / Decisions-so-far /
  Fog.
- **Child:** link as a GitHub sub-issue through `gh api`. Where unavailable,
  add it to the map's task list and put `Part of #<map>` atop the child.
  Label `wayfinder:<type>`, with type
  `research` / `prototype` / `grilling` / `task`. Assign claimed
  tickets to the driving dev.
- **Blocking:** prefer GitHub's native, UI-visible issue dependencies:
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Obtain the numeric database id with
  `gh api repos/<owner>/<repo>/issues/<n> --jq .id`; it is neither the
  issue number nor `node_id`.
  `issue_dependencies_summary.blocked_by` counts open blockers.
  Without native dependencies, put `Blocked by: #<n>, #<n>` atop the
  body. Every blocker must close before a ticket is unblocked.
- **Frontier:** list the map's open children, scoped to native sub-issues
  or its task list. Drop assigned children and those with any open
  blocker, native or fallback. First in map order wins.
- **Claim:** the session's first tracker write assigns the ticket with
  `gh issue edit <n> --add-assignee @me --add-label working`, applying
  the active-work label from `MEMORY/issues.md` in the same operation.
- **Resolve:** comment the answer, then close under the issue lifecycle,
  then append a gist-plus-link context pointer to Decisions-so-far.
