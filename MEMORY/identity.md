# Identity — Zotero-OpenReader

Read before changing product names, installed identifiers, repository
addresses or release asset names, including provider/voice display names.
`CONTEXT.md` defines the plugin and app;
this file governs where their names appear and which identities survive.

## Display names

- **Outside Zotero:** `Zotero-OpenReader`, with that hyphen and
  capitalization, in README, tutorials, issues, commits, notes and the
  rule book (2026-10-05, issue #167, ADR 0014; supersedes issue #20).
- **Inside Zotero:** `OpenReader` in every locale — the manifest `name`
  shown by Tools → Plugins, Settings sidebar, dialog titles, Player,
  notices and errors (2026-10-07, issue #176, ADR 0016; supersedes #167's
  full name there). Document settings paths as `Settings → OpenReader`;
  directions to the installed plugin use the name Zotero shows.
- **About → GitHub:** `Zotero-OpenReader` (2026-10-23). The link leads
  to GitHub, where `OpenReader` is also the phone app's repository.
- **The phone app:** bare `OpenReader` in repository prose. Inside
  Zotero, call it the OpenReader app on your phone.
- **TTS:** the technology, not the plugin. Use neither `Zotero TTS` nor
  bare `TTS` as the plugin's name.

## Provider and voice labels

Each provider is its own entry in the player's provider dropdown, beside
Zotero Standard/Premium. Voices keep their own names, such as `af_bella`
under Kokoro. Issue #110 retired the Local tier and `Kokoro-` prefix;
issue #9 had retired `TTS-`. Keep those display-name retirements separate
from the lowercase installed identifiers below.

## Installed identity

Keep the lowercase `zotero-tts` identities unchanged during a display-name
sweep:

- Plugin id: `zotero-tts@xujialiu.top`.
- Preferences: `extensions.zotero.zotero-tts.*`.
- Bundle, `[zotero-tts]` log prefix and `zotero-tts-pane` id.
- `zotero-tts-settings` backup format and `package.json`'s npm name.

Renaming these can discard users' settings or break updates. Historical
records, fixture content, local paths and the test-secret directory keep
their old names.

## Repository and downloads

- **Release download:** `Zotero-OpenReader.xpi` from the release after
  1.16.8 (2026-10-09, issue #177, ADR 0017). Already published releases
  keep `zotero-tts.xpi`; the download name is not an installed identifier.
- **Old repository name:** keep `xujialiu/Zotero-TTS` unused forever.
  Installed copies depend on its redirect for updates.
- **Plugin store:** zotero-chinese.com scrapes the name from a release's
  `manifest.json`, so no separate name submission is needed. Its repository
  address comes from the plugin's entry under `addons/` in
  `syt2/zotero-addons-scraper`.

A naming change is complete when all relevant display surfaces agree,
installed identifiers are preserved, and historical names remain intact.
