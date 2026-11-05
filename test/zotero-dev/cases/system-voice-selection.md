[Checklist index](../README.md) · [Scripts](../scripts/system-voice-selection/README.md)

## Select the exact Windows System voice despite overlapping names

Issue #243. Run this case plus [baseline 0](../baseline.md), not a full
System-provider pass. Windows with the independently configured
NaturalVoiceSAPIAdapter and these exact voices is required:

| Raw token | Player and voice-browser label |
| --- | --- |
| `sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1` | `Andrew (Natural HD)` |
| `sapi5/Edge-en-US-AndrewNeural` | `Andrew Online (Natural)` |
| `sapi5/Edge-en-US-AndrewMultilingualNeural` | `AndrewMultilingual Online (Natural)` |

Do not install/configure a bridge, rename Windows voices, edit the
registry, or use a user's document as the playback fixture. Online requests
are authorized but bounded to this case. A missing exact voice or an
unreachable Online service is reported separately from a selection error.

### 1

**Baseline, isolation and build identity.** Snapshot the affected exact
preference values and user-value flags privately, including the WebDAV
folder, volume, enabled/favorites settings, default voice, memory, native
voice memory and document-voice records. Record user readers by title and
their active/paused/voice state, selected tab, geometry, row count, errors
and debug-store state. Confirm pending transports idle and the WebDAV
folder off before muting or other functional changes.

Install the supplied beta, require all `diagnostics.startup()` steps ok
and failed empty, then reconfirm folder off. Compare the installed XPI and
inner bundle SHA-256 with the brief. The bundle must contain the exact-token
failure guard `SAPI selected a different voice than` and the scoped
candidate-mask/finally restoration path. A version string or a successful
installation alone does not prove the new selection path.

The research baseline had all three tokens listed but a helper exhausted
at three starts after earlier uncaptured timeouts. The new build starts a
new backend; do not assume that stale state persists or attribute those
older timeouts to this selection bug.

### 2

**Labels and identities on both display surfaces.** With System voices
enabled and the three voices offered, inspect the actual voice-browser
rows and a fixture Player's System/English voice choices. Require exactly
the labels in the table, without `Microsoft` or the trailing language.
The choices retain their original `system::<raw token>` encoded ids.
`diagnostics.systemProvider()` still reports the unmodified Windows names,
not the shortened UI labels. Require all three raw records and unchanged
raw descriptions; do not interpret a diagnostic's raw name as a UI failure.
Existing saved non-fixture voice identities must not be rewritten.

### 3

**Real synthesis through the installed plugin, switching back.** Call
`diagnostics.systemProvider(<raw token>)` once per step in this order:
Andrew HD -> Andrew Online -> AndrewMultilingual Online -> Andrew HD.
For each step require no `synthesisError`, `synthesis.bytes > 0`, an audio
MIME type, and real word timestamps or an explicit sentence-fallback note.
The installed helper's exact-token guard makes a successful request
incompatible with silently selecting another voice. Require the same
helper to serve ordinary subsequent calls; no process per voice is needed.

List again afterward and compare raw records/count with the run's initial
catalog. All original enabled voices remain available. Discovery alone,
a voice-label match, cached fixture audio or the local Andrew succeeding
in place of Online is not a PASS for Online synthesis.

### 4

**Fixture-only Player selection while paused and playing.** Import
`fixture-a.pdf`, plant a listed free System choice before opening its
Player, and open and pause in the same script. Use only this fixture for
play, pause, selection, repositioning and any trusted input. Preserve the
user's tabs and Positions; never play or reopen a user's paused session.
If an existing player blocks a required setting, only the tester
workflow's permitted close applies, and its title/paused state and closure
must be reported without reopening it.

Probe the fixture's audio output and playback time before a check that
requires movement. For a running output, select local Andrew, start the
fixture and pick Andrew Online while it is playing. Require the handoff to
finish with the Engine/manager on
`system::sapi5/Edge-en-US-AndrewNeural`, advancing playback time, and no
failed-switch notice. Pause promptly. In the paused fixture, select
AndrewMultilingual Online and then Andrew HD; preparation must succeed,
the selected/requested token and displayed label must match each target,
and pausing must not start unwanted playback. If readiness is parked as
a paused handoff, inspect that target rather than the old committed voice.

If the output cannot advance after the workflow's foreground/autoplay
comparison, mark the playing-takeover portion NOT TESTABLE, not PASS.
Synthesis and paused-preparation checks still stand independently.
Subjective timbre and moving word-highlight alignment are human judgments;
the native acoustic regressions cover preservation of #242's word clock.

### 5

**Error/eligibility and timing boundaries — native/unit coverage.** The
real-helper regressions verify exact tokens during Speak, catalog identity
and eligibility after all four voices, restoration after an injected
selection failure, rejection of a mismatched token and missing target,
and preservation/refusal of a deliberately disabled candidate. Do not
change installed voice registrations or eligibility in the live profile
to recreate them. The native Andrew -> David -> Andrew acoustic tests,
format-query fallback and unaffected OneCore check must remain green.
Report these as unit/native coverage, not live passes.

### 6

**Restore and report.** Close and erase only the imported fixture and its
temporary document-voice/position records. Require position rows and
non-fixture document-voice records back at baseline. Restore exact touched
preference values and user-value flags, with memory last among reading
prefs, while WebDAV is still isolated. Restore the folder last, settle
pending work boundedly, and recheck effective values/flags after the last
observer-triggering write. Restore debug state, selected tab and geometry,
close only settings windows opened for the case, and leave Zotero minimized.

Retain only executed scripts under
`test/zotero-dev/scripts/system-voice-selection/`, with the runner contract
and a table-first README. Report PASS / FAIL / NOT TESTABLE per item,
installed build/hash, actual ids/labels/audio values, errors and every
changed state/restoration result. Leave the verified beta installed.
