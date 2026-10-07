# Inside Zotero, the plugin is OpenReader

*Engineering decision: [0016](../adr/0016-the-plugin-is-openreader-inside-zotero.md).*

Inside Zotero the plugin is called **OpenReader** wherever it shows its
name: the plugin list, the settings sidebar, its dialogs, the player and
its messages, in English and in Chinese. Outside Zotero — the website,
the instructions, GitHub — it is still **Zotero-OpenReader**.

The short name is enough inside Zotero: a plugin there obviously belongs
to Zotero, and no other plugin carries the name. Outside Zotero,
OpenReader on its own already names the reading app for phones, the one
that shares reading positions with the plugin. Using the same word for
the plugin there would leave every page and every discussion unsure
which of the two is meant. The one place inside Zotero that mentions the
app calls it the OpenReader app on your phone.

Two other ways were turned down. Calling the plugin OpenReader
everywhere would mix it up with the phone app in the instructions and on
GitHub. Keeping the full name in the plugin list alone would leave one
odd place out, and help no one.

This replaces the part of the earlier rename that kept the full name in
the plugin list and the dialog titles. The rest of that decision stands:
settings, backups, reading positions and automatic updates carry over
untouched. The plugin store that lists the plugin by the name inside its
download shows OpenReader too. Installed copies show the new name after
the next release.
