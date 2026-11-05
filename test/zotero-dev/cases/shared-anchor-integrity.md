[Checklist index](../README.md) · [Executed kit](../scripts/shared-anchor-integrity/README.md)

## A phone's position resolves to its quotation, not a similar or earlier copy (issue #234)

Run [baseline 0](../baseline.md) and [cleanup](../cleanup.md). This is a
Positions File test: use only the dedicated test WebDAV configuration,
never the normal folder. If it is unavailable or isolation cannot be proved,
report NOT TESTABLE and stop before any fixture or server write.

Fixture: `test/fixtures/anchor-integrity/anchor-integrity.epub`, regenerated
by `python3 test/fixtures/anchor-integrity/make.py`. Import a fresh standalone
attachment titled **Anchor position integrity fixture**. Inspect the real
loaded SDT to derive element locators and original-text offsets; do not
assume a hard-coded CFI or segment index. The fixture contains misleading
and real headings, adjacent Han text, 100 contextual replies, two identical
uncontextualized replies, and a decomposed-accent control. Never use a real
user document as a fixture. Mute before playback and use a free/local voice.

Before installation, isolate WebDAV and snapshot the touched preferences,
fixture-related store state and test-server files privately. Suspend and
drain all four transports before switching destinations or restoring state.
The known store tables are `positions`, `deletions`, `documents` and
`document_positions`; restore fixture-created records and in-memory holds,
not just the attachment. An existing item for this fixture's Document Id must
be preserved, or use a distinct test-only fixture identity. No user row may
be overwritten. Keep raw preferences, credentials and full store rows out
of reports and kits.

For each resume check, establish a known older local position at the
fixture's opening paragraph. Then write a newer phone item to the isolated
Positions File, using a distinct test device name and a monotonic stamp.
Trigger the real Shift+Space/player resume path. Prove adoption through
`diagnostics.positionSync()` and the log, and prove the selected source
position through the manager's active segment and SDT offsets, not merely
through a toast or highlighted page. An already active fixture may be paused
or closed between checks. Do not change the user's players.

### 1

**Heading recovery.** Quote `Chapter 7` with empty prefix/suffix. First use a
locator absent from the loaded SDT; then use the real locator of `Chapter 70`.
Both resumes must reach the `Chapter 7` heading, never `Chapter 70` or
`Chapter 71`. The plugin log must say `resumed from the shared position`
with `exact`; the recovery reason is respectively `locator-did-not-resolve`
or `text-disagreed`. Record the real heading's SDT ref and observed segment.

### 2

**A missing whole heading is refused, not approximately rescued.** Quote
`Volume One Chapter 7` with empty context and the locator of the fixture's
`Volume One Chapter 70`. The log must say `not resolved` / `not-found`, the
existing unresolved-position notice must appear, and resume must use the
known older local sentence. It must not start on the longer heading.

### 3

**Context preserves adjacent Han text.** In the real block containing
`前文你好后文。 你好。`, quote the first `你好` with its actual surrounding
block text (32 code units per side, NFC). Its real start offset is 2 if the
snapshot is verbatim; derive and report it rather than assume it. With a
missing locator, resume must target the first occurrence with `exact`
agreement, not the later spaced copy. Confirm the SDT source position or
active segment distinguishes those occurrences. The stored context is
allowed to attest adjacency; removing it is a different, host-tested case.

