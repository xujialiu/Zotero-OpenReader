[Checklist index](../README.md)

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
Successful reusable scripts belong in
`test/zotero-dev/scripts/shared-anchor-integrity/`; add the kit link here
when that executed kit exists.
