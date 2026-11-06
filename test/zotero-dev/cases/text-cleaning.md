[Checklist index](../README.md) · [Scripts](../scripts/text-cleaning/README.md)

## Text cleaning (issue #240)

Run [baseline 0](../baseline.md) and [cleanup](../cleanup.md). This is not a
WebDAV case: snapshot the folder switch privately, settle pending work,
disable it before installation and confirm `positionSync().folder:false`
after installation too. Restore the original value and user-value state
only after fixture data, transports and preference observers are quiet.

Use `test/fixtures/text-cleaning/text-cleaning.epub`, regenerated with its
`build.py`, as a temporary standalone attachment. Open at most one new
fixture at a time and leave the user's documents alone. Capture the
fixture's actual Segments before playback: expected preparation below is
not permission to assume Zotero retained every source space.

Snapshot every touched preference privately, including value and user-value
flag: global/document Replacements and their change stamp, bracket switch
and pair list, cache, volume, System enable if needed, default voice,
Zotero's voice memory, the plugin's reading memory and sync metadata. Retain
the complete document-voice map as well. Clear global rows only with other
readings safely isolated; a permitted paused-player close is reported and
not reopened. Never change rows that could trigger synthesis on a user's
document. Prefer System voices for free local requests; do not use a paid
service. Zotero Standard/Premium transport checks use restored stubs only.

### 1. Build identity and rule scope

Install the brief's beta xpi, prove its bundle hash and
`diagnostics.startup().failed:[]`, then call
`await diagnostics.textCleaning('中 文', fixtureReaderIndex, systemVoiceId)`
inside the sandbox diagnostic. Expected:

- `mechanism: "scoped-text-cleaning-v1"`;
- exactly one rule, `id: "chinese-whitespace"`, with
  `scope.documentTypes: "all"` and `scope.providers: "all"`;
- `original: "中 文"`, `text: "中文"`, `changed:true`,
  `cleaning:[{id:"chinese-whitespace",removed:1}]`;
- the fixture's context identifies `documentType:"epub"` and
  `provider:"system"` when given its actual System id;
- two unreplaced pieces: speech `[0,1)` → document `[0,1)` and speech
  `[1,2)` → document `[2,3)`.

Restricted-scope exclusion, missing-metadata fail-closed behavior and empty
scope lists are pure-module checks; report that boundary, not a live PASS
based only on the all/all label. There is no added setting or rule editor.

### 2. Speech preparation in the installed sandbox

With no applicable Replacement rows, call the same diagnostic for the
following literal inputs. Whitespace escapes below name the actual
characters, not a backslash sequence to send verbatim.

| Original | Expected `text` |
| --- | --- |
| `这 是 一句 话` | `这是一句话` |
| `中文 ， 测试` | `中文，测试` |
| `𠀀` + space + ideographic space + `中` + tab + newline + `文` + NBSP + `字` | `𠀀中文字` |
| `BNN 结构` | unchanged |
| `第 3 章` | unchanged |
| `hello, world` | unchanged |
| `中文, 测试` | unchanged |
| `“ ”` | unchanged |
| leading space + `中 文` + trailing newline | leading space + `中文` + trailing newline |

For the supplementary-Han row, expect five removed UTF-16 units; the
retained ranges include document `[0,2)`, `[4,5)`, `[7,8)` and `[9,10)`.
Neither original text nor source positions may be mutated. With bracket
removal enabled (`<> []`), `中 [文]` becomes `中文`; disabled after
stop/reactivation, it stays `中 [文]`. This does not change sentence or
paragraph boundaries. Long runs and the fixed punctuation set are covered
by host tests rather than timing-sensitive live loops.

### 3. Explicit Replacements retain control

On the fixture only, set Exact `中 文` → `甲 乙 [轻 声]`. Preview
`中 文` with brackets enabled: `text` is exactly `甲 乙 [轻 声]`, no
cleaning inside Read as, and its replaced piece covers document `[0,3)`.
The row must still match the space-bearing original, not pre-cleaned text.
Remove it: automatic `中文` resumes. Repeat with the old whitespace regex
workaround followed by removal: where the resulting speech is identical,
the prepared text must compare equal and must not request new audio.

### 4. Actual request, word coordinates and cache

Capture the actual outgoing text at a restored System/provider request
boundary for a few fixture Segments; preview/debug output alone is not
transport proof. Expect the actual Segment's extra Chinese whitespace to
be removed, mixed Latin/numeric spacing preserved, and the original
Segment/source position unchanged. Record the capture method and exact
observed input/output.

For real word timings, map ranges back to the original Segment; a span
spoken as `中文` over original `中 文` covers `[0,3)`. Repeat through cache
and a held lookup: there is no second synthesis and no second offset
shift. Forget then request again: one new synthesis under the cleaned key.
If real Chinese word timing is unavailable, report sentence fallback and
exercise exact coordinate cases through a clearly labeled transport stub.
Use controlled, restored Standard/Premium stubs to confirm the copied
native segment keeps metadata, gets cleaned text and returns original
coordinates. No paid request is permitted.

Normal requests, Prefetch and Handoff share preparation; concurrent
original-offset sharing, held misses, samples and reader death across a
worker await also have host tests. Separate those results from any route
actually exercised live. Samples remain unchanged.

### 5. Replacement edits compare the cleaned text

While the fixture reads or is paused, use a fixture-only row `中 文` →
`中文`, then remove it. Ensure the held current/ahead speech stays equal
to preparation of the actual Segment (`中文。` for `中 文。`), and
`diagnostics.replacements().readers[].lastEdit` reports no change for
unchanged held text; no fresh audio solely because the rows differ. Use
stable, already-fetched clips and distinguish inflight invalidation (which
is intentionally conservative). A row to `甲 乙` must instead refresh the
changed clip. Confirm that the native pause/resume and current voice are
unchanged. An entirely empty Read as returns a silent pause with
`speechText:""`, not a missing speech identity.

### 6. Cleanup and baseline comparison

Restore transport/probe wrappers. Close and erase the fixture, remove only
its position/document-voice/Replacement records and account for every new
row. Restore preferences and user-value flags, reading memory last among
reading preferences; restore any observer-re-stamped sync metadata after
those writes. Confirm quiet transports, exact document-voice map, original
reader tabs/selection, volume/debug/minimized state and no fixture data
before restoring the original WebDAV switch. Finish
[playback 3.26](playback.md#326) and compare error contents with baseline.
A failed restoration is a blocker, not a PASS.

### 7. Human-only judgments

Whether the Chinese voice now sounds fluent and the moving word highlight
feels aligned require listening and watching. Record these as NOT TESTABLE
by the bridge; do not infer them from correct text or a static screenshot.
