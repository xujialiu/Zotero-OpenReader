# One new name, the same installed plugin

*Engineering decision: [0014](../adr/0014-zotero-openreader-keeps-its-installed-identity.md).*

The repository and the plugin's visible name become **Zotero-OpenReader**.
Renaming only the repository was rejected: the plugin should carry the
same name wherever a reader encounters it.

This is still the same plugin. Existing users keep their settings,
backups, reading positions, and automatic updates. The download keeps its
old filename for compatibility. Previously published records retain the
name they used at the time.

The documentation moves with the repository. We will try to send old
website links to their matching new pages through the owner's homepage;
that forwarding must be checked after the move. Search registration must
also be set up for the new website address. The old repository name must
never be reused, because older installations depend on its forwarding.

The rename does not include publishing a new plugin release. Installed
copies show the new name only after an update that contains it.