On 1.17.1-beta4 (2026-11-05), the installed plugin delivered the first
occurrence `[6,0,2]` through `[6,0,4]`, and one instrumented run consumed it
and first exposed `[6,0,0]` / `前文你好后文。`. Other passes started elsewhere
despite the correct delivered point. The resolver mechanism passed; playback
start repeatability remains unresolved, not an unconditional end-to-end PASS.
Keep both observations and do not retry away a failure. See the
[verification record](https://github.com/xujialiu/Zotero-OpenReader/issues/234#issuecomment-6661264930).

Beta5 supersedes that start uncertainty for the reproduced interleaving:
script 33 observed one target-containing setter, and script 31 observed the
correct first active segment at 167 ms before normal forward progression.
A later polling sample is not a new start. This item does not impose a
minimum dwell time or judge an en-US voice's Chinese pronunciation.

### 4

**The 100th reply is eligible, in both matching paths.** In the block whose
entries run from 0 to 99, quote the final `Yes.` with context derived from
the actual block. Resume first with its valid block locator and then with a
missing locator. The selected source start must be the final occurrence,
not one of the first 64; record its offset and nearby `Entry 99` / `Answer 99`
text. The log must report `exact`. Repeat once with `exact` changed to `YES!`
and unchanged context, forcing token matching: the same occurrence must
win, with `aligned` agreement. If Zotero joins a short reply to another
segment, report its actual containing segment and verify the selected SDT
point; do not infer the point from the displayed text alone.

### 5

**Indistinguishable occurrences are refused even with a valid locator.**
Quote `Echo.` with both context fields empty against the `Echo. Echo.`
block, once with its own locator and once with a missing locator. Both
must log `not resolved` / `ambiguous`, show the existing unresolved-position
notice, and fall back to the established older local sentence. Neither may
claim a successful shared resume at the first `Echo.`. This checks the
caller's handling of the matcher flag, not just `matchAnchor` in isolation.

### 6

**Host-only boundary, ranking and scaling matrix.** Run
`test/core/document-anchor-integrity.test.ts` and
`test/read-aloud/shared-position-integrity.test.ts` alongside the existing
anchor, aligner and SDT tests. Expected: all pass. These cover astral letters
and digits, combining marks, NFC/NFD original UTF-16 offsets, token reflow,
partial-alignment refusal, 64/65/100/10,000 copies, cross-text-node source
positions, and an ambiguous candidate visited before or after a stronger
unique candidate. These are pure algorithm branches; a 10,000-occurrence
live playback is unnecessary. Record host timings separately without a
flaky unit-test timing threshold. This row is not evidence of live playback.

### 8

**A concurrent voice refresh cannot replace the explicit start.** Run this
before item 7. Start from the known older local fallback, close the fixture
session, then supply the first Han SDT point directly. Inject one call to
the real manager's `applyPersistedVoices` at the first
`_requestReadAloudSegments` entry, as in the retained red research probe
`r33-inject-voices-write.js`. Use temporary fixture-only wrappers and restore
and compare their actual descriptors/references in `finally`.

Expected on beta5: exactly one native `setSegments`, choosing the segment
containing the first Han point; exactly one non-null target consumption;
`diagnostics.segmentPreparation()` for the fixture has `patched:true`,
`coalesced` increased by at least one and ends with `pending:false`. Its
`started` count increases once, not twice. Record the initial setter event,
not a later polling sample that may miss a short segment. Repeat a bounded
three-trial sequence and an ordinary no-injection control. The retained
`40` control's historical label is `control-unwrapped`, but its observation
wrappers remain installed: it is a non-injected instrumented control, not
a no-wrapper control. The ordinary shared-resume checks use no such wrappers. Beta4's deciding
probe chose the correct index and then replaced it with the saved index;
retain that red evidence rather than weakening the assertion.

Host tests in `test/read-aloud/segment-preparation.test.ts` additionally
cover granularity invalidation, close/reopen while pending, synchronous
reentry, rejection/retry, reader isolation and disposal. Test the live
cold/new-reader attach, a close/reopen, and the diagnostic after reinstall.
These do not require changing user voices or the shared file format.

### 7

**Restoration.** Pause and close only fixture playback, and run
[playback 3.26](playback.md#326). Restore the test-server files byte for byte,
remove the run's fixture and its local/tombstone/document records, and prove
that no fixture item remains pending in memory for upload. Compare all
snapshotted local table contents and settings, including effective values
and user-value flags; list any independently changed user state rather than
overwriting it. Restore the normal WebDAV destination only after the data
and pending-work cleanup gate, and enable its original switches last.
Confirm all four transports settled, the original tabs/players preserved,
and new plugin/dead-object errors absent. A failed restore leaves WebDAV
disabled or sync suspended and is reported as a blocker, never PASS.

The verified beta may remain installed. No release, production-server
write, provider credential change or physical-phone operation is included.
The executed scripts are retained in the linked kit. Its README distinguishes
beta4 observations from the beta5 safety changes awaiting execution. Restore
all named preferences and document-voice records by content and user flags,
not only the old eight-field subset. The first run's original WebDAV switches
were all off; the enabled-folder restoration order is also covered by the
inert-boundary kit tests.
