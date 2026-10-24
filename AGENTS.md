# AGENTS.md — Zotero-OpenReader

Read [MEMORY/MEMORY.md](MEMORY/MEMORY.md) in full before starting a task.
Continue truncated reads until complete. Follow its task-triggered pointers
before the work they cover. A named agent whose definition supplies a
self-contained rule set follows that definition's reading contract.

## Agent entry points

Codex, Claude Code and pi definitions live in `.codex/agents/`,
`.claude/agents/` and `.pi/agents/`. Each points to its shared workflow in
`.agents/`. Read the workflow before performing that role yourself; the
agent reads it when work is delegated.

Shared project policy belongs in `MEMORY/`; role workflows belong in
`.agents/`. Keep this entry point thin.

## Skill adapters

- **Tracker** — before translating a skill's ticket, issue or PR operation
  into tracker commands, read [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage** — before applying a skill's triage-role label, read
  [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain** — before exploring an area or writing domain terms or decision
  records, read [docs/agents/domain.md](docs/agents/domain.md).
