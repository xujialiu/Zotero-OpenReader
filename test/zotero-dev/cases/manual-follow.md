[Checklist index](../README.md) · [Scripts](../scripts/manual-follow/README.md)

## 3i. Manual navigation while the sentence remains visible (issue #100)

Run baseline section 0 and cleanup section 7. Use disposable PDF and EPUB
fixtures, both auto-scroll modes and both EPUB flows. Save original
preferences (including user-value flags), transport/bookmark/view state
before changing them. No WebDAV upload or full-checklist pass is required.

Historical evidence: beta2 report (2026-09-13, 1.12.6-beta2 manual-follow)
and [reusable scripts](../scripts/manual-follow/README.md). The beta2
teardown failure is retained; earlier PASS rows are not a fresh pass.

The beta3 combined-build pass (2026-09-13, 1.12.6-beta3 manual-follow)
rechecked the core behavior and closed the fixture readers without new
dead-object errors. Natural input/animation and the explicitly listed
bridge/fixture gaps remain distinct from that mechanism verification.
The later owner follow-up adds automatic resumption on reentry. Beta2/3
record the earlier persistent disengagement behavior and do not verify
this follow-up.

The beta4 reentry pass (2026-09-13, 1.12.6-beta4 manual-follow)
verified automatic viewport reentry and controlled sentence-state reentry;
natural audio progression was unavailable and is not a live PASS.

The historical merged 1.12.7-beta check (2026-09-13, 1.12.7-beta manual-follow)
establishes final installation identity, both settings features, one PDF
and one scrolled EPUB reentry cycle, and clean restoration. The broader
beta4 mode matrix applies to its unchanged follow code.

Issue #153 supersedes #100/#107's visibility recovery and resume policy.
The current full behavior is in [Player following](player-following.md).
Keep the original section numbers for links to historical reports.

### 3i.1. Default and help

The old keep-following switch is removed. The default-auto-scroll checkbox
sets only newly opened tabs; changing it leaves existing A/M alone.

### 3i.2. Partial disappearance and reentry

Any trusted manual scrolling enters M immediately in both formats and both
EPUB flows. Partial/full visibility and later sentences never restore A.

### 3i.3. Whole sentence

Automatic mode still uses complete sentence geometry, with real word timing
for oversized sentences. Manual mode does not consult visibility to recover.

### 3i.4. Gesture priority

Wheel, navigation keys, scrollbar/selection-edge/hand dragging and semantic
navigation enter M. Releasing input does not restore A. Native return values
and Promise identity remain intact; smoothness is a human-only observation.

### 3i.5. Navigation and pagination

Preserve native navigation and EPUB pagination. Skip in M changes the spoken
segment without positioning; skip in A locates it. Shift+R locates once and
preserves A/M; Shift+Enter locates and restores A, including while paused.

### 3i.6. Persistent disengagement

M lasts until an explicit switch to A. Shift+M and the Player A/M control
share the same action. Both scroll styles retain M through setting changes.

### 3i.7. Automatic movement and lifecycle

Automatic scroll callbacks do not disengage. Stop/restart and tab switching
preserve A/M; closing/reopening the document applies the current default.
Split views share intent, separate documents do not. Verify clean teardown.

### 3i.8. Paused stillness and playback resume

Pause cancels pending movement. Resume in M leaves the page alone; resume
in A retains following. One-time and combined return work while paused
without starting audio. Verify both actual Player and shortcut paths.
