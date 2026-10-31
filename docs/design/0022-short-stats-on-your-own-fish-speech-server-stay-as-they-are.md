# Short stats on your own Fish Speech server stay as they are

*The engineering half is [ADR 0022](../adr/0022-fish-speech-gets-no-short-text-cue.md).
It replaces [design 0002](0002-fish-speech-waits-for-a-language-source.md).*

A Fish Speech voice can misread a line of two or three words, such as a
character's stats in a novel: "2/50 HP" heard as something like "twe fifty
HP", "1,250 gold" as "1,150 gold". Design 0002 put this off until the
plugin could tell which language such a voice speaks, because telling Fish
Audio's voices which language to speak had fixed the same fault there.

## What was found

Each line was read many times, and every reading was checked by a speech
recognizer that agrees with the owner's own ear on the ten clips the owner
had judged before:

- **Naming the language does not help a Fish Speech voice.** Told to speak
  English, it misread "2/50 HP" about as often as before, one time in four.
  The voice was speaking English all along; it misreads the numbers.
- **Nothing else tried holds up.** Asking it to "speak naturally" fixed
  "2/50 HP" and made "1,250 gold" and "120/120 HP" worse. Making it less
  adventurous in how it speaks helped some lines and hurt others.
- **How often depends on the line.** Some lines were always right; "1,250
  gold" was wrong almost half the time. Now and then "120/120 HP" came back
  as a minute of "100 and 100 and 100 …".
- **Fish Audio's voices read these lines right today** with or without
  being told the language. Fish has since added its own way to say the
  language; using it made "2/50 HP" read as a fraction, "two fiftieths", most
  of the time.

## What changes

Nothing in what the plugin sends:

- **Fish Speech** voices get the text as it is. The question design 0002
  waited on, where such a voice's language should come from, no longer
  matters for this: knowing it would not help.
- **Fish Audio** voices keep being told the language in front of very short
  lines, as design 0001 decided. It does no harm, and it fixed the fault
  when the fault was there.

## What the owner gives up

**Correct stats on a Fish Speech voice.** Short numbers can still be
misread, and a rare line can run on for a minute. A newer model on the
server may change that; nothing the plugin could add was found to.

**The minute-long loops are left alone for now.** They can be told apart
by their length and asked for again, but the owner chose not to take that
on with this decision.
