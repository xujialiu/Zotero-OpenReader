# GLM quota fallback

When the provider reports that the quota for any GLM model is exhausted,
continue the assignment with `gpt-6-luna` at `max` reasoning effort.
This fallback has standing approval for every agent role across Codex,
Claude Code and pi. Timeouts, temporary rate limits and tool errors use
the role's ordinary recovery procedure.

If the role pins its model, dispatch a replacement with the same workflow,
tool restrictions and write scope on a runner that supports the fallback.
Hand over the brief, completed steps, pending work and cleanup ownership.
For live Zotero work, transfer the existing session only after the previous
driver has stopped.
