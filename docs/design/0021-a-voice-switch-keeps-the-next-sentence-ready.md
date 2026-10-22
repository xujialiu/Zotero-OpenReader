# A voice switch keeps the next sentence ready

*The engineering half is [ADR 0021](../adr/0021-the-handoff-prepares-at-the-prefetchs-width-and-cuts-in-time.md).*

Picking another voice while a document is read hands the reading over to
it without stopping. The old voice reads on while the new one gets its
audio, and the new one takes over in the middle of a sentence, at a word
both voices mark, or else at the start of a sentence.

Until now, the new voice got only the sentence being read before it took
over. It took over at the first word it could, sometimes a fraction of a
second before that sentence ended, and only then asked for the next
sentence. The reading stopped there with "Preparing…" for as long as the
provider took to answer, a second or two. Between voices that mark their
words, about one switch in four did this. The old voice had the next five
sentences ready; the new one had none.

## What changes

- **Two sentences at once.** While it prepares, the new voice asks for
  the sentence being read and the one after it together: as many at once
  as *Requests at once* in the settings, two unless you changed it.
- **Mid-sentence only when the next sentence will be there.** The new
  voice takes over at a word only when the next sentence is already in,
  or when enough of the sentence is left to fetch it in time, judged by
  how long the new voice's own requests have just taken. Otherwise it
  takes over at the start of the next sentence.
- **The old voice no longer holds the new one back.** Sentences the old
  voice asked for before the switch and has not received no longer delay
  the new voice's own fetching ahead once it has taken over.

## What it gives

In a simulation of 210 switches each way, over fast and slow, cloud and
local servers, sentences of one to six seconds and switches at every
moment of a sentence:

- **No stop after the takeover**, where 23% of switches stopped before. A
  reading with no switch at all stopped in none of them either.
- **The new voice is heard sooner**: half of the switches within 2 s of
  the pick, against 3.9 s before. Asking for two sentences at once lets
  the new voice catch the sentence being read more often.
- Voices that do not mark their words, which always took over at the
  start of a sentence, stop after the switch less often too: in none of
  the 210, against 5% before.

## What it costs

- **About 0.4 more sentences per switch** fetched by the new voice and
  never played. On a metered provider, that is paid for.
- **One more request at a time** to the provider, right at a switch.
- **A server of your own that makes one sentence at a time is heard
  later.** It makes the second sentence after the first, and the new voice
  now waits for it before taking over mid-sentence: in the simulation, up
  to a second and a half later than before.
- **A slow server at high speed can still stop once.** When a sentence
  takes less time to speak than the server takes to make one, two at
  once is not enough. A server taking 3 seconds, read at 1.5×: 7 switches
  in a hundred still stopped, against 70 before, and 3 in a hundred
  stopped there with no switch at all. A server of your own taking 1.5
  seconds a sentence, read at 1.5×: 7 in a hundred, as before. Raising
  *Requests at once* helps on a service that makes several at a time, at
  the price of more requests at a time.

## What this gives up

- **Taking over only once the next sentence is there**, asking for one
  sentence at a time. Almost as smooth, but on half of the switches the
  new voice is heard more than 6.8 s after the pick, against 2 s.
- **Asking for two at once but taking over at the first word, as
  before.** As quick, but it stops after the takeover about as often as
  before, and more often on slow servers.
- **Calling off what the old voice asked for**, at the takeover. It made
  no difference to the stops, and a server of your own may go on working
  on a request it was told to drop.
- **Preparing the new voice as far ahead as the reading does.** More paid
  for on every switch that is then called off, and a first attempt made
  switching less reliable.
- **A number of its own for the switch.** How many sentences the new
  voice asks for at once follows *Requests at once*, which already says
  how many requests the provider gets at a time.
