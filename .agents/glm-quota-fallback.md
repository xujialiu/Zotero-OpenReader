# GLM quota fallback

When a GLM provider reports that a subagent's usage quota is exhausted,
the dispatching session continues the same assignment with `gpt-6-luna`
at `xhigh` reasoning effort. This switch has standing user approval.
Timeouts, temporary rate limits and tool errors use the role's ordinary
recovery procedure.

If the role pins its model, dispatch a replacement with the same workflow,
tool restrictions and write scope on a runner that supports the fallback.
Hand over the brief, completed steps, pending work and cleanup ownership.
For live Zotero work, transfer the existing session only after the previous
driver has stopped.
