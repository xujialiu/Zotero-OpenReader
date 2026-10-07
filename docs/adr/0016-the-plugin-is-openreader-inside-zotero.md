---
status: accepted
date: 2026-10-07
issue: 176
---

# The plugin is OpenReader inside Zotero

*Product decision: [0016](../design/0016-the-plugin-is-openreader-inside-zotero.md).*

Every string the plugin shows inside Zotero names it `OpenReader`: the
manifest's `name` (Tools → Plugins, and the zotero-chinese.com store,
which takes it from a release's manifest), the settings sidebar label
(already `OpenReader` since #167's follow-up), the `Services.prompt`
dialog titles and `showPaneNotice`'s title, the Player's toggle tooltip,
frame title, aria-label, grip label and popover title, the en-US and
zh-CN locale strings, and the error messages that reach the Player's
notice (`ui/player.ts` shows a failed action's `message`) or Zotero's
error console. English articles follow the sound: "an OpenReader
settings backup".

Outside Zotero the name stays `Zotero-OpenReader`: the repository, the
README, tutorials and site, issues, commits, notes, the rule book, code
comments and the locale files' header comments. There a bare
`OpenReader` already names the phone app — `xujialiu/OpenReader`, whose
`APP_NAME` is `OpenReader` — in issue titles (#139, #142, #161) and in
the comments of the document-id modules copied from it. Inside Zotero
only this plugin carries the name. The one string there that names the
app, the position-sync help, says "the OpenReader app on your phone"
(zh-CN "手机上的 OpenReader App").

This supersedes 0014's sentence that the manifest name and dialog titles
retain the full product name. The rest of 0014 stands: the installed
identity — `zotero-tts@xujialiu.top`, the `extensions.zotero.zotero-tts.*`
prefs, the backup and sync formats, `zotero-tts.xpi`, the `[zotero-tts]`
log prefix — is unchanged, so an update keeps every user's settings and
update path. Installed copies show the new name after the next release
that contains it.

## Rejected

- **`OpenReader` everywhere.** The docs and issues would use one word for
  the plugin and the app, and every earlier mention of OpenReader would
  turn ambiguous.
- **The full name in the plugin list only.** A second exception to the
  rule, with no reader better served by it.
- **Amending 0014 in place**, as its sidebar follow-up was. 0014 states
  the opposite rule; rewriting it would hide that the rule was reversed
  and why.
