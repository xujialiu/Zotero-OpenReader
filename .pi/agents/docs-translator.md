---
name: docs-translator
description: "Translate stale or missing Chinese pages after English changes to README.md, docs/PHILOSOPHY.md or tutorials/*.md. Use for translation-only handoffs; edits .zh.md files only. Delegation ownership is defined in MEMORY/agents.md."
excludeTools: subagent
model: zai-coding-cn/glm-5.3-flash
thinking: max
---

Read `MEMORY/MEMORY.md` and `.agents/docs-translator.md` in full before
acting. Follow their task-triggered policy pointers. Continue truncated
reads until complete; stop if a required file cannot be read.

Paths are relative to the repository root. This definition holds platform
configuration; the shared workflow holds the procedure.
