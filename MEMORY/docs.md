# Docs — Zotero-OpenReader

Read before editing repository Markdown or the public site, or recording a
decision. Shared policy comes from `MEMORY/MEMORY.md`. Choose the document's
reader first; then follow only the writing branches that apply.

## Put each kind of knowledge in its home

Settled 2026-09-23, ADR 0004, following OpenReader's organization:

| Home | Reader | Content |
| --- | --- | --- |
| `docs/design/` | The owner, without reading code | Product choice, rejected alternative and cost |
| `docs/adr/` | Engineers and agents | Technical decision and the facts that forced it |
| `notes/` | A later session | Verified findings, measurements and dated incidents |
| `CONTEXT.md` | Everyone | Terms, definitions and words to avoid |
| GitHub issues | Whoever works the change | The running log of one piece of work; policy in `MEMORY/issues.md` |

Write a settled term, finding or qualifying decision in its home when it
settles, whether in a grill, an issue plan or chat. A finding is not a
decision: the note says what was seen; the ADR says what was chosen.

### Decision records

A choice earns a record only when all three hold: reversing it would be
costly, a future reader would wonder why, and there was a real alternative.
A finding with no choice is a note; a choice missing a criterion needs
neither record.

- **Design:** new writing for a person who does not know the code, not an
  ADR translation. Explain what each alternative would make them see,
  lose or do. Keep API names, paths, types, libraries, version numbers,
  code fences and stack traces in the ADR. Strip those from a sentence:
  if it stops making sense, it is an ADR sentence. Start readers at
  `docs/design/README.md`. Design files have no front matter; status
  lives once, in the ADR.
- **ADR:** record what was done and the forcing facts, citing Zotero
  internals by file and line. Front matter has `status` (`proposed`,
  `accepted`, `superseded by NNNN`), `date`, and `issue` when applicable.
  Preserve measured details when moving or rewriting records: Zotero's
  compressor turns a +6 dB boost into +3 dB; a Kokoro-FastAPI server
  returns the words of a text it rewrote. An apparently needless caveat
  may be the record's most valuable scar.
- **Pairing:** four-digit decision numbers shared by `docs/design/NNNN-…`
  and `docs/adr/NNNN-…`, with the same slug where natural. Each paired
  half opens with an italic pointer to the other. Purely technical or
  product decisions may have one half; gaps are valid. Use the highest
  number in either folder plus one. One number never names two decisions.
  Retired `notes/DECISIONS.md` became records 0001–0003.
- **Publication:** records are English, hard-wrapped, untranslated and
  off the public site. `npm run docs` previews them. Translation checks
  cover docs/'s top-level pages, not its decision-record subfolders.

### Glossary

`CONTEXT.md` holds a term, its meaning and words to avoid: no implementation,
decisions or scratch notes. Move a sentence explaining how something works
into an ADR. Use the glossary's terms strictly in code, issues and docs.

### Findings log

Append to `notes/NOTES_<date>.md`, one file per day; preserve past days.
Start a new day with the existing `#` title and `←/index/→` shape. Stamp
**every heading** with the date and local 24-hour time, for example
`## The voice list is a per-tab snapshot (2026-08-30 14:32, issue #11)`.
Older entries from before 2026-08-30 keep their date-only headings. Add each
new entry to that day's index in `notes/NOTES.md`.

## User-facing text: effect first

Say what the reader gets or must do, and the cost or limit they will meet;
keep the mechanism out. This rule also governs settings-pane text through
`MEMORY/code.md`. A key stored in plaintext, a cache a restart empties, one
WebDAV folder per computer, or a voice sounding different at speed is a
user-visible limit and belongs. Patched APIs, fallback internals, numbers
behind a default, color hex values, endpoint paths and internal refusal
reasons belong in `notes/NOTES.md` (settled 2026-09-07).

### README, tutorials and public site

- **README:** short and scannable — badges, GIF, emoji feature list,
  install, providers table, settings. Put long detail in `<details>` or
  `tutorials/`. State multiple facts as separate bullets led by their
  field, case or setting in bold or italics. Prose carries one thought:
  a lead, caveat or tutorial pointer, not several facts to comb through.
- **Tutorials:** provider/server how-tos belong here, including Azure's
  free tier, Kokoro-FastAPI and Chatterbox-TTS-Server in Docker, and
  Cloudflare remote access.
- **Site:** README, `docs/PHILOSOPHY.md` and `tutorials/`, in both
  languages, publish at https://xujialiu.github.io/Zotero-OpenReader/.
  `npm run site` builds `site/`; the Pages workflow deploys relevant
  `main` pushes (issue #57). Notes and the test checklist stay off-site;
  public links to them go to GitHub.

## Chinese translations

`README.zh.md`, `docs/PHILOSOPHY.zh.md` and `tutorials/<name>.zh.md` are
siblings of their English sources (issues #29, #109). Follow this section
when translating; `.agents/docs-translator.md` supplies the procedure.
Delegation ownership is defined in `MEMORY/agents.md`.

- **One-to-one:** preserve sections, order, `<details>`, tables, links
  and images. Both languages have a switcher at the top. The only added
  content is a `> **国内网络**` tutorial blockquote where the English would
  mislead a reader in China: Docker Hub, ghcr.io or Hugging Face mirrors,
  or global Azure versus 世纪互联.
- **Quote interface labels:** use the plugin's
  `addon/locale/zh-CN/zotero-tts.ftl` and Zotero's zh-CN locale in
  `omni.ja`: 朗读, 语音模式, 本地 / 标准 / 高级. For third-party steps,
  read that site's own Chinese interface where available — Fish Audio's
  开发者 → API 密钥 → 创建 API 密钥, not a fresh translation
  (2026-10-09). Keep English labels if the site has no Chinese interface.
  Leave an unsourced label in English and report it.
- **Keep identifiers:** product names, voice ids, pref keys, file names,
  shortcuts and code blocks stay English. Product naming follows
  `CONTEXT.md`; naming changes also trigger `MEMORY/identity.md`.
- **No hard wrapping:** one paragraph, list item or blockquote per line.
  A break between CJK characters renders as a space in Chrome and Safari
  (2026-09-04: 164.45px wrapped, exactly the width with an explicit space,
  against 160px on one line). Drop a space next to `**`, `*` or `[` when
  both sides are CJK; keep spaces around inline code and Latin.
- **Pin after translating:** the first line is
  `<!-- translated-from: X.md sha256:… -->`. `npm run docs:pin` writes
  it only once the translation is current. The translation ships in the
  same commit as its English change; `test/docs-translation.test.ts`
  detects stale or missing pages, preventing a stale build or release.

## Finish a Markdown change

1. Review the diff for the applicable audience, rule coverage, wrapping
   and working pointers. English Markdown is hard-wrapped; Chinese pages
   follow their exception above. GitHub bodies have their separate rule
   in `MEMORY/issues.md`.
2. Run `npm run docs` after repository Markdown changes. It renders the
   configured default set into gitignored `.docs/`. Pass additional paths
   with `npm run docs -- <files...>` for entry points or hidden agent
   workflows outside that set; previews mirror source paths.
3. Report which `.docs/….html` files to open. For translated pages, also
   complete the dedicated translation checks in their workflow.

A preview render is not a plugin build. Ordinary documentation changes
stop here; full verification, `finish worktree` and release keep their
explicit checks under `MEMORY/MEMORY.md` and `MEMORY/git-workflow.md`.
