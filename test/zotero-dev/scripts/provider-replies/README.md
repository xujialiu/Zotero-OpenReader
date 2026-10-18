# Scripts: provider replies read as what they are (issues #198, #199, #200, #201, #202)

[Case](../../cases/provider-replies.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

A local stub stands in for OpenAI Compatible: `.tmp/zotero-dev/provider-replies/stub-server.py`
on `127.0.0.1:8765` (killed at cleanup). Behavior per request comes from `stub-state.json`
(rewritten from the tester's side between scripts): `voices_status`/`voices_body`,
`speech_status`/`speech_type`/`speech_file`/`speech_body`, `speech_mode` ok/fail/delay,
`speech_match_voice` + `speech_match_text` (a flip during a held delay hits the in-flight request).
Every request is logged to `stub-log.jsonl` with the `input` length. The stub MP3 is
`ffmpeg -f lavfi -i "sine=f=440:d=2" -codec:a libmp3lame -ar 24000 -ac 1` (an `Info` frame at its
start). The section points at the stub with the key empty (voice-switch `194-00` does the same
write; the section's original values and user flags are restored by `_shared/restore-fix4.js`).

| Script | Checks | Expected | Params |
| --- | --- | --- | --- |
| `pr-01-gateway-502.js` | Item 1a: voices answer 502; a fixture whose Document voice is a compatible voice opens with the toast `Cannot reach OpenAI Compatible. This document keeps its voice: …`; the catalog lists zero compatible voices | pass true | `fixturePr1`, `stubLog` |
| `pr-02-gateway-404.js` | Item 1b: voices 404 → the Player's OpenAI Compatible entry lists OpenAI's eleven (the manager's `allVoices` after a popup reopen) | pass true | — |
| `pr-03-login-page.js` | Item 2: voices 200 (one voice), speech 200 `text/html` — Test connection reports the web-page refusal and Enable leaves the section off. Needs the settings window (opened in-script; click+poll in one script) | pass true | — |
| `pr-04-long-segment.js` | Item 3: a Segment over 4,096 characters splits — the stub log shows pieces each ≤ 4,096; the Segment plays; the joined clip is about 4 s, not 2 s | pass true | `fixtureLong`, `stubLog` |
| `pr-99` | Cleanup: the section restored, fixture items and their document-voice records gone, stub killed | — | — |

Run notes (2026-10-18, 1.16.12-beta6):

- 1a PASS: toast text exact; 0 compatible catalog rows under 502. 1b PASS: exactly
  alloy…verse (11) under 404 (the Player's `allVoices`; the pane's browser listing keeps its own
  cache and is the weaker oracle).
- 2 PASS with a case-text correction: the check is two-stage and reports
  `Connected, but synthesis failed: OpenAI Compatible speech: the server answered with a web page
  (text/html), not audio. Is a login page in front of it?` — not `Connection failed: …`. Enable
  leaves the section off. (Start the check with the section OFF — the button is then "Enable".)
- 3 PARTIAL: the split is proven at the request level — a 5,000-character Segment produced
  requests of 4,094 + 906 characters (each ≤ 4,096) under the compatible voice — but the
  joined-clip playback (~4 s `clipDuration`, no `Playback failed`) was not captured live: the
  memory-sync re-applies the session voice at every activation and the compatible pick could not
  be held through playback here (three fixture builds; the memory seed races the same way).
  `joinMp3` is unit-covered (`test/core/providers/split-text.ts`). Fixture shape that works: one
  paragraph, one page, font 7-8 — the segmenter cuts a paragraph that crosses a page break, and
  the extracted segment runs ~56-84% of the source characters, so aim the paragraph at ~7,400
  characters for a 4,097-5,000-byte segment.
- 4 (Azure, #200, #202): NOT TESTABLE live — needs a wrong key in the owner's Azure section;
  unit-covered by `test/core/providers/azure.test.ts`.
- Pick races: `selectTier` during the popup's first listing is dropped; the memory-sync
  re-applies the memory voice at every activation — the memory seed (a compatible voice) is the
  reliable route, and the section must be ENABLED or its tier is not in the player's list.
