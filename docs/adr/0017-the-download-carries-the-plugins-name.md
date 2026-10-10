---
status: accepted
date: 2026-10-09
issue: 177
---

# The download carries the plugin's name

*Product decision: [0017](../design/0017-the-download-carries-the-plugins-name.md).*

From the first release after 1.16.8, the release asset, and the file
`npm run build` writes, is `Zotero-OpenReader.xpi`: the name a person reads
outside Zotero (0014, 0016). This supersedes the one clause of 0014 and
0016 that listed `zotero-tts.xpi` with the installed identity. The rest of
that identity is unchanged: `zotero-tts@xujialiu.top`, the
`extensions.zotero.zotero-tts.*` prefs, the backup and sync formats, the
`[zotero-tts]` log prefix, and the bundle `content/zotero-tts.js` and the
`.ftl` files inside the xpi, which nothing outside it reads.

Nothing outside reads the file's name either:

- Installed copies download whatever `update_link` names in `update.json`,
  which `scripts/release-point.mjs` writes from `releaseLink`
  (`scripts/release-lib.mjs`). A copy on 1.16.8 is offered the new link
  like any other.
- Both plugin stores that list the plugin, zotero-chinese's and the
  Zotero Addons plugin's, take it from `syt2/zotero-addons-scraper`, which
  picks a release's asset by its content type `application/x-xpinstall`
  (`src/zotero_scraper/config/constants.py`, `XPI`), not by its name.
  `gh release create` uploads a `.xpi` with that type; v1.16.8's asset
  carries it.
- Zotero installs a chosen or dragged file whatever it is called.

The published releases keep their `zotero-tts.xpi`: zotero-chinese's
catalog (`src/plugins.ts`, as of 2026-10-09) links v1.16.6's and v1.16.8's
assets by URL and v1.16.5's by `assetName`, and download links saved
anywhere else would break.

## Rejected

- **`zotero-openreader.xpi`.** The old file's lowercase style, but a
  person reads a file name, and outside Zotero the plugin is
  `Zotero-OpenReader`.
- **A version in the name** (`Zotero-OpenReader-1.17.0.xpi`). A different
  file every release: the README's download line would have to name a
  pattern, and `releases/latest/download/<name>` would have no fixed
  target.
- **Renaming the published assets.** It breaks the links above for no
  reader's gain.
