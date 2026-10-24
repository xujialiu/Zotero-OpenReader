# Project rules — Zotero-OpenReader

This is the version-controlled project rule book, not session memory.
Read it in full every session. Paths are relative to the repository root
unless a pointer says otherwise. Zotero-OpenReader is a Zotero 10 plugin;
current capabilities and provider setup are documented in `README.md` and
`tutorials/`.

## Read by task

Read each triggered topic in full **before** doing its work. Its rules bind
that work as much as this file's do. A pointer to a named reference section
loads that section, not unrelated reference material.

| Trigger | Read |
| --- | --- |
| Edit repository Markdown or the public site; record a decision | [Docs](docs.md) |
| Find a bug; start a feature needing a design decision; start or resume issue work, including research/verification; operate on an issue | [Issues](issues.md) |
| Change `src/`, `addon/` or `test/`; inspect Zotero source or its profile | [Code](code.md) |
| Build a test xpi; verify a change; drive Zotero through zotero-dev, including research | [Testing](testing.md) |
| Delegate; perform an agent's role yourself; edit a definition or workflow | [Agents](agents.md) |
| Commit, merge, push, tag or release; merge an external PR; copy code into this repo or into OpenReader | [Git](git-workflow.md) |
| Change product/provider/voice display names, installed identifiers, repository addresses or release asset names | [Identity](identity.md) |

Domain references have their own branches:

- **Explore or name** — use `docs/agents/domain.md`: read `CONTEXT.md`,
  the glossary, and the area's decision records. Use its terms in code,
  issues and docs.
- **Read Aloud internals** — read `notes/NOTES.md` before touching them.
  It holds verified Zotero knowledge, open questions and the dated log's
  index. Record non-obvious findings and production incidents by
  `MEMORY/docs.md`.
- **New feature** — apply `docs/PHILOSOPHY.md`, the owner's yardstick:
  move off Read Aloud piece by piece; Zotero keeps document analysis
  (issue #109). Ask the user where it does not settle the feature.
- **Area change** — read that area's `docs/design/` and `docs/adr/`
  records before changing it. Their audiences and pairing are defined in
  `MEMORY/docs.md`.

## Work with the user

- **Language.** Reply in Chinese. Keep proper nouns, glossary terms,
  product names and technical terms in English inside those replies.
  Repository prose, code, identifiers, comments, commits and notes use
  English and American spelling. Localized product strings, Chinese
  collation fixtures and the translations governed by `MEMORY/docs.md`
  retain their language (language policy settled 2026-10-22).
- **Decisions.** For an architecture-level fork, present options, concrete
  costs and a recommendation, then wait. Pick a sane implementation
  default, state it in one line and proceed.
- **Plain words.** A solution put to the user says what it gives them,
  what it costs and what they must decide. A person who does not read
  code must be able to accept or reject it. Keep internals, identifiers,
  jargon and file/line references out of that proposal; put the mechanism
  in the issue's plan and durable findings in notes (issue #62).
- **Research means research.** When asked to research, report findings;
  leave code unchanged.
- **Authorization.** Commit only when told; push only when told. The sole
  standing commit exception is a finished branch going to `zotero-tester`:
  tests, typecheck, build, docs and notes must be complete, then commit
  before sending its verification brief. Fixes from that run get their
  own commits; the push still waits (issue #113). Apply `MEMORY/git-workflow.md`
  before any such operation.
- **Secrets.** Keep credentials out of conversation, files and tool
  results. Zotero's `prefs.js` contains plaintext keys: read only the
  exact pref needed, mask secret values before output, and never print
  whole matching lines. The pre-push history scan is in the Git topic.
- **Session boundary.** One session works one issue and ends when that
  issue closes. Batch everything needed for the current step into one
  read round. Material only a delegated agent needs stays with it; read
  its workflow yourself only when performing or editing that role
  (issue #58).

## Maintain the rule book

`MEMORY/` is authoritative for shared project policy. Give each rule one
home: universal rules here, conditional rules behind task triggers.
`AGENTS.md` is only the router; keep topic files behind pointers rather
than always-loaded imports. Role procedures live in `.agents/`.

The tester's carried rules are the intentional distribution exception:
it does not load `MEMORY/`. A change to a rule it carries must update its
corresponding `.agents/zotero-tester*.md` text in the same change. Definition
synchronization and the source/mirror contract are in `MEMORY/agents.md`.
This organization was settled on 2026-09-12 and split on 2026-09-22.

## Choose the verification tier

- **Ordinary docs, or small, straightforward label/help/format changes:**
  review the diff and finish without tests, typecheck, plugin builds,
  live verification or delegated testing unless explicitly requested.
  Markdown edits also
  require the preview render in `MEMORY/docs.md`; that is not a plugin
  build. Translations retain their dedicated workflow checks.
- **Other implementation changes:** follow `MEMORY/testing.md`.
- **Explicit full verification, `finish worktree`, or release:** keep the
  checks required by that request and its Git workflow.

Find command definitions in `package.json` rather than maintaining a
second command list here. Use Node 22 for the project commands.
