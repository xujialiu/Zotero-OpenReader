# A contribution is licensed to everyone, and once more to the author

*Engineering decision: [0018](../adr/0018-a-contribution-is-licensed-once-more-to-the-author.md).*

## What was decided

Anyone may offer a change to Zotero-OpenReader. Whoever does keeps ownership
of what they wrote. They give it to everyone under the project's license, as
the rest of the plugin is given. And they give the author a second, wider
permission: to pass the change on under any other terms as well.

They agree by ticking one box when they offer the change. Nothing is signed
and no account is opened anywhere else. The offer, with its tick, is the
record. A change offered without the tick is not taken in.

These are word for word the terms of the author's reading app, OpenReader,
which settled the same question the same day. A change that moves from the
plugin into the app then arrives on the terms the app already has.

## Why a second permission is needed

The plugin itself costs nothing. But the part of it that talks to
the speech services, and the part that keeps settings and reading positions
in step through the user's own server, are also copied into OpenReader, and
OpenReader is sold on Apple's App Store.

The project's license lets anyone copy the plugin, change it and pass it on,
with conditions. One of them is that whoever passes it on adds no limits of
their own. Apple's store adds limits to every copy it hands out: the copy may
be used only on Apple devices its buyer owns, and may not be passed on. The
Free Software Foundation, which wrote the license, reads the two as impossible
to honor together.

The author is not caught by this. An owner may hand out his own work on any
terms he likes, so the app is in order while every line in it is his. Every
line of the plugin is his today: two changes have been offered from outside,
neither was taken in, and the author wrote both fixes himself.

The first line written by someone else would change that. Its owner could
object to the app's store copy, and since that copy is the one that earns
money, an objection would end the project's income. VLC, a video player under
a license of the same family, was taken off the App Store in 2011 after one
of its many contributors complained to Apple, and came back two years later
under different licenses.

## What else changed

One of the author's own fixes, the one that stops a stalled server from
hanging the sync, turned out to share a few lines with one of the two changes
offered from outside, which was never taken in. That piece was rewritten in a
way of its own. It does exactly what it did; nobody using the plugin will
notice anything. It was worth doing because the app does not have that fix
yet and will probably want it.

A few pieces of the plugin, which keep the voice sounding the same at any
speed, are copied from Zotero itself and belong to Zotero's makers. They stay
under Zotero's terms. The new terms concern only what a contributor writes,
and those pieces never go into the app.

## What was turned down

- **A promise made to everyone** that nobody will be pursued over Apple's
  store alone. No contributor would have to agree to anything, but anyone
  could then put a copy of the app on the store beside the author's, and it
  would settle that one store and nothing else.
- **A permission that names only app stores.** It asks less of a
  contributor, but its words would be new, written without a lawyer, and any
  store or arrangement they failed to foresee would mean asking every
  contributor again.
- **Terms only for the parts the app copies.** A contributor to the rest
  would give less. But which parts the app copies changes over time, and
  nobody can be asked again once their change is in.
- **Taking no code from outside.** The simplest answer. It costs every fix
  someone else would have written.
- **A signing service, or asking for ownership itself.** More than a project
  that has never taken in a change from outside needs. A service can replace
  the box later without changing what is agreed.
- **Leaving the shared lines alone**, or asking the stranger who offered them
  to agree after the fact. The first leaves a doubt in the piece the app will
  want; the second waits on someone who may never answer.

## What it costs

- **Some people will not contribute.** The wider permission lets the author
  put a contribution into a copy under other terms, a paid one included. A
  person who objects will keep their change to themselves, or in a copy of
  their own, which the project's license allows.
- **The author can do what a contributor cannot.** Everyone else receives a
  contribution under the project's license alone. The app's store copy rests
  on that one-sidedness.
- **Somebody has to look for the tick.** Nothing stops a change from being
  taken in without it.
- **The terms are in English only.** A Chinese reader is pointed at the
  English text, because a legal text should have one version that counts.
- **No lawyer has read the terms.** They reuse established wording. They
  should be read by one before the first change from outside is taken in.
