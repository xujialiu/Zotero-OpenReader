[Checklist index](../README.md) · [Scripts](../scripts/system-voice-refresh/README.md)

## Refresh installed Windows voices without restarting Zotero

Issue #241. Run this case plus [baseline 0](../baseline.md), not the whole
System-voice kit (its macOS counts do not apply here). The current Windows
fixture has NaturalVoiceSAPIAdapter already registered and Andrew HD
installed. Do not install a bridge, change its settings or edit the registry.

### 1

**Identify the build and baseline.** After baseline 0 isolation and before
installation, capture the installed System provider's voice count and the
presence of `sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1`; the research
baseline was nine voices and no Andrew; the later pre-upgrade verification
already listed 40 after an external helper restart. Record the actual
pre-install state rather than assuming the historical count. Install the
supplied beta and require every `diagnostics.startup()` step to pass. Prove
bundle identity by
its SHA-256 and `refreshing the installed voice list` marker. A fresh
backend may already find the voice immediately after installation; that
alone is not evidence that Test connection refreshed it.

Snapshot every affected preference and its user-value flag privately,
including `system.enabled`, `readAloud.volume`, `readAloud.favoritesOnly`,
`readAloud.defaultVoice`, `readAloud.memory`, `reader.readAloudVoices`, and
any fixture document-voice entry. Isolate WebDAV first and confirm all
transports idle; mute before opening any Player. Preserve user tabs and
positions. No raw preference dump or secret value enters the report.

### 2

**Test connection replaces the helper and updates an open Player.** Warm
`diagnostics.systemProvider()` first. The verified 2026-11-05 baseline is
40 records (34 SAPI5 plus six OneCore), with the exact local Andrew token;
the earlier research list was 39. Record the current baseline before the
check and require the same count afterward; report environment drift, not
a missing voice inferred from a historical count. Confirm the first probe
voice is a local Desktop voice, not an Online or metered voice.

Import `fixture-a.pdf`, point its initial choice at a listed free local
System voice, and open and pause its Player. Record the selected voice,
voice/controller identities and `diagnostics.liveVoiceList()`'s applied
count, plus the current helper PID if available. The diagnostic array
follows `Zotero.Reader._readers` order: match the fixture's index by item id,
not the first non-null result (which can belong to a closed Player).
Click the pane's actual **Test connection** once with System voices enabled.

Expected: a successful result with the current voice count; the debug
trace contains `speech daemon stopped: refreshing the installed voice
list` followed by a new helper start, and the old helper PID is gone when
PIDs can be measured. The System switch remains enabled. The voice browser
contains Andrew, and the already-open fixture manager contains
`system::sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1` without closing or
reopening its Player. Its live-list applied count rises; its previously
selected voice/controller identities remain unchanged and paused. Other
readers' choices and positions do not change. Match by token, not by a
Natural HD label suffix: suffix loss is a separate report in #240.

### 3

**Andrew HD can generate actual audio through the installed plugin.**
Call `diagnostics.systemProvider('sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1')`
once. Require that exact record, `synthesis.bytes > 0`, an audio MIME type,
no `synthesisError`, and real word timestamps, or an explicit sentence-only
fallback note if the bridge reports no usable marks. Do not substitute an
Online Andrew voice or a Zotero voice. This check does not require audible
output or establish subjective HD fidelity; the external bridge's HD
support is incomplete.

### 4

**Enable uses the same refresh path.** Close only the fixture Player before
switching System off and back on through the pane, preserving the initial
System-enabled state for cleanup. A user session that blocks a necessary
switch is handled only by the tester workflow's permitted close and is
reported, never restarted. Warm the helper before **Enable** if needed.

Expected: Enable performs the refresh, ends at Disable, and lists the same
current voices including local Andrew HD. Subsequent ordinary listings
reuse the refreshed helper; they do not start a process per request. Do
not loop connection checks or synthesize a collection of Online voices.

### 5

**Ordered refresh under contention — unit coverage.** The daemon regression
runs the real connection-check/System-provider path against helpers with
different process snapshots, and covers already queued synthesis, a
handshake in progress, a failed prior request, shutdown overtaking a reset,
and repeated lazy resets. These race cases are unit-only: do not change
registry registrations or framework-private cache fields in live Zotero
to force them. The live check above proves the actual refresh mechanism.

### 6

**Cleanup and report.** Close and erase only the imported fixture, remove
its temporary document-voice entry, and require position rows back at the
baseline. Close any settings window opened for this case; restore every
touched pref's exact value and user-value flag, memory last, and restore
WebDAV only after temporary state is gone. Settle pending work boundedly,
then recheck every affected pref's effective value and user flag after the
last observer-triggering write. Confirm folder and volume restoration,
review run-time errors, and leave Zotero minimized.
Retain successfully executed scripts in
`test/zotero-dev/scripts/system-voice-refresh/` with its README, and report
PASS / FAIL / NOT TESTABLE per item. Subjective listening quality is not
part of this case. Leave the verified beta installed and report its version.
