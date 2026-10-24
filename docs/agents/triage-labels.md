# Triage labels

Read when a skill names a triage role. Map that role to the exact tracker
label below; each role currently uses its canonical name.

| Role | Tracker label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer must evaluate the issue |
| `needs-info` | `needs-info` | Waiting for reporter information |
| `ready-for-agent` | `ready-for-agent` | Fully specified for an AFK agent |
| `ready-for-human` | `ready-for-human` | Needs human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

For example, a skill's "AFK-ready" means `ready-for-agent`.
`MEMORY/issues.md` owns allowed labels and the independent `working`
label; this adapter only maps triage vocabulary.
