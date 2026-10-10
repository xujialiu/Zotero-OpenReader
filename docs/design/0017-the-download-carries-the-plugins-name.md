# The download carries the plugin's name

*Engineering decision: [0017](../adr/0017-the-download-carries-the-plugins-name.md).*

The file people download to install the plugin is now named after it,
**Zotero-OpenReader**, instead of after the plugin's old name. The earlier
rename kept the old file name, in the belief that something depended on
it. Nothing does: automatic updates follow whatever link the plugin is
given, the plugin stores recognize the file by its kind and not its name,
and Zotero installs a file whatever it is called. Keeping the old name
only meant that every new user's first contact with the plugin still said
Zotero-TTS.

Versions already published keep the old file name, so no download link
anyone has saved stops working. Existing users notice nothing: their next
update arrives under the new name, with every setting kept.

The file name carries no version number. Every release's download is
called the same, so the instructions never have to change; which version
it is stays on the release it comes from. The all-lowercase spelling of
the old file was turned down as well: outside Zotero the plugin is written
Zotero-OpenReader, and a file name is something people read.
