# Estimated remaining reading time

*The engineering half is [ADR 0010](../adr/0010-estimated-remaining-reading-time.md).*

The player shows how much listening time remains, so the listener can
decide whether there is time to finish. A setting, enabled by default,
controls the display in all three player layouts.

## What the time means

Ordinary reading shows the estimated time from the current place to the
end of the document. When a reliable table of contents is available, it
also shows the time to the next table-of-contents heading in reading order,
at any depth. A chapter's introduction ends at its first subsection; that
subsection's introduction ends at its first child heading. The final
section ends at the document end. Without reliable boundaries, only the
document estimate is shown.

Selecting text currently chooses where reading starts; reading continues
to the end of the document, so document and section estimates still apply.
If reading is limited to selected content, its estimate is labeled as
selected content and covers only that range. This decision does not add a
new way to start selection-only reading.

The estimates use the current speed and include the configured pauses
between sentences and paragraphs. They exclude manual pauses and network
waits, during which reading does not consume the estimated time. Neither
the full document's total duration nor a predicted clock time of completion
is shown.

The display is one line: “Doc <154 min · Section <50 min”, without section
titles. Each number is rounded up to a whole minute, with a minimum of
“<1 min”; an exact whole minute uses the next minute to preserve the “<”
meaning. These remain estimates, not promised upper bounds on actual
listening time. The line sits above the speed and volume controls in the
Floating panel, and immediately after volume in the Top and Bottom bars.
It stays visible without requiring expansion.

## Display boundaries

While the text is loading or no audio is available for the selected voice,
show “Estimating.” If no estimate can be made,
show that it is unavailable rather than a number. At the end of the reading
range, show “Finished”; resetting the reading place must not make the
finished time jump back up. Turning the setting off hides all estimates.

## Audio before a number

On September 27, the owner replaced the immediate text-only estimate:
without audio for the selected voice, show “Estimating.” Text alone must
not produce a displayed duration. Ordinary reading supplies the audio;
the estimate must not cause additional speech generation.

The owner confirmed these stability rules on September 27:

- During ordinary forward reading with the same voice and speed, the
  displayed document estimate may hold or decrease, but never increase.
  If it was too optimistic, it may hold while the estimate catches up.
- Within the same reading section, the section estimate also only holds
  or decreases. Entering the next section resets its estimate; the
  document estimate continues without an upward reset.
- A deliberate voice, speed, or reading-position change starts a fresh
  estimate and may increase the number. A new voice with no audio shows
  “Estimating” again.
- Wait for a useful sample of reasonably complete sentences before showing
  the first number. Titles, contents entries, and short numbers alone are
  insufficient. This can leave “Estimating” visible for more than a minute
  at a book's opening.
- Downward corrections are gradual: during ordinary reading, 40 seconds
  of listening can reduce the displayed estimate by at most one minute.
  Manual pauses and network waits do not accumulate an allowance for a
  later drop. An overestimate may therefore take longer to catch up.
  Actual completion immediately shows “Finished.” Deliberate resets and
  a new section use the reset rules above rather than this correction limit.

These product requirements are implemented by the stabilization change.
The sample thresholds and smoothing parameters are implementation defaults,
not a guarantee of prediction accuracy. A short range whose audio is
already entirely available uses its measured duration without waiting for
more samples.

New audio refines the internal estimate, while the displayed number follows
the stability rules above. Waiting for samples and retaining an optimistic
estimate can delay a useful number or leave it unchanged for some time.
Showing seconds would suggest more precision
than the estimate has, so the display remains in minutes.

Generating the whole document's audio just to measure its length would
take longer and could charge for text the listener never hears. The
estimate does not cause extra speech generation.
