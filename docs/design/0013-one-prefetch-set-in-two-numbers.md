# One prefetch, set in two numbers

*The engineering half is [ADR 0013](../adr/0013-one-prefetch-in-the-engine-for-every-voice.md).*

While a sentence is read, the plugin fetches the audio of the sentences
after it, so the reading does not stop to wait for the provider. Two
numbers now say exactly how that goes: how many sentences ahead, and how
many requests go to the provider at the same time. Set 5 ahead and five
sentences are ready; set 2 at once and the provider never gets more than
two requests from the reading at a time.

Before this, two prefetches ran one on top of the other: the one Zotero's
Read Aloud always had, fixed at three sentences ahead, and the plugin's
own, set in the pane, counting on from wherever the first had got to. The
pane's number was never what happened: at 5 the reading was five to eight
sentences ahead, depending on timing. Turning it down to 1, as the Azure
and Cloudflare tutorials advised to stay under a limit or spend less,
still left three or four sentences ahead, and turning it off still left
three. And the two broke separately: after a voice switch the plugin's
half stopped, and nothing said so.

## The settings

- *Custom prefetch*, on by default. On, the reading uses the two numbers
  beside it; off, it uses the defaults.
- *Sentences ahead*, 3 to 20, default 5. Three is the least, which is what
  every reading had before.
- *Requests at once*, 1 to 5, default 2. A server of your own that works
  on one sentence at a time gains nothing from more; a cloud service that
  works on several may.

The sentence the reading is waiting for is asked for at once, never put in
line behind the sentences fetched ahead. So right after a skip, while the
requests already sent for the old place finish, there can be one request
more than the number says, for a moment.

A change takes effect from the next sentence of a reading in progress.

## Zotero's own voices too

Standard and Premium follow the same two numbers. Design 0005 had kept
them as Zotero has them, three ahead and two at once; with one prefetch
for every voice there is one rule to know. The cost is Premium's: a
sentence fetched ahead and then skipped still uses up credits, and at the
default of 5 that is up to two sentences more per skip than before.

## The audio cache

Prefetch no longer needs *Cache synthesized audio*, so the cache can be
switched off whatever prefetch does. The audio fetched ahead is kept for
the reading in progress either way; the cache is what lets a sentence
heard again, or a document reopened, play without a new request. With it
off, Stop and Play again pays for those sentences again on a paid
provider.

## The update

Everyone starts at the defaults: custom on, 5 ahead, 2 at once. A count
set before meant something else, the pane's number plus up to three, so it
is not carried over; nor is a Prefetch that was switched off, whether it
comes from this computer, an old backup or another computer's synced
settings.

## What this gives up

- **A number for each of the two prefetches.** Showing both would have
  made the reach a sum that still moved with timing, and left two things
  to break separately.
- **Fewer than three sentences ahead.** Whoever lowered Prefetch to 1 on
  Azure's free tier or Cloudflare to spend less now gets three, which is
  what they had before anyway.
- **Zotero's voices as Zotero has them.** Keeping them at three and two
  would have spared Premium's credits on skipped sentences, at the price
  of a second rule.
- **Carrying the old settings across.** Converting each old count to the
  new meaning would have kept a few people's choice; a reset puts everyone
  on numbers that mean what they say, at the cost of setting them once
  more.
- **Never one request more, not even for a moment.** The sentence skipped
  to could have waited in line behind the ones already asked for. On a
  server that works on one sentence at a time, the reading would then stay
  silent after every skip until those had been made, and a wait long
  enough fails as a lost connection.
- **Numbers per provider.** A slow server of your own and a metered cloud
  service want different numbers; one pair for every voice is simpler, and
  numbers per provider can still come later.
