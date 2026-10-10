---
status: accepted
date: 2026-10-05
issue: 167
---

# Zotero-OpenReader keeps its installed identity

*Product decision: [0014](../design/0014-zotero-openreader-keeps-its-installed-identity.md).*

*The name inside Zotero is superseded by
[0016](0016-the-plugin-is-openreader-inside-zotero.md): there the plugin is
`OpenReader`, the manifest name and dialog titles included.*

*The release download's name is superseded by
[0017](0017-the-download-carries-the-plugins-name.md): from the release
after 1.16.8 it is `Zotero-OpenReader.xpi`.*

The owner expanded issue #167 from a repository rename to a display-name
rename too: both become `Zotero-OpenReader`. This supersedes issue #20's
choice of `Zotero-TTS` as the current display name, not its distinction
between display names and compatibility identifiers. The owner's follow-up
keeps the settings sidebar label short: `OpenReader`. Documented settings
paths use that label; the manifest name and dialog titles retain the full
product name.

Keep the installed identity and storage contracts unchanged: the plugin
ID `zotero-tts@xujialiu.top`, preference keys, backup format, sync file
names, and `zotero-tts.xpi`. Internal identifiers and the local checkout
path are not part of the rename. Existing installations must remain the
same plugin with the same settings and update path.

Move current repository and public-site addresses to the new name. Keep
historical notes unchanged. Never create a repository at
`xujialiu/Zotero-TTS`: doing so would remove GitHub's redirect and break
the update address shipped in older installations. Issue #167 records
the 2026-10-03 trial: the redirected raw update URL answered 200, the
release asset URL answered 301, and the renamed Pages path did not inherit
a redirect.

The owner also approved adapting the personal homepage to forward old
documentation paths, subject to verification after the rename, and
registering the new Search Console property. Commits and pushes needed
for the rename are authorized; a plugin release is not part of this work.
