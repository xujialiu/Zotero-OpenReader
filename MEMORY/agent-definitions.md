# Agent definitions — platform contracts

Read before changing definitions/models/tools, dispatching a generic Codex
worker, or handling a missing definition. Work ownership is in
`MEMORY/agents.md`; this file preserves platform-specific configuration
and why it differs.

## One workflow, three entry points

For each role, keep these aligned:

- `.agents/<name>.md`: shared workflow, with no front matter.
- `.codex/agents/<name>.toml`: Codex configuration and workflow read gate.
- `.claude/agents/<name>.md`: Claude configuration and workflow read gate.
- `.pi/agents/<name>.md`: pi configuration and workflow read gate.

Entry points require the workflow in full before action; incomplete or
unreadable workflows stop the task. Paths are relative to the repository
root. `docs-translator` also reads `MEMORY/MEMORY.md`, and its workflow
loads `MEMORY/docs.md`. The tester loads no `MEMORY/`: it carries its
applicable rules to avoid loading unrelated policy on every tool call
(2026-09-14, when the rule book was one 12k-token file).

Names, descriptions and targets must agree. Keep descriptions quoted and
platform files LF; `.gitattributes` pins that. Preserve native tool
restrictions and configuration fields, not just the workflow prose.

## User-owned model and tool constraints

These are desired policy, not a cache of whichever defaults are installed.
Change model or effort only at the user's explicit request.

| Platform/scope | Required configuration |
| --- | --- |
| Every Codex-spawned agent, named or generic worker/reviewer | `gpt-5.6-luna`, `model_reasoning_effort = "max"` |
| Claude definitions | Native `opus`/`sonnet`; preserve each wrapper's choice rather than copying Codex values |
| Claude `zotero-tester` | `model: sonnet`, `effort: max` |
| pi `docs-translator` and `zotero-tester` only | `model: zai-coding-cn/glm-5.3-flash`, `thinking: max` |
| Other pi builtin/generic agents | Stock behavior: inherit session model/thinking |

Codex's Luna default includes `general-purpose` workers and reviewers
(2026-09-11). Luna is unavailable in Claude Code. The tester's Claude
Sonnet/max choice was requested after two Sonnet runs of issue #110
(2026-09-15); Claude `effort` accepts low / medium / high / xhigh / max.
The two pi pins were requested on 2026-09-27. Keep project/user settings
free of `subagents.defaultModel`, `defaultThinking` and `agentOverrides`
that would impose these pins on other pi agents.

For pi definitions:

- Keep `name`, quoted `description`, and `excludeTools: subagent` to
  prohibit nested delegation, equivalent to the Claude tool restriction.
- The tester's strict allowlist is
  `read, grep, find, ls, bash, edit, write, mcp:zotero-dev`.
  Pi's built-in MCP grants child tools only through an `mcp:` entry in a
  strict allowlist. Preserve that entry (2026-10-04, issue #170).
- Keep `.agents/*.md` frontmatter-free: pi's legacy `.agents/**/*.md`
  scan turns a file with `name` and `description` into an agent.

Issue #170's evidence: #169's tester run started with no bridge, the first
since pi-mcp-adapter was replaced on 2026-10-02. The adapter had exposed
tools to every child unasked; built-in MCP did not. Tool availability is a
configuration contract, not something a longer task prompt restores.

## Missing definitions

Issue #27: Claude Code silently drops a definition at session start when
an unquoted `description:` contains `: ` and CRLF is present. Fresh Orca
worktrees received CRLF through `core.autocrlf`. There is no diagnostic;
the symptom is "not found". A definition added mid-session is also absent
until the next session. Keep quoted descriptions and LF rather than
trying alternate spellings of the role.

If discovery lacks the named definition, report it and use
`general-purpose` at the platform's required default model/effort with the
named workflow's rules in its prompt. A different model/effort still needs
explicit approval. A launch/runtime failure is a reported blocker; follow
the harness recovery contract instead of silently changing execution mode.

Done means all three entry points agree with the shared target, their
platform restrictions survive, and no unintended global model override or
frontmatter-bearing workflow was introduced.
