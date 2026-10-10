---
status: accepted
date: 2026-10-10
issue: 178
---

# A contribution is licensed once more to the author, by a box in the pull request

*Product decision: [0018](../design/0018-a-contribution-is-licensed-once-more-to-the-author.md).
The owner's decisions of 2026-10-10 are issue #178's plan comment. The same
decision for the app is OpenReader's ADR 0076
(`xujialiu/OpenReader`, `docs/adr/0076-a-contribution-is-licensed-once-more-to-the-author.md`),
which holds the sources quoted only in summary here.*

## The decision

A contribution is accepted on the terms in `CONTRIBUTING.md`:

- The contributor keeps the copyright.
- Everyone receives the contribution under AGPL-3.0, version 3 only, the
  license in `LICENSE` and `package.json`'s `AGPL-3.0-only`.
- Xujia Liu receives a second copyright license: perpetual, worldwide,
  non-exclusive, no-charge, royalty-free and irrevocable, to reproduce,
  prepare derivative works of, publicly display, publicly perform, sublicense
  and distribute the contribution under any license terms.

The terms are OpenReader's, clause for clause. The Work and the Maintainer's
description name Zotero-OpenReader, the spelling is American as all of this
repository's prose is (`licence` → `license`), and one sentence before the
clauses says they are OpenReader's terms. Compared word by word on
2026-10-10 after those substitutions, nothing else differs. One set of
terms means a contribution that moves from the plugin into the app stands on
the same footing there, and one legal review covers both repositories.

They apply to every contribution to the repository, documentation included,
not only to the files the app copies today: what the app copies changes, and
a contributor cannot be asked again later.

Agreement is a ticked box in `.github/pull_request_template.md`. The pull
request is the record. There is no bot, no signature file and no third-party
service. The terms are in English only, one binding version; `README.zh.md`
points at the English file.

## Why AGPL-3.0 alone is not enough

OpenReader copies `src/core/providers/` and `src/core/webdav.ts` (its
`src/core/sync/webdav.ts`) from this repository, by its ADR 0013, into an app
the author distributes on the App Store, where reading aloud is a one-time
purchase (its design 0075).

`LICENSE`, section 10: "You may not impose any further restrictions on the
exercise of the rights granted or affirmed under this License." Apple's
Standard EULA licenses an app for use "on any Apple-branded products that you
own or control" and forbids its transfer and redistribution; the Free Software
Foundation holds that the store's terms "impose restrictive limits on use and
distribution" the GPL family does not allow; VLC's iOS port was withdrawn in
January 2011 after one of its developers complained to Apple, and came back
in July 2013 only after relicensing. OpenReader's ADR 0076 quotes each, read
on 2026-10-10.

