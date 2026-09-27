[Checklist](../README.md)

# Estimated remaining reading time (issues #148, #150, #152)

The owner authorized live verification after the local checks. Follow the
[baseline](../baseline.md) and tester workflow, including test WebDAV
isolation and full restoration. Verified on beta6: the
[retained kit](../scripts/remaining-time/README.md) records the completed
checks and the first pass's corrected test assumptions.

Use `test/fixtures/remaining-time/remaining-time.epub`: two top-level parts,
with two chapters each in a single spine item. Import it as a temporary
attachment. Use a fixture PDF with no usable outline for the fallback.
Retain executed scripts and their results in the linked kit.

### 1. Default, setting and layouts

With no user value for `readAloud.remainingTime`, the Reading checkbox is
on. Top bar, Bottom bar and Floating panel show an estimate without
expanding Options. One line reads “Doc <N min · Section <M min”, with
generic labels even for long section titles. Floating places it above
speed/A/M/volume, fits it
when collapsed (128 px) and expanded (222 px), and accounts for that height
in menus and dragging. Bars retain 34 px height and place it immediately
after volume. Measure the entire line's visible bounds and one-line height,
not just text content or tooltip. Check ordinary and narrow widths.
Switching the setting off during reading hides the estimates without stopping or
changing reading. Switching it back on restores them. Verify the English
and Chinese setting and messages without changing Zotero's locale live.

### 2. Scope and boundaries

`diagnostics.engine()` exposes each session's `remainingTime` snapshot.
Ordinary reading has `scope: document`; the EPUB's `sectionTitle` is
the deepest heading at the current position. Crossing a nested chapter
changes that title. In the retained fixture, a part and its first chapter
share their start: expect Chapter 1, then Chapter 2 within each part.
Also verify a parent introduction and a nested introduction ending at the
first child's start, using a controlled outline when the fixture has no
introduction. Check the last section through document end. Section time
is no greater than document time. Test segment boundaries on both sides,
not just page turns.
An absent, unresolved or unordered outline yields document time without
section fields. Selecting text and pressing Shift+Space starts there and
continues to document end; expect document scope for that actual UI path.
Zotero currently provides no selection-only UI action. Separately supply
a bounded run through the manager's `setSegments` contract: expect
`scope: selection`, no section fields, and completion at its forward stop.
After its completion, Play continues with document scope. Report this as a
controlled contract check, not a user-facing selection-only feature.

### 3. Clocks, pace and no extra synthesis

At an early held audio response, show `status: estimating, seconds: null`.
Text alone must not give a numeric duration. Short titles and numeric-only
segments do not calibrate pace. For extrapolation, wait for at least three
representative clips totaling eight seconds of original audio; inspect
`remainingCalibration` for sample count, audio seconds, factor, and ready.
A completely measured short range can show its exact duration without
three representative clips. No extra requests are made to reach readiness.
With all audio
needed for the check ready, pause and sample the numeric estimate twice:
it stays still. At 2×, speech and future configured gaps take half as long
as at 1× for the same position. A known gap counts only its unconsumed part;
a manual pause drops that actual gap, matching existing reading behavior,
but the displayed correction remains bounded rather than jumping at pause.

Change voice: without enough new-voice audio the display returns to
Estimating; old-voice calibration must not carry over.
Skipping recomputes from the new position. Verify through finite numeric
snapshots and deterministic audio where timing needs exact comparison;
play ordinary configured audio separately to prove the production path.
Comparing the same controlled run with the setting on and off must not
increase audio requests. Repeated snapshots do not request audio.

### 4. Completion and unavailable states

Before text arrives, the line reads “Estimating…”. A run with no usable
segments shows “Estimate unavailable”. A positive estimate under 60 seconds
shows “<1 min”, without seconds digits. Zero before completion also uses
“<1 min”; an exact 60-second estimate uses “<2 min”, never “<0 min”.
At completion, the line reads “Finished” and the diagnostic is
`status: finished, seconds: 0`, even
though the Engine has reset the position. Play starts a fresh estimate.
Provider errors keep the existing error and Retry controls usable.

### 5. Performance and restoration

On a long document, repeated snapshots reuse the text and outline
aggregates; check that opening the display does not leave scrolling or
controls stalled. Restore all user preferences, voices, speed, volume,
layout and paused state as the workflow requires. Remove fixture items and
positions before restoring ordinary WebDAV destinations, finish playback
item 3.26's teardown, and run [cleanup](../cleanup.md). Human judgment of
estimate accuracy across voices is separate from these mechanism checks.

### 6. Stable document and section display

On a temporary copy of Four Thousand Weeks, use an already configured
voice. The title/contents opening may remain Estimating: do not call that
numeric stability evidence. Also start at body prose so that calibration
becomes ready. Capture at least 30 seconds and multiple natural sentence
boundaries after readiness. With voice/speed/position unchanged, Doc and
the same Section never increase (allow numerical tolerance 1e-6). Their
maximum decrease is 1.5 times the diagnostic `listeningTime` delta, including
consumed
configured gaps, not paused, stalled or buffering wall time. Diagnostic
snapshots and the rendered minute text must agree. No new synthesis is
caused by the time display.

Use controlled deterministic audio to provoke upward and downward raw
revisions. After readiness, newly decoded slow audio must not raise the
number; fast audio cannot drop it immediately. Pause while read-ahead
finishes and verify the displayed number holds. Delay a response at a
later sentence and verify buffering adds no correction budget, including
when snapshots were absent during the wait. Exact stalled-clock coverage
belongs to the virtual-audio unit test when the live device cannot be
safely stalled.

An explicit slower speed or backward jump can increase Doc. A same-speed
write and ordinary pause/resume cannot reset the envelope. Entering a new
section resets Section alone, so it can increase for a longer new section
while Doc remains nonincreasing. Reaching completion immediately shows
Finished even if the envelope would otherwise retain time. Replay starts
fresh. Unit tests additionally cover CJK/mixed-script readiness, rejection
of numeric-only calibration, outlier resistance, exact short ranges,
source and gap boundaries with no intervening display query.

Restore and erase the temporary book copy and its position rows; never
change the original book's position. Keep WebDAV isolated throughout and
restore volume, voice memory, provider settings, original destinations,
and local position state before restoring automatic transports.


Beta12 verification of #152 is recorded in the kit. Live evidence covers
body-prose monotonicity and both correction bounds, voice reset/readiness,
paused delayed read-ahead, rendered-line agreement, speed, completion and
restoration. The delayed-response live probe paused before its held-value
samples; unpaused buffering and exact device stalls remain virtual-Engine
coverage, not a separate live PASS.
