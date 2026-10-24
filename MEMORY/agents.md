# Agents — Zotero-OpenReader

Read before delegating, doing an agent's work yourself, or changing an
agent definition/workflow. Shared policy comes from `MEMORY/MEMORY.md`.

## Choose the owner

| Work | Owner |
| --- | --- |
| Bug/feature research in running Zotero | Main session may use zotero-dev directly; first read `.agents/zotero-tester.md` and follow its research, evidence and restoration rules |
| Live implementation verification | `zotero-tester`, regardless of main model |
| User explicitly asks main session to drive Zotero personally | Main session, under the same tester workflow |
| Chinese translation in a Fable or Astra (`gpt-6-astra`) session | `docs-translator` |
| Chinese translation in any other model | Main session, following `.agents/docs-translator.md` |
| Git housekeeping or release | Main session; no delegation |

Delegation is per agent, not a general license to fan out. Research and
verification have different drivers (2026-09-14); explicit personal-driving
requests override verification delegation (2026-09-13). Use configured
models and effort. Changing either requires the user's explicit request;
platform constraints and Codex generic-worker defaults are in
[MEMORY/agent-definitions.md](agent-definitions.md).

### A blocked tester keeps ownership

A usage limit, tool failure, interruption or delay leaves verification
with `zotero-tester` (2026-09-15, issue #108). Report the blocker, continue
independent work and resume it when possible; report a persistent blocker
to the user. "Continue", "finish the tests" and approval to merge or push
after testing preserve the assignment. The main session takes over only
on an explicit request to change driver. Keep its model unless the user
explicitly requests a model change.

### Give the next owner only what it needs

Verification/research brief contracts and fresh-versus-resumed selection
are in `MEMORY/testing.md`. The main session reads the shared workflow
before performing that role itself, not merely because it delegates it.
The worker reads its own rulebook. When editing a workflow or inspecting
a kit contract, read the material needed for that editing/review task.

Historical context, not a current harness estimate (issue #58): the
2026-09-06 transcript review found some 60k tokens of harness and rules on
every call; session cost was context times calls. The 2026-08-31 session's
second day cost six times what a fresh session would have. This motivated
the core's batch-read and one-issue session rules, not a fixed token budget
for today's tools.

## Maintain definitions and shared workflows

Before adding, renaming or editing a definition, changing models/tools,
or handling a missing definition, read
[MEMORY/agent-definitions.md](agent-definitions.md). It holds the three
platform contracts and the incident evidence behind their restrictions.

- `.agents/<name>.md` owns the workflow; platform files point to it.
  Edit the shared procedure once, and synchronize names, quoted
  descriptions and read contracts across Codex, Claude Code and pi.
- Shared project policy stays in `MEMORY/`. The tester intentionally
  loads none of it: `.agents/zotero-tester.md` carries its applicable
  rules, with its verification-kit branch in
  `.agents/zotero-tester-kits.md`. MEMORY is authoritative where they
  disagree; the main session repairs both copies in the same change.
- The translator reads the core and `MEMORY/docs.md`; its workflow
  references translation policy instead of copying it.
- Finish definition work only after checking all three wrappers, shared
  targets, model/effort/tool restrictions and line endings. `.agents/`
  workflow/reference files remain frontmatter-free.

## Wait without busywork

When children are the only work left, stop active work and use the
harness's supported wait mechanism. Resume for a result, question or new
input. Inside a wait window, elapsed time alone is no reason to check
status, send reminders, hurry a child, rerun checks or interrupt. Interrupt
only for a concrete safety concern, changed requirements or the user's
request (2026-09-12).

The project checkpoint policy is **at most 50 minutes per blocking wait
window** (2026-10-01). Where blocking waits/checkpoints are supported, wait
up to 50 minutes, read status once if it is still running — state, current
step and last activity — report two or three lines, then wait again. No
new activity since the last checkpoint is a reported stall/blocker.
The original rationale was a checkpoint inside the main session's one-hour
prompt cache and detection of a dead or hung worker; that is historical
context, not a promise about every harness's cache.

Use a harness-required native completion notification when it forbids
active waits or polling; do not emulate a blocking checkpoint through
repeated status calls. The tool's execution contract controls which wait
mechanism is available.
