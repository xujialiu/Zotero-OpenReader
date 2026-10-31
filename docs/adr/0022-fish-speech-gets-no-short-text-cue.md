---
status: accepted
date: 2026-10-31
issue: 99
---

# Fish Speech gets no short-text cue, and Fish Audio keeps its own without the language field

*The product argument is [design 0022](../design/0022-short-stats-on-your-own-fish-speech-server-stay-as-they-are.md).
Supersedes [ADR 0002](0002-fish-speech-waits-for-a-language-source.md).*

## What there was

ADR 0001 puts `[Speak in <language>]` in front of one to three words sent to
Fish Audio (`fishLanguageHint`, `src/core/fish-language-hint.ts`; asked
for only when the provider id is `fish`,
`src/read-aloud/remote-interface.ts:368–369`).
ADR 0002 held Fish Speech (`fishspeech`) out until its voices had a
language: the server lists references by id alone
(`src/core/providers/fishspeech.ts`, `locale: MULTILINGUAL`), and
`fishLanguageHint` returns nothing for `mul`. Both rested on one sample per
arm: on 2026-09-13 the bare Fish Speech `2/50 HP` was wrong and the cued one
right.

## What was measured

On 2026-10-31 (notes/NOTES_2026-10-31.md, 13:41, 14:04 and 15:01), outside
Zotero, with the plugin's saved settings and each provider's production
request body:

- **The loop.** Fish Speech's `/v1/tts` takes a `seed` that makes its reply
  byte-identical; production sends none. Whisper large-v3-turbo transcribes
  each clip in forced English, and a per-text rule says whether the reading
  starts right; on the ten clips the owner judged by ear on 2026-09-13 the
  rule agrees 10/10. Clip length is checked separately for loops.
- **Fish Speech, reference `bella`, right readings** (seeds 1–32 per arm;
  ` 2/50 HP ` over seeds 1–64):

  | Text | bare | English cue | `[Speak naturally]` | temperature 0.3 |
  | --- | --- | --- | --- | --- |
  | ` 2/50 HP ` | 44/64 | 48/64 | 61/64 | 18/32 |
  | ` 120/120 HP ` | 25/32 | — | 14/32 | 28/32 |
  | ` 1,250 gold ` | 17/32 | — | 7/32 | 19/32 |
  | ` +15 STR ` | 24/32 | — | 24/32 | 30/32 |
  | ` 13/40 MP `, ` Status Window ` | 32/32 each | — | 32/32 each | 16/16 each |

  The English cue against bare: p = 0.56 (two-sided Fisher), and 14 of its
  16 failures fall on seeds where bare also fails. The delivery cue helps
  ` 2/50 HP ` (p = 0.00013) and worsens ` 1,250 gold ` (p = 0.019) and
  ` 120/120 HP ` (p = 0.0097). The server's sampling defaults are
  temperature 0.8 and top_p 0.8 (sending them returns byte-identical audio);
  0.5 and 0.3 move each text within noise, in both directions
  (p 0.082–1.0). `normalize: false` returns byte-identical audio to `true`:
  the server ignores it. The failures are English (Whisper's own detection)
  and blur "two" into the slash (`TWE 50 HP`), read `1,150 gold`,
  `100-120 HP`, `PLOS 15 STR`.
- **Loops.** ` 120/120 HP ` came back as about a minute of
  "100 and 100 and 100 …" in 2 of 32 clips bare, with the delivery cue and
  at temperature 0.5 alike.
- **`xiaobei`**, the server's other reference, reads the English stats with
  Chinese numerals and mostly garbled, bare and cued alike.
- **Fish Audio, Dax, `s2.1-pro-free`**, `/v1/tts/stream/with-timestamp`,
  32 draws per arm (no seed exists): ` 2/50 HP ` right 32/32 bare, 32/32
  with the shipping cue, 31/32 with `[Speak naturally]`, 11/32 with
  `language: "en"`; ` 100 exp ` 16/16, 15/16, 16/16, 16/16. September's
  fault does not reproduce. Fish's `openapi.json` now documents `language`
  on this route: used only by text normalization and word alignment, not
  passed to the model. Set to `en`, normalization reads the slash as a
  fraction, `2 50th HP` (p = 6.3e-9 against bare), the shape of September's
  `250th GP`. API credit stayed 0 and the free model stayed listed at price
  0 throughout (issue #181).

## Decision

- **Fish Speech is sent the text and nothing else.** No language cue, no
  delivery cue, no sampling change: `hintFor` stays limited to `fish`, and
  the request body at `fishspeech.ts:79` is unchanged. No lever measured
  improves these stats across texts, and some make them worse.
- **The language-source question is retired.** Even a perfect source would
  feed a cue that does not help Fish Speech here. The candidate had been
  the document's language as Zotero detects it (`sdt_segments_getSDTLang`,
  installed Zotero 10.0.6 `resource/reader/reader.js:71307`: the document's
  metadata language, else `eld` on a 2,500-character sample from the middle,
  else `en`), which the Engine could carry with each request
  (`src/read-aloud/engine/index.ts:325`).
- **Fish Audio keeps ADR 0001's cue unchanged.** It measures neither help
  nor harm today, and it answered a failure that did occur. The request does
  not send `language`.
- **The loops are recorded, not acted on.** The owner chose not to file
  them (2026-10-31). Their length makes them detectable.

## Consequences

Short numeric text read by a Fish Speech voice is still misread, at a rate
that depends on the text: 0–47% wrong across these six on `bella`, and a
minute-long loop now and then. Results belong to this server's unreported
model, mainly one reference and six texts; a model update can change them.
The loop's scripts, jobs and audio are kept outside the repository, in the
worktree's git-ignored `.tmp/fish-speech-pronunciation/`.

## Rejected

- **A language cue from any source** — the document's language, a
  per-voice language setting, the player's language: the English cue does
  not move Fish Speech.
- **`[Speak naturally]`** — it trades one stat's errors for two others'.
- **Lower temperature** — noise, both directions.
- **Rewriting `a/b` between numbers** (`2 50` read right 4/4 seeds) — it
  changes the words, covers only slash stats, and global rewriting was
  turned down in ADR 0001.
- **Fish Audio's `language` field** — it makes English normalization read
  the stat as a fraction.
