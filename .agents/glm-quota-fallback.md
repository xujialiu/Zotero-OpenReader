# GLM quota fallback

When a GLM provider reports quota exhaustion, continue the assignment
with the [approved model and reasoning effort](../.codex/agents/README.md)
for every role and runner. Timeouts, temporary rate limits and tool
errors use the role's ordinary recovery procedure.

If the role pins its model, dispatch a replacement with the same workflow,
tool restrictions and write scope on a runner that supports the fallback.
Hand over the brief, completed steps, pending work and cleanup ownership.
For live Zotero work, transfer the existing session only after the previous
driver has stopped.