A sole copyright holder is not a licensee of his own work, so section 10 does
not reach the author while every line is his. On 2026-10-10, before this
issue's commits, `git log` shows 725 commits, every one authored by Xujia Liu
under one address (719 as `xujialiu`, 6 as `LIU, Xujia`; five of them
committed through GitHub's web interface). The repository has two forks,
`anupamme/Zotero-TTS` and `porom004/Zotero-TTS`, and has had two pull
requests from outside, #168 and #171, both closed without a merge. The issues
opened from outside (#8, #13, #50, #73, #130, #145) carry logs, diagnostics
and, in #50, an example API request; none carries code.

## What stays Zotero's

`src/core/engine/time-stretch.ts`, `speech-chain.ts` and `word-onset.ts` hold
code copied from Zotero 10.0.3 under the Corporation for Digital
Scholarship's copyright notice (ADR 0006). The terms reach only what a
contributor writes; they give no one a license to Zotero's code, and those
files are not among what the app copies. `git log` cannot show this: the
copies were committed by the owner. The one shape from Zotero in the layer the
app does copy is `Timestamp` in `src/core/providers/types.ts`, four numeric
fields copied "verbatim from native Zotero" so word timings pass to Read Aloud
unconverted; the app carries it in its own `types.ts`.

## The read loop #169 shared with #168

#168 (`anupamme`, "Automated security fix by OrbisAI Security") was opened on
2026-10-03 at 04:27 UTC. #169's fix, 3a9fab0, was committed on 2026-10-04 at
02:16 +0800, about 14 hours later, while #168 was still open. Its `readText`
held seven of #168's added lines, in #168's order:

```ts
const decoder = new TextDecoder();
let text = '';
let total = 0;
for (;;) {
total += value.byteLength;
text += decoder.decode(value, { stream: true });
return text + decoder.decode();
```

and #168's cap, 10 MiB. OpenReader's ADR 0076 counts three of these lines;
the fourth to seventh were missed there. OpenReader's own copy has none of
them: it still reads a reply with an unbounded `response.text()`, so #169's
fix is the one most likely to be copied next.

fe56656 rewrote the loop: the chunks are kept as they come, their sizes
summed by `length` against `WEBDAV_MAX_REPLY_BYTES`, and the text decoded
once at the end, through `joinBytes`. Compared line by line on 2026-10-10,
no line of #168's diff is left in `src/core/webdav.ts` but closing braces.
The cap stays, and the comment on `WEBDAV_MAX_REPLY_BYTES` still credits #168
with proposing it. The 54 tests of `test/core/webdav.test.ts` pass unchanged,
"decodes a multi-byte character split across chunks" among them. Live on
2026-10-10, 1.16.10-beta on Zotero 11.0-beta.1, items 1, 4 and 7 of the
`webdav-reply-bounds` case passed: a real download and listing against the
test WebDAV (83 ms, all 60 items parsed, no `TypeError` or `Permission
denied` from the sandbox), and a chunked reply past the cap refused in 26 ms,
the connection closed after 15,466,496 bytes. Items 2, 3, 5, 6 and 8, whose
paths the rewrite left alone, were skipped by the owner's choice.

#171 left nothing: its one line found in the file is the doc comment of
`normalizeWebDAVURL`, which it rewrote and which dates from f6daf97
(2026-08-23).

## Alternatives

As OpenReader's ADR 0076 weighs them, and two of this repository's own:

- **A public exception**, as in `nextcloud/ios`. Anyone could then ship a
  copy on the App Store, and it covers that store only.
- **A grant limited to app stores.** New legal wording, and a change of
  license or a store with other terms would need every contributor's consent
  again.
- **No outside code**, **a CLA bot**, **the Developer Certificate of Origin
  alone**, **copyright assignment**: as there.
- **Terms only for the files the app copies.** Asks less of a contributor to
  the rest, but the copied set moves.
- **`readText` left as it was**, its lines called stock. Nothing to do now,
  and an open question in the file the app will want.
- **#168's author asked to agree after the fact.** It waits on a stranger,
  for a pull request an automated tool wrote.
- **A clean-room rewrite** by an agent that never saw #168. For a loop of
  seven lines a different expression was judged enough.

## Consequences

- **The box is checked by hand.** GitHub does not refuse a merge whose box is
  empty. `MEMORY/git-workflow.md`, "Outside contributions", says what a
  session checks before it merges.
- **Lines from a pull request that was not merged stay out**, and so does
  code pasted into an issue from outside; the problem they point at is fixed
  in new code.
- **The terms are agreed as they stand.** A pull request agrees to
  `CONTRIBUTING.md` as `main` has it when the box is ticked; `git log` keeps
  every version.
- **The patent license names the Work**, Zotero-OpenReader, as the Apache
  agreement names its own. Whether it reaches a contribution copied into the
  app is a question for the legal review.
- **No lawyer has reviewed the terms.** That should happen before the first
  outside contribution is merged.
- **GitHub offers `CONTRIBUTING.md` and fills in the template** on a new pull
  request only once both are on the default branch.
