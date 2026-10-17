# An unencrypted WebDAV folder is warned about, not refused

*Engineering decision: [0015](../adr/0015-an-unencrypted-webdav-folder-is-warned-about-not-refused.md).*

The WebDAV folder carries more than reading positions. The sync and the
server backup put the settings there, and the settings hold every key the
owner pays for; the backup holds the folder's own password too. At an
address that begins with `http://` all of it travels unencrypted, and
anyone on the way can read it.

The plugin now says so, and refuses nothing. The folder gets an Enable
button like a provider's: it checks the connection before the folder is
used, and locks the address and the password while it is on. Enable and
Test connection add a warning to their result whenever the address is
`http://`, at home as much as on the internet. While the folder is off,
the sync and the server backup are greyed and do nothing.

A folder that does not exist on the server yet is created when Enable is
pressed. Nothing else could create it: the sync and the server backup
wait for the folder to be on, and until this was settled a first setup
that followed the README's own examples stopped at Enable with a message
promising an upload that could never happen. Only the last folder of the
address is created; when the folder above it is missing too, Enable says
to check the address instead of building the path. Test connection only
looks, and says that Enable will create the folder.

## What was turned down

**Refusing `http://` for any address outside the home network.** An
outside contribution proposed exactly this. Everyone already syncing
through such an address would have found, after an update, that their
positions and settings had quietly stopped following them: the plugin
would only have noted it in a log, and they would have had to open the
settings to find out why. It would also have refused a folder reached
through an encrypted private network, which is safe, and still let an
unencrypted address through on a café's Wi-Fi, which is not. The plugin
cannot tell a network it can trust from one it cannot; the owner can.

**Asking before enabling.** A dialog at Enable would make the owner agree
to the risk each time. It adds a click to every Enable of a home server,
where the owner has already decided, and the warning on the result line
says the same thing without stopping anything.

**Warning only away from home.** For the same reason as the refusal: the
plugin cannot know which networks are private. Every `http://` address is
warned about, and no switch hides the warning; moving to `https://` is
what makes it go away.

**Leaving a missing folder to the owner.** The message could have told
them to create it in the server's own web page. Most people setting up
the folder for the first time would have had to leave Zotero, find that
page, and come back to press Enable again, for a folder the README had
already promised would be created.

## What it costs

Someone on a home server without `https://` reads the warning every time
they press Enable or Test connection. Someone already using the folder
before this change finds it on after the update, so nothing stops, but
they see the warning only when they next press one of those buttons.
