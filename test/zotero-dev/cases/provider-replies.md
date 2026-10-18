[Checklist index](../README.md) · [Scripts](../scripts/provider-replies/README.md)

# Provider replies read as what they are (issues #198, #199, #200, #201, #202)

Run the [baseline](../baseline.md) first and [cleanup](../cleanup.md) last.
Snapshot the OpenAI Compatible and Azure sections (values and user-value
flags) and restore them at the end; never print a key.

A local stub server stands in for OpenAI Compatible (a few lines of
Python on `127.0.0.1`, killed at cleanup): `GET /v1/models` answers
`{"data":[]}`; `GET /v1/audio/voices` and `POST /v1/audio/speech` answer
what each item says. Point the section's Base URL at it, key empty.

1. **A server down behind a gateway (#198).** Voices answer 502. Open a
   fixture whose Document voice is a voice of OpenAI Compatible: the toast
   is `Cannot reach OpenAI Compatible. This document keeps its voice: …`,
   not `unavailable`; the Player's OpenAI Compatible entry lists none of
   OpenAI's eleven voices. Voices answering 404 still list OpenAI's
   eleven (a server without a voice list).
2. **A login page (#199).** Voices answer 200 JSON with one voice; speech
   answers 200 `text/html` (`<html><title>Sign in</title></html>`). Test
   connection and Enable read `Connected, but synthesis failed: OpenAI
   Compatible speech: the server answered with a web page (text/html), not
   audio. Is a login page in front of it?`, and Enable does not switch the
   section on (2026-10-18, 1.16.12-beta6).
3. **A Segment over 4,096 characters (#201).** Speech answers each request
   with one MP3 made by `ffmpeg -f lavfi -i "sine=f=440:d=2" -codec:a
   libmp3lame -ar 24000 -ac 1` (an `Info` frame at its start) and logs each
   request's `input` length. Read a fixture paragraph that Zotero keeps as
   one Segment of 4,097-5,000 characters (a long run without a sentence
   end): the stub logs two requests, each at most 4,096; the Segment plays
   (no `Playback failed`), and `engine()` reports the clip's duration as
   about 4 s (two pieces), not 2 s. The 1.16.12-beta6 run proved the split
   (requests of 4,094 and 906 characters) but not the joined clip's
   playback: Read Aloud memory put the session's voice back at every
   activation, so the long Segment was read in another voice. Pick the
   stub's voice in the Player after the Segment is active, or give the
   fixture a Document voice of OpenAI Compatible first.
4. **Azure (#200, #202): unit-tested.** A refused key and a key with a
   stray space need a wrong key in the owner's Azure section; run them
   only if the brief authorizes it, otherwise report NOT TESTABLE and the
   unit tests (`test/core/providers/azure.test.ts`).
5. **Cleanup.** Kill the stub, restore both sections, delete fixture
   records; no new plugin error.
