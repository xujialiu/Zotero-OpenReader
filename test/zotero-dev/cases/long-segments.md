[Checklist index](../README.md) · [Scripts](../scripts/long-segments/README.md)

## Long tables start in independently playable pieces (issue #262)

Run the [baseline](../baseline.md) and [cleanup](../cleanup.md). Use a
disposable copy of the reported PDF, or a disposable document containing
its normalized table text. Record the original Segment length. Mute the
Player and isolate WebDAV. The document open when the run began is
observation-only. A controlled Fish Audio response with valid audio can
hold a later request or fail it deterministically.

1. Start at a long table in the fixture. Check the actual reader
   Segments and the speech requests. A Segment over 480 UTF-16 code units
   becomes pieces of at most 240 with increasing original offsets. The
   first starts playing while a later piece is outstanding. Ordinary
   short sentences keep their original text and boundaries.
2. Release the next piece. Its position, sentence Highlight and a
   timestamp's word span resolve within its own source range. The
   paragraph position is shared. The Engine moves to the next piece
   with zero configured inter-sentence gap. Report any device limit
   separately from decoded clips and actual audio-clock progression.
3. Start or skip into a later piece. Retry a controlled failure there.
   The requested text is the failed piece and the resumed source is
   that piece. A paragraph skip lands outside the table when another
   paragraph follows. Check that the saved source range resolves back to
   the piece in a regenerated Segment list.
4. For the original Fish Audio regression, make one uncached request
   on the configured voice for the first real table piece. Record elapsed
   time, request length and complete audio bytes. A successful response
   must fit the existing deadline. Test the remaining sequence with
   bounded fixture audio. Timing on other networks and perceived speech
   quality are outside this measurement.
