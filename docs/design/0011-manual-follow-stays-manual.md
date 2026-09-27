# Manual follow stays manual

The default follow choice determines whether a newly opened document starts
in automatic or manual follow. The player's A/M control changes the current
document without changing that default or other open documents.
The initial default is automatic follow; the reader can change it to manual.

Automatic follow uses the chosen scroll style: center each sentence, or
scroll when the sentence extends outside the view. Manual follow leaves
scrolling to the reader. These are separate choices: a scroll style does
not turn automatic following on.

## One meaning for M

Scrolling by hand or clicking A enters manual follow. Once the player shows
M, later sentences, pauses, and resuming do not restore automatic follow.
Clicking M restores A, locates the spoken sentence, and follows from there.
The same change is available through the Switch A/M shortcut.

Skipping a sentence or paragraph in M changes what is read without moving
the page. Go to reading position locates the sentence once and keeps M.
In A, both actions locate the sentence and retain automatic follow.

## Three separate shortcut actions

- **Go to reading position and switch to auto-scroll** retains the existing
  Shift+Enter binding. It locates the current sentence and enters A from
  either state. Existing custom bindings remain attached to this action.
- **Go to reading position** locates the current sentence once without
  changing A/M.
- **Switch A/M** does the same thing as clicking the player's A/M control:
  A to M stops following; M to A locates the current sentence and follows.

None of these actions starts paused audio. Returning to the reading
position and choosing whether to follow remain separate actions, even
though Shift+Enter combines them for convenience.

The existing Shift+A shortcut still switches the automatic scroll style
between centering each sentence and scrolling when outside the view; it
does not switch A/M. Go to reading position defaults to Shift+R; Switch
A/M defaults to Shift+M. Both can be rebound or cleared.

## What this gives up

Previously, manual browsing could resume automatic following when a later
sentence was visible. Resuming playback or skipping also restored it.
That made returning to automatic follow convenient, but made M an unreliable
promise to someone who wanted to control every page movement.

M now has one meaning regardless of how it was entered. The reader must
explicitly restore automatic follow after browsing away, by clicking M,
using Switch A/M, or using the combined return-and-follow action. A default choice
adds a setting, but lets people who prefer manual scrolling start there
without changing other people's initial experience.

The former Keep auto-scroll while the sentence is visible setting no longer
has a role: manual scrolling enters M regardless of sentence visibility,
and visibility cannot restore A. It is removed from the settings interface.

## Remembering the choice

An open document tab keeps its current A/M choice through pausing, stopping
and restarting reading, and switching between tabs. Closing the document
and opening it again uses the default instead of remembering its last choice.

The default participates in settings backup and sync. A tab's current A/M
choice does not. Changing or receiving a default affects documents opened
afterward and leaves already open documents alone.

## Approval

The owner approved the consolidated behavior and the three shortcut actions,
then authorized implementation on September 27, 2026. Tracked in issue #153.
