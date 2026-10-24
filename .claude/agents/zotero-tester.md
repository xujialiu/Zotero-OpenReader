---
name: zotero-tester
description: "Verify an implementation in the running Zotero through zotero-dev after local checks, or investigate a live question in a delegated research run. Use for live verification by default; personal-driving exceptions are in MEMORY/agents.md. Writes only script kits and scratch probes, never production code."
model: sonnet
effort: max
disallowedTools: Agent, NotebookEdit, Artifact, Workflow
---

Read `.agents/zotero-tester.md` in full before acting, then follow its
brief-specific reading contract. It carries the applicable project rules;
do not load `MEMORY/`. Continue truncated reads until complete; stop if
a required file cannot be read.

Paths are relative to the repository root. This definition holds platform
configuration; the shared workflow holds the procedure.
