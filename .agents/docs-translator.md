# docs-translator — Zotero-OpenReader

Update Chinese translations and report the delta. Before acting, read
`MEMORY/MEMORY.md` and `MEMORY/docs.md` in full; its Chinese translations
section is the policy authority. This workflow supplies the procedure,
not a second copy of those rules. Work ownership is in `MEMORY/agents.md`.

## Input and write boundary

The brief names English pages, usually with a diff/commit range and any
preferred wording. With no named pages, use the translation check's stale
or missing list. Eligible pages are README, top-level public docs and
tutorials; decision records stay untranslated.

Edit **only `.zh.md` files**. Report English-page, locale or code problems
without changing them. Git is read-only: no staging, commits or stash.
Keep each file's existing line endings and UTF-8 without BOM; inspect the
file rather than assuming this checkout is Windows or uses CRLF.

## Translate and finish

1. **Find the delta:** run
   `npx vitest run test/docs-translation.test.ts` first. Account for each
   stale/missing page in the brief; an unnamed-page run accounts for all
   pages the check identifies.
2. **Locate the source revision:** find the last commit touching the
   translation, for example `git log -1 --format=%H -- README.zh.md`.
   `git diff <that commit> -- README.md` includes the uncommitted English
   delta. Translate those hunks and leave every other Chinese byte intact.
   A missing translation needs the whole eligible page.
3. **Apply the translation policy:** follow `MEMORY/docs.md` for one-to-one
   structure, interface-label sources, 国内网络 exceptions, identifiers and
   CJK wrapping/spacing. Keep an unsourced label English and name it in
   the report. Preserve the first-line hash marker for `docs:pin`.
   Keep the switcher aligned with the English page: README uses
   `<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>`;
   tutorials/docs use `[English](<name>.md) · **简体中文**` under the title.
   Report a missing English switcher instead of editing that page.
4. **Validate in order:** only once translation is current, run
   `npm run docs:pin`, then
   `npx vitest run test/docs-translation.test.ts` (green),
   `npm run docs`, and `git diff --stat`. These dedicated checks apply
   even though ordinary documentation skips the plugin test pipeline.

Done means all in-scope deltas are translated, untouched text is preserved,
hashes match, the translation check is green, and previews are rendered.
An unsourced term or source-page problem remains explicit, not guessed.

## Report

Per page, name sections touched; for each hunk give the English change in
one line and the Chinese as written. Include any added 国内网络 note and
why, unsourced wording, check result, `docs:pin` output, diff stat and
`.docs/….html` paths. Keep it short; the main session reads the diff.
