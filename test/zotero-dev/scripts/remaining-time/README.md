# Scripts: estimated remaining reading time (issue #152)

[Case](../../cases/remaining-time.md) · [Checklist](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-isolate.js` | Preinstall baseline and dedicated test WebDAV isolation | Destination matches, transports settle, no owner readers, original named prefs/native voice/host state captured, host minimized | none; `state.baseline`, `state.isolation` |
| `01-stable-time-fixtures.js` | Deterministic EPUB setup and title/path copy of Four Thousand Weeks | 180 deterministic segments; original title found by lookup; temporary copy has 3,046 segments and the introduction sentence at body index 332; both sessions explicitly select the offered local voice and pause | `deterministicBaseURL`; `state.fixtures`, `state.docSamples`, temporary pref/native snapshots |
| `04-clocks-requests-performance.js` | Audio clock, paused freeze, speed, configured gap, skip, completion/replay, snapshot requests and performance | Finite pause delta 0; moving audio clock; 2× ratio; finite gap pause bounded; forward finite decrease; finished/0 then fresh ready; 500 snapshots under 2,500 ms with no new requests | `deterministicBaseURL`; `state.clockResults` |
| `05-stable-document-production.js` | Fish production stability on Four Thousand Weeks body prose | English Fish voice explicitly selected; readiness has ≥3 samples and ≥8 original audio seconds; ≥30 s post-readiness listening; same-section Doc/Section nonincrease and ≤1.5× listening delta; pause/resume envelope holds; slower speed increase allowed; snapshots add no requests | `state.fixtures.book`; `state.stableResults` |
| `06-buffering-stability.js` | Delayed deterministic response and read-ahead buffering | A ready finite display remains finite and unchanged while a later uncached response is inflight; listening/playback clocks hold; resumed decrease is ≤1.5× listening delta | `deterministicBaseURL`; `state.bufferingResults` |
| `07-rendered-time-line.js` | Rendered diagnostic/text agreement at normal and narrow width | Visible one-line 16 px `Doc <N min · Section <M min>` agrees with diagnostic values; line fits at 687 px viewport; repeated reads add no requests | `state.fixtures.book`; `state.renderedResults` |
| `99-cleanup-restore.js` | Fixture/position teardown and full restoration | Readers closed; temporary items erased; position rows return to baseline; temp prefs/native voice/volume and original WebDAV destinations match; transports idle; host minimized | prior `state.*` |

Before you start:

- Install the exact XPI from the brief, list before/after, and run startup diagnostics before opening readers. This run used `1.15.2-beta12`, SHA-256 `1052630718cd42f437e7e70e9c9194e731b8f22dd81333f42e9fb8fae5c6d295`.
- Run `00` first. It uses `~/.secrets/Zotero-TTS/test_webdav.txt`, suspends the three plugin WebDAV switches, snapshots named state, and leaves Zotero minimized.
- Start `remaining-time-deterministic-server.mjs` on `127.0.0.1:8769`; stop it after `99` completes. Volume is muted before any playback and restored exactly.
- `01` imports a temporary deterministic EPUB and a temporary attachment copied from the item titled `Four Thousand Weeks`; it never opens or changes the original item.
- Reader initialization, player opening, voice selection, geometry, and trusted playback restore the host temporarily; every script minimizes it again. `99` erases fixture items and positions before restoring WebDAV.

Limits:

- The title/contents opening of Four Thousand Weeks is excluded from numeric stability evidence; body prose starts at the recorded body index.
- Fish stability uses the configured English Fish voice and muted output. Subjective voice quality and visible highlight motion remain human checks.
- CJK/mixed-script eligibility, numeric-only rejection, outlier resistance, exact short ranges, and virtual stalled-clock cases are unit-test evidence only.
- The numeric delayed-response check pauses the manager before its finite before/after snapshots; unpaused buffering freeze remains unit-test coverage. Failed setup/voice-selection attempts are retained in scratch results and their errors are timestamp-classified against the isolation start (plugin columns `6479`/`10787`, reader column `2193`).
- The broad `01-identity-settings.js`, `02-epub-scope-and-fallback.js`, `03-ui-setting-layout.js`, `05-voice-recalibration-production-smoke.js`, and `06-selection-buffering-longdoc.js` scripts remain available from the prior beta6/beta8 passes. Their old text-prior assertions are historical and were not rerun in this focused beta12 pass.

Runs:

| Run | Build and artifact | Result/evidence |
| --- | --- | --- |
| 2026-09-26 | `1.15.2-beta6`, XPI SHA-256 `fe8045caa0d2f2f6c11eadd9dcdb741c7486120c9e6ab7f6148ea07769d53bd5` | Prior `00`/`01`/`02`/`03`/`04`/`05`/`06`/`99` PASS; [original beta6 field-by-field evidence](https://github.com/xujialiu/Zotero-TTS/issues/148#issuecomment-5845140879). |
| 2026-09-27 | `1.15.2-beta8`, XPI SHA-256 `44f9ef22519e9e144f0ff4d48284003ddf69b5f621533a8f8d1ce723d0daa5fb` | Prior `00`/`01`/`02`/`03`/`99` PASS; clock/provider/selection suites were historical and not rerun for beta8. |
| 2026-09-27 | `1.15.2-beta12`, XPI SHA-256 above | Focused `00`/`01`/`04`/`05`/`06`/`07`/`99` PASS; follow-up `04` proves Bella→Heart reset, follow-up `05` uses body index 332 with strict cross-section/clock bounds, and follow-up `06` proves finite paused delayed read-ahead. Full results are under `.tmp/zotero-dev/2026-09-27-1.15.2-beta12-*`; [field-by-field verification and error audit](https://github.com/xujialiu/Zotero-TTS/issues/152#issuecomment-5853596504). |
