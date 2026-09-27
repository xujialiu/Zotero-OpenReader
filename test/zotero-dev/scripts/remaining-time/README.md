# Scripts: estimated remaining reading time (issue #150)

[Case](../../cases/remaining-time.md) · [Checklist](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-isolate.js` | Preinstall baseline and dedicated WebDAV isolation | Test destination matches; transports settle; OpenReader Position absent; original prefs, native memory, reader/session and host bounds recorded; host minimized | none; writes `state.baseline`, `state.isolation` |
| `01-identity-settings.js` | Beta identity, startup, default-on setting and EN/ZH source keys | beta8 startup has no failed steps; XPI source/hash match; checkbox checked with no user value; all shipped remaining-time keys present | `root`, `xpiPath`, `xpiSHA256`, `expectedVersion` |
| `02-epub-scope-and-fallback.js` | Real nested outline boundaries, controlled introductions/invalid refs, and outline-free PDF | 180 segments; Part 1/2 at 0/90; Chapter 1/2 switches at nested boundaries; same-start entries choose deepest title; last section reaches document end; invalid/unordered/crossing refs and PDF expose document scope only | `deterministicBaseURL`; writes `state.fixtures`, `state.scopeResults`, position baseline |
| `03-ui-setting-layout.js` | Toggle during paused reading, compact text, bars/floating layouts, widths, menu and drag geometry | toggle preserves active/paused; one 16 px line; bars 34 px with time after volume; floating 128/222 px with time above controls; long headings keep generic labels; `<1 min` and `Finished`; normal/narrow line and in-viewport menu/drag | `deterministicBaseURL`; `state.fixtures.epub`; writes `state.uiResults` |
| `04-clocks-requests-performance.js` | Audio clock, pause/gap/speed/skip/completion, no display synthesis and snapshot performance *(last run beta6; not rerun beta8)* | paused delta 0; playback clock moves; 2× halves estimate; gaps drop; finish `0`; fresh Play estimate; 500 snapshots under 2,500 ms with no requests | `deterministicBaseURL`; `state.fixtures.epub`; writes `state.clockResults` |
| `05-voice-recalibration-production-smoke.js` | Player voice picks, paused handoff and configured Fish smoke *(last run beta6; not rerun beta8)* | Bella clip, paused Heart handoff, listed Fish Dax clip and audio running | `deterministicBaseURL`; writes `state.voiceResults`, `state.fixtures.voice/production` |
| `06-selection-buffering-longdoc.js` | Selected-text start, bounded `setSegments`, delayed-audio freeze and long-document performance *(last run beta6; not rerun beta8)* | UI selection starts document scope; bounded range finishes at zero then Play returns document scope; delayed estimate freezes; long document snapshots pass | `deterministicBaseURL`; writes `state.supplementResults`, `state.fixtures.selection/buffering/longdoc` |
| `99-cleanup-restore.js` | Fixture/position teardown and full state restoration | run fixtures erased; rows return to baseline; transports idle; named prefs/native memory/volume match; owner WebDAV restored; host minimized | `state.baseline`, `state.fixtures`, `state.isolation` |

Before you start:

- Use the exact XPI named by the brief. Run `00` before installation, then list/install/list and run `diagnostics.startup()` before opening readers.
- `00` reads `~/.secrets/Zotero-TTS/test_webdav.txt` inside Zotero, reports only match/length evidence, suspends the three plugin WebDAV switches, and leaves Zotero minimized.
- Start `remaining-time-deterministic-server.mjs` from this folder on `127.0.0.1:8769`; it serves deterministic local audio and must be stopped after cleanup.
- The scripts mute volume before playback and restore the original value/user flag. Native voice memory is restored byte-for-byte last.
- `02` closes an owner paused player only because provider/voice isolation is required; it leaves that reader tab open, inactive, paused, and its popup closed.

Limits:

- The compact line intentionally uses generic `Doc`/`Section` labels; subjective voice accuracy is outside this kit.
- This beta8 pass did not rerun the clock, provider smoke, selection, buffering, or long-document suites; the reusable beta6 scripts remain available and are marked above.

Runs:

| Run | Build and artifact | Result |
| --- | --- | --- |
| 2026-09-26 | `1.15.2-beta6`, XPI SHA-256 `fe8045caa0d2f2f6c11eadd9dcdb741c7486120c9e6ab7f6148ea07769d53bd5` | `00`/`01`/`02`/`03`/`04`/`05`/`06`/`99` PASS; [original beta6 field-by-field evidence](https://github.com/xujialiu/Zotero-TTS/issues/148#issuecomment-5845140879). |
| 2026-09-27 | `1.15.2-beta8`, XPI SHA-256 `44f9ef22519e9e144f0ff4d48284003ddf69b5f621533a8f8d1ce723d0daa5fb` | `00`/`01`/`02`/`03`/`99` PASS; no NOT TESTABLE rows. Handoff table to issue #150 is pending the main session. |

The beta8 UI evidence predates the follow-up font-size adjustment and must not be used as beta9 evidence for that change.
