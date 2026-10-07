# Zotero-OpenReader — every string the settings pane shows and the plugin writes
# into it. This file is the source of truth; the other locales mirror its
# ids, attributes and variables (test/l10n.test.ts). Ids carry the ztts-
# prefix because a document's Fluent messages share one namespace with
# Zotero's own and every other plugin's.
#
# A ? icon is a XUL <label value="?" help="…">, and Fluent drops every
# localizable attribute the translation leaves out — `value` included — so
# each help message names its .value = ? beside the .help.


## Provider sections (the OpenAI, Azure and Local engine headings are product names)

ztts-field-api-key =
    .value = API key
ztts-field-model =
    .value = Model
ztts-field-voices =
    .value = Voices
# The Voices field's placeholder: what an empty field offers (issue #113)
ztts-voices-input-builtin =
    .placeholder = built-in voices
ztts-voices-input-server =
    .placeholder = the server's own
ztts-field-extra-headers =
    .value = Extra headers
ztts-help-extra-headers =
    .value = ?
    .help = Only for a server behind Cloudflare Access (see the README's Cloudflare tutorial): its service token as CF-Access-Client-Id: …; CF-Access-Client-Secret: …. Otherwise leave empty.
# The three sections that speak OpenAI's API (issue #113)
ztts-help-openai =
    .value = ?
    .help = Key and model from platform.openai.com; billed per character. Leave Voices empty for OpenAI's own voices; sentences are highlighted, not words.
ztts-help-mimo =
    .value = ?
    .help = Key from platform.xiaomimimo.com; free for now. Leave Voices empty for MiMo's built-in Chinese and English voices; sentences are highlighted, not words.
ztts-help-compatible =
    .value = ?
    .help = Any server with OpenAI's API, such as Chatterbox-TTS-Server or a proxy of OpenAI; a key only if it asks for one, and Test connection lists its models. Leave Voices empty for the server's own voices; sentences are highlighted, not words.
ztts-test-connection =
    .label = Test connection
ztts-field-region =
    .value = Region
ztts-field-account-id =
    .value = Account ID
ztts-field-api-token =
    .value = API token
ztts-help-cloudflare =
    .value = ?
    .help = The Account ID and an API token are on the Workers AI page of your Cloudflare dashboard (Use REST API). Sentences are highlighted, not words; 10,000 free Neurons a day, a few pages with an Aura voice, hours with MeloTTS.
ztts-help-speechify =
    .value = ?
    .help = The key is on the API keys page at platform.speechify.ai; words are highlighted, and there is no Mandarin, only Cantonese. Free for 50,000 characters a month, about fifteen pages, then $10 a month for a million.
ztts-help-fish =
    .value = ?
    .help = The key is on the Developers page of your fish.audio account; every voice highlights words. The free model keeps your text and promises no speed; the paid one bills by the byte of text, three per Chinese character.
ztts-fish-free-only =
    .label = Use only the free model
ztts-help-fish-free-only =
    .value = ?
    .help = On: the free S2.1 Pro, no API credit needed, but no speed guarantee, and Fish Audio may keep your text. Off: $15 per million bytes, from your API credit, which is separate from the website's.
ztts-heading-fish-sources =
    .value = Voice sources
ztts-fish-include-official =
    .label = Official voices
ztts-fish-include-own =
    .label = Your voices
ztts-fish-include-manual =
    .label = Manual voices
ztts-field-fish-voices = Voices (<label data-l10n-name="model-ids">Model IDs</label>)
ztts-fish-model-ids-input =
    .placeholder = IDs from Fish Audio
ztts-help-fish-model-ids =
    .value = ?
    .help = Copy a voice's Model ID from its page on fish.audio/app/discovery. Separate several with commas or spaces; voice links work too.
ztts-help-fish-speech =
    .value = ?
    .help = A fish-speech API server on your machine or LAN (see the tutorial in the README); needs a 24 GB GPU, and sentences are highlighted, not words. A server started with --api-key takes "Authorization: Bearer …" in Extra headers.
ztts-field-address =
    .value = Address
ztts-heading-system-voices = System voices
ztts-help-system-voices =
    .value = ?
    .help = Your system's own voices, with the voice browser, samples, favorites and the cache like every other provider. Windows adds word highlighting, on macOS the sentence is highlighted; Linux is not supported.

## The provider switch, written by ui/provider-rows.ts

## Zotero's own voices (issue #111): a switch per tier, no fields

ztts-help-zotero =
    .value = ?
    .help = Zotero's Standard and Premium voices, which need a Zotero account signed in; each tier spends its own credits, bought on zotero.org through Add more time. Switching a tier off takes it out of the player and the voice browser; switching it back on brings back its last voice.
ztts-zotero-standard = Standard
ztts-zotero-premium = Premium
ztts-zotero-not-signed-in = Not signed in to a Zotero account.
ztts-zotero-log-in = Log in
ztts-zotero-tier-empty = Zotero lists no { $tier } voices.
ztts-zotero-tier-ok = Signed in: { $count } { $tier } voices.
# The line under each tier's name (issues #159, #140): the time left, as zotero.org counts it.
# A tier's voices cost different amounts a minute, so its time is a range from the dearest
# voice's to the cheapest's; $time, $low and $high are written by ztts-duration-* below.
ztts-zotero-time-left = Remaining time: { $time }
ztts-zotero-time-range = Remaining time: { $low } – { $high }, depending on voice
# The top of a range past Zotero's 90 days: $time is 90d
ztts-zotero-time-over = { $time }+
# With no price listed the credits figure stands in
ztts-zotero-credits-left = { $credits } credits left
ztts-zotero-credits-unlimited = Remaining time: Unlimited
# Enable and Test connection refuse a tier with nothing left (issue #140)
ztts-zotero-no-time = No remaining time on { $tier }. Add more time first.
# A Zotero voice's time left, rounded up: in the settings and after each voice in the player
ztts-duration-m = { $minutes }min
ztts-duration-hm = { $hours }h { $minutes }min
ztts-duration-dhm = { $days }d { $hours }h { $minutes }min
ztts-duration-d = { $days }d
# The reminder over the document when Zotero will not read (issue #140); $tier is Zotero Standard or Zotero Premium
ztts-reminder-used-up = { $tier } has no remaining time and has been switched off. Add more time, then enable it again in OpenReader settings.
ztts-reminder-daily-limit = { $tier } has reached today's limit and has been switched off. Enable it again in OpenReader settings tomorrow.
ztts-reminder-short = Not enough remaining time on { $tier } for this voice. Choose a cheaper voice, or add more time.
ztts-reminder-others = { $count ->
    [one] Reading also stopped in 1 other tab.
   *[other] Reading also stopped in { $count } other tabs.
}
ztts-reminder-close = Close
# Zotero's own words for its link to zotero.org/settings/readaloud
ztts-zotero-add-more-time = Add more time

# The eye after a key, a gateway header line or the WebDAV password: it
# uncovers the value so it can be read, selected and copied, and covers it
# again. A provider that is on greys it out — its secrets stay covered.
ztts-secret-show = Show the value
ztts-secret-hide = Hide the value

ztts-switch-enable = Enable
ztts-switch-disable = Disable
ztts-switch-checking = Checking…
ztts-switch-testing = Testing…


## Voice browser

ztts-heading-voice-browser = Voice browser
ztts-favorites-only =
    .label = Offer only favorite voices in the player
    .bold = favorite voices
ztts-voices-speed =
    .value = Speed
    .tooltiptext = Samples play at this speed; with “Use one speed everywhere” on, releasing the slider makes it the global speed
ztts-volume =
    .value = Volume
ztts-volume-percent =
    .value = %
ztts-help-volume =
    .value = ?
    .help = How loud every voice and the samples play; 100% is Zotero's own level, and the most. The volume keys below change it by 10%.
ztts-help-default-voice =
    .value = ?
    .help = New documents start with the default voice; changing the voice in the player affects only that document.


## Reading

ztts-heading-reading = Reading
ztts-open-expanded =
    .label = Open the player expanded
ztts-help-open-expanded =
    .value = ?
    .help = Show the floating panel's provider, language and voice rows each time it opens. Options or Shift+O hides or shows them until it closes.
ztts-one-speed =
    .label = Use one speed everywhere
ztts-help-one-speed =
    .value = ?
    .help = One speed for every document and every open tab. Off: Zotero keeps one speed per document language.
ztts-sentence-pause =
    .label = Pause between sentences
ztts-paragraph-pause =
    .label = Pause between paragraphs
ztts-pause-ms =
    .value = ms
ztts-help-sentence-pause =
    .value = ?
    .help = The silence before the next sentence of the same paragraph, at 1× speed; reading faster shortens it.
ztts-help-paragraph-pause =
    .value = ?
    .help = The whole silence where a paragraph begins, at 1× speed, in place of the pause between sentences there; reading faster shortens it.
ztts-skipped-lines =
    .label = Read a page's first line when Zotero would skip it
ztts-help-skipped-lines =
    .value = ?
    .help = Reads a page's first line that Zotero skips when a sentence runs onto the page. Turn it off if a page header is read; applies to documents opened from now on.
ztts-split-sentences =
    .label = Read a sentence Zotero split in two as one
ztts-help-split-sentences =
    .value = ?
    .help = Reads a sentence Zotero split in two as one sentence, without the pause in the middle. Turn it off if two paragraphs are read as one; applies to documents opened from now on.
ztts-prefetch-custom =
    .label = Custom prefetch
ztts-help-prefetch-custom =
    .value = ?
    .help = Prefetch fetches the sentences ahead while one is read, for every voice, so the reading does not wait for the server. On, it uses the two numbers set below; off, their defaults.
ztts-prefetch-sentences-before =
    .value = Prefetch
ztts-prefetch-sentences-after =
    .value = sentences ahead
ztts-help-prefetch-sentences =
    .value = ?
    .help = More covers a slower server. A sentence fetched ahead and then skipped is still billed on a paid provider and uses credits on Zotero's Premium voices.
ztts-prefetch-requests-before =
    .value = Send
ztts-prefetch-requests-after =
    .value = requests at once
ztts-help-prefetch-requests =
    .value = ?
    .help = More fills the sentences ahead faster on a service that works on several at once. A server of your own that works on one sentence at a time is best at 1.
ztts-cache-audio =
    .label = Cache synthesized audio
ztts-help-cache-audio =
    .value = ?
    .help = Keeps synthesized sentences in memory (64 MB, emptied when Zotero restarts), so hearing them again is instant and free. Off, Stop and Play again synthesizes them again, and a paid provider bills them again.


## Highlight

ztts-heading-highlight = Highlight
# The two levels as switches (issue #114), each the label of its color's row
ztts-highlight-sentence =
    .label = Sentence
ztts-highlight-word =
    .label = Word
ztts-highlight-opacity =
    .value = Opacity (%)
ztts-help-highlight-switches =
    .value = ?
    .help = Both on: the word in its color over its sentence; the last one on cannot be turned off. A voice without word timing always highlights the sentence.
# The preview's sample line. The spans are the markup's own elements,
# matched by data-l10n-name: the pieces ui/highlight-rows.ts paints from
# the switches — the word, and the sentence before and after it.
ztts-preview-line = The first sentence has been read. <span data-l10n-name="before">Read Aloud is now on </span><span data-l10n-name="word">this</span><span data-l10n-name="after"> word.</span> The next one follows.
ztts-restore-colors =
    .label = Restore default colors


## Keyboard shortcuts

ztts-heading-shortcuts = Keyboard shortcuts
ztts-key-speed-reset =
    .value = Reset speed to 1.0×
ztts-key-slower =
    .value = Slower (−0.05×)
ztts-key-faster =
    .value = Faster (+0.05×)
ztts-key-quieter =
    .value = Quieter (−10%)
ztts-key-louder =
    .value = Louder (+10%)
ztts-key-previous-sentence =
    .value = Previous sentence
ztts-key-next-sentence =
    .value = Next sentence
ztts-key-previous-paragraph =
    .value = Previous paragraph
ztts-key-next-paragraph =
    .value = Next paragraph
ztts-key-play =
    .value = Play / pause / resume
ztts-key-options =
    .value = Player options
ztts-key-stop =
    .value = Stop reading everywhere
ztts-key-word-highlight =
    .value = Word highlight on / off
ztts-clear =
    .label = Clear
ztts-help-key-skip =
    .value = ?
    .help = Acts only while the player is open; otherwise the key pages and scrolls as usual.
ztts-help-key-play =
    .value = ?
    .help = Works in every state: pauses, resumes, or starts reading from the selection, where you stopped, or the visible page.
ztts-help-key-return =
    .value = ?
    .help = Acts only while the player is open: goes back to the sentence being read and switches this document to A. Paused audio stays paused.
ztts-help-key-options =
    .value = ?
    .help = Acts only while the player is open: shows or hides the floating panel's provider, language and voice rows.
ztts-help-key-stop =
    .value = ?
    .help = Closes the player in every tab; each tab keeps its place for next time. With no player open, the key keeps its usual meaning.
ztts-help-key-word-highlight =
    .value = ?
    .help = Turns the Word switch under Highlight on or off for every tab; with it off, the sentence is highlighted.
ztts-help-key-volume =
    .value = ?
    .help = Changes the Volume above by 10%. Acts only while the player is open; otherwise the key keeps its usual meaning.
ztts-restore-shortcuts =
    .label = Restore default shortcuts


## Backup

ztts-heading-backup = Backup
ztts-backup-to-file =
    .value = To a file
ztts-backup-settings =
    .label = Backup settings…
ztts-restore-settings =
    .label = Restore settings…
ztts-export-positions =
    .label = Export reading positions…
ztts-import-positions =
    .label = Import reading positions…
ztts-help-positions =
    .value = ?
    .help = Where reading last stopped in each document, as its own file; importing keeps whichever position is newer. Settings backups never contain reading positions.


## WebDAV

ztts-heading-webdav = WebDAV
ztts-field-webdav-url =
    .value = WebDAV URL
ztts-field-username =
    .value = Username
ztts-field-password =
    .value = Password


## Sync

ztts-heading-sync = Sync
ztts-sync-positions =
    .label = Sync reading positions between computers
ztts-help-sync-positions =
    .value = ?
    .help = Shares where reading stopped in each document with your other computers and the OpenReader app on your phone, through the WebDAV folder above. Off: positions stay on this computer.
ztts-sync-settings =
    .label = Sync settings between computers
ztts-help-sync-settings =
    .value = ?
    .help = Keeps the settings the same on every computer sharing the folder above. Voice servers at a local or home-network address, the System voices switch and this WebDAV folder stay per computer.
# The line under each switch (ui/sync-status-rows.ts): what the last sync did on this computer
ztts-positions-status-waiting = Reading positions sync: waiting for the first sync.
ztts-positions-status-none = Reading positions synced { $time }; nothing new for this computer.
ztts-positions-status-taken = Reading positions synced { $time }: { $count } taken from your other computers.
ztts-positions-status-last = Reading positions synced { $time }; the last one from another computer arrived { $when }.
ztts-positions-status-failed = Reading positions sync failed { $time }: { $detail }
# The toast when a place another device reached cannot be found in this copy of the document (resume falls back to this computer's own last sentence)
ztts-shared-position-unresolved = The place reached on your other device was not found in this copy; resuming from this computer's last sentence.
ztts-sync-status-waiting = Settings sync: waiting for the first sync.
ztts-sync-status-none = Settings synced { $time }; nothing new for this computer.
ztts-sync-status-applied = Settings synced { $time }: { $count } from { $from } applied here.
ztts-sync-status-last = Settings synced { $time }; the last change here was { $count } from { $from } at { $when }.
ztts-sync-status-failed = Settings sync failed { $time }: { $detail }
ztts-sync-status-deferred = { $count } more wait until the reading stops.
ztts-sync-status-held = { $provider } stays off on this computer: { $reason }
ztts-sync-other-computer = another computer


## Backup — this computer's copy on the server (ui/webdav-rows.ts)

ztts-backup-on-server =
    .value = This computer's copy on the server
ztts-field-this-computer =
    .value = This computer
ztts-help-this-computer =
    .value = ?
    .help = The name of this computer's backup on the server, so no computer overwrites another's; renaming starts a new copy.
ztts-auto-upload =
    .label = Keep a backup of this computer's settings on the server
ztts-help-auto-upload =
    .value = ?
    .help = Refreshes this computer's backup on the server a few seconds after any setting changes. A backup, not the sync: nothing changes anywhere unless you restore it.
ztts-upload-now =
    .label = Back up to the server now
ztts-restore-from-server =
    .label = Restore settings from server…


## About

ztts-heading-about = About
# The About section's first line (ui/about-rows.ts): `Version 1.11.7 · Date 2026-09-10 · Time 13:45:07 UTC+8`
ztts-about-version = Version { $version }
ztts-about-date = Date { $date }
ztts-about-time = Time { $time }
# Its second line: `Author Xujia Liu · Email xujialiuphd@gmail.com`
ztts-about-author = Author { $author }
ztts-about-email = Email { $email }
# The line under it, the repository: the link is named, not placed, so the
# markup's label named github takes the text between the tags wherever a
# language puts it
ztts-about-star = If you like OpenReader, give it a ⭐ on <label data-l10n-name="github">GitHub</label> — it helps others find it.


## What TypeScript writes into the pane (issue #43)
#
# Two conventions. A line made of several sentences — a connection result,
# a restore's report — is put together through ztts-join (core/l10n.ts
# sentences): a space between the sentences in English, nothing in Chinese.
# A count that can pass a thousand — voices, reading positions, an item id —
# arrives as text, so it reads 1914, never 1,914; only the counts a plural
# rule reads (tabs, providers) arrive as numbers.

ztts-join = { $first } { $second }

## Connection results (ui/prefs-pane.ts testConnection, checkProvider; ui/provider-rows.ts)

ztts-connected = Connected.
ztts-connected-model = Connected. Model { $model } available.
ztts-connected-model-missing = Connected, but model "{ $model }" is not listed by this server.
ztts-voices-available = { $count } voices available.
ztts-synthesis-works = Synthesis works.
ztts-word-timestamps = Word timestamps available.
ztts-no-word-timestamps = No word timestamps: { $detail }.
ztts-no-word-timestamps-detail = the server did not return any
ztts-synthesis-failed = Connected, but synthesis failed: { $detail }
ztts-timestamp-check-failed = Connected, but the word-timestamp check failed: { $detail }
ztts-no-reply = No reply within { $seconds } s
ztts-no-audio = No audio within { $seconds } s
ztts-no-voice-list = No voice list within { $seconds } s
ztts-local-server-down = Local TTS server is not running at that address.
ztts-no-key = No API key set for this provider.
ztts-key-rejected = The server rejected the API key. ({ $detail })
ztts-cannot-connect = Cannot connect: { $detail }
ztts-connection-failed = Connection failed: { $detail }
# After a settings restore: the providers it turned on, checked (issue #21)
ztts-providers-checked =
    Checked { $count ->
        [one] { $count } provider
       *[other] { $count } providers
    }: all working.
ztts-providers-turned-off =
    Turned off { $named }: the restored settings do not work here — see the message beside { $count ->
        [one] it
       *[other] each
    }.
ztts-system-unsupported = System voices are available on Windows and macOS only; this build has no speech helper for Linux.

## The voice browser (ui/voice-browser-rows.ts)

# Zotero's two cloud tiers as entries of the player's first dropdown and the browser's first column (issue #111): Zotero's own words for them (reader.ftl reader-read-aloud-voice-tier-*) behind its name
ztts-tier-standard = Zotero Standard
ztts-tier-premium = Zotero Premium
# The System voices' entry in the player's first dropdown and the browser's first column (issue #110), like the pane's heading
ztts-provider-system = System
ztts-listing-voices = Listing voices…
ztts-no-voices = No voices. Enable a provider above.
ztts-no-providers-on = No provider is on: enable one above.
ztts-listing-failed = Listing voices failed: { $problems }
ztts-plugin-voices-problem = the plugin’s voices: { $detail }
ztts-fish-list-limited = Fish Audio limits its platform list to 1,000 voices; use Model IDs from Fish Audio discovery to add others.
ztts-fish-list-stale = Fish Audio’s voice list may be out of date: { $detail }
ztts-fish-list-stale-no-detail = Fish Audio’s voice list may be out of date.
# The status line: the voice as `<tier> | <language> | <label>`, the speed as `1.7×`
ztts-default-voice = Default voice: { $voice }
ztts-default-voice-speed = Default voice: { $voice } | Global speed: { $speed }
ztts-default-speed = Global speed: { $speed }
ztts-no-default = No default voice or global speed: Zotero keeps both per language
ztts-zotero-own-choice = Choose a default voice
ztts-not-listed-now = { $id } (not listed now)
ztts-status-not-a-favorite = { $line } — not a favorite, while only favorites are offered: Read Aloud cannot start with it
ztts-status-trouble = { $line } — { $problems }
ztts-default-cleared = Default cleared: { $label } is no longer a favorite, and only favorites are offered
ztts-sample-failed = Sample failed: { $detail }
ztts-sample-stopped = Sample failed: the audio arrived, but playback stopped: { $detail }
ztts-zotero-sample-unavailable = Zotero cannot play its own voices here
# The tooltips of a voice row's three buttons
ztts-play-sample = Play a sample
ztts-play-zotero-sample = Play Zotero’s own sample
ztts-favorite = Favorite
ztts-row-default = The default voice: Read Aloud starts with it. Click to clear it
ztts-row-pick = Click to make it the default voice
ztts-row-blocked = Only a favorite can be the default while “Offer only favorite voices” is on
# What an <audio> element's MediaError says; the engine's own message is kept beside it in parentheses
ztts-media-unknown = unknown error
ztts-media-code = media error { $code }
ztts-media-aborted = playback aborted
ztts-media-network = a network error
ztts-media-decode = decoding or output failed
ztts-media-format = format not supported

## The reading guard's dialog and the favorites-only refusal (ui/reading-guard.ts, ui/voice-list-switches.ts)

# $list is the tabs, one `  • <title>` per line; the blank line before the last sentence is kept
ztts-reading-tabs =
    This change affects the reading in { $count ->
        [one] a tab
       *[other] { $count } tabs
    }:
    { $list }

    Close the player in { $count ->
        [one] that tab
       *[other] those tabs
    }, then try again.
# The same tabs, above the button that closes the player there (issue #160): the cost is said before the press
ztts-reading-tabs-close =
    This change affects the reading in { $count ->
        [one] a tab
       *[other] { $count } tabs
    }:
    { $list }

    { $count ->
        [one] Closing the player there lets the change through. The tab stays open and keeps its place.
       *[other] Closing the players there lets the change through. The tabs stay open and keep their place.
    }
ztts-close-and-continue = Close and continue
ztts-cancel = Cancel
ztts-ok = OK
# A tab whose item has no title
ztts-item = item { $id }
ztts-unmarked-default =
    { $name } is the default voice but not a favorite.

    While only favorites are offered, Read Aloud could not start with it. Mark it ♥, or make a favorite the default, then switch this on.

## The shortcut recorder (ui/shortcut-rows.ts, ui/shortcut-recorder.ts)

ztts-recording = Press the new keys… (Esc cancels)
ztts-key-not-set = Not set
ztts-key-invalid = { $text } (invalid)
ztts-key-conflict = Already used by "{ $action }".
ztts-key-needs-modifier-or-arrow = Add a modifier (Ctrl, Alt, Shift or Cmd) or use an arrow key: a bare key would type instead.
ztts-key-needs-modifier = Add a modifier (Ctrl, Alt, Shift or Cmd): a bare key would type instead.
# The actions as the conflict message names them
ztts-action-speed-reset = Reset speed
ztts-action-slower = Slower
ztts-action-faster = Faster
ztts-action-quieter = Quieter
ztts-action-louder = Louder
ztts-action-previous-sentence = Previous sentence
ztts-action-next-sentence = Next sentence
ztts-action-previous-paragraph = Previous paragraph
ztts-action-next-paragraph = Next paragraph
ztts-action-play = Play / pause / resume
ztts-action-return = Go to reading position and switch to auto-scroll
ztts-action-options = Player options
ztts-action-stop = Stop reading everywhere
ztts-action-word-highlight = Word highlight on / off
# The toast the volume keys show, where the speed's shows `1.3×`
ztts-volume-toast = Volume { $percent }%
# The stop key's toast (issue #71): how many players it closed
ztts-stopped-toast = Stopped Read Aloud in { $count ->
        [one] one tab
       *[other] { $count } tabs
    }
# The highlight key's toast (issues #67 and #114): what is highlighted now
ztts-highlight-toast-both = Highlight: word and sentence
ztts-highlight-toast-word = Highlight: word
ztts-highlight-toast-sentence = Highlight: sentence
# The word toast on a voice without word timing: the switch changed, the screen did not
ztts-highlight-toast-word-no-timing = Highlight: word (this voice has no word timing, so the sentence stays highlighted)
# The hint on Zotero's own Highlight current menulist, greyed while the plugin runs (ui/zotero-highlight-menu.ts, issue #114)
ztts-zotero-highlight-hint = Chosen in OpenReader's settings, under Highlight

## Backup and Sync (ui/backup-rows.ts, ui/webdav-rows.ts)

# The file dialogs' titles
ztts-picker-backup = Backup OpenReader settings
ztts-picker-restore = Restore OpenReader settings
ztts-backup-saved = Saved to { $path }. The file holds every setting, the API keys, gateway headers and WebDAV password included — keep it private.
ztts-backup-failed = Backup failed: { $detail }
ztts-restore-confirm = Replace the current settings with the { $count } in { $path }?
ztts-restored = Restored { $count } settings from { $path }.
ztts-skipped = Skipped { $count }: { $keys }.
ztts-checking-providers = Checking the providers and the WebDAV folder it turns on…
ztts-providers-uncheckable = The providers could not be checked: { $detail }
ztts-restore-failed = Restore failed: { $detail }
ztts-positions-saved = Saved { $count } reading positions to { $path }.
ztts-export-failed = Export failed: { $detail }
ztts-positions-merged = Merged { $count } reading positions from { $path }; { $taken } were newer and were taken.
ztts-import-failed = Import failed: { $detail }
ztts-webdav-testing = Testing…
ztts-webdav-uploading = Uploading…
ztts-webdav-looking = Looking…
ztts-webdav-connected = Connected to { $url }.
# On the restore's line, after the folder a restore turned on failed its check (issue #175)
ztts-webdav-turned-off = The WebDAV folder failed its check here, so it is off.
# After Enable's or Test connection's line, for an http:// folder (issue #174)
ztts-webdav-plain-http = Warning: http:// is not encrypted, so the password and the settings sent here, API keys included, can be read on the way. Use https:// if the server supports it.
ztts-upload-failed = Upload failed: { $detail }
ztts-webdav-uploaded = Backed up { $count } settings to { $file }. The file holds every setting, the API keys, gateway headers and WebDAV password included — keep the folder private.
ztts-webdav-none = No settings backup on { $url } yet.
# The picker when the server holds several computers' files: its title, and one line per file
ztts-webdav-pick-title = Restore settings from which computer?
ztts-shared-file = shared file (before 1.11)
ztts-date-unknown = date unknown
ztts-settings-file-label = { $who } — { $when }
# The confirm before a restore from the server, with the file's machine and date when it carries them
ztts-webdav-restore-confirm = Replace the current settings with the { $count } on { $url }?
ztts-webdav-restore-confirm-machine = Replace the current settings with the { $count } of { $machine } on { $url }?
ztts-webdav-restore-confirm-saved = Replace the current settings with the { $count } on { $url }, saved { $time }?
ztts-webdav-restore-confirm-machine-saved = Replace the current settings with the { $count } of { $machine } on { $url }, saved { $time }?
ztts-webdav-machine-file = This computer's backup on the server is { $file }.

## The reader: the line shown when Read Aloud does not start with the remembered voice (read-aloud/read-aloud-memory.ts, issue #35)

ztts-substitute = OpenReader: { $missing } is not offered here. Reading with { $instead } instead.
ztts-substitute-none = OpenReader: { $missing } is not offered here, and no other voice of OpenReader is. Zotero picks the voice.
ztts-substitute-paid = OpenReader: { $missing } is not offered here, and no other voice of OpenReader is. Zotero picks the voice; it may use credits.

## Scrolling (issue #155: its own section, out of Highlight)

ztts-heading-scrolling = Scrolling
ztts-default-auto-scroll =
    .value = Default scrolling
ztts-follow-auto =
    .label = Auto-scroll
ztts-follow-manual =
    .label = Manual-scroll
ztts-help-default-auto-scroll =
    .value = ?
    .help = Whether new document tabs start in A (automatic) or M (manual); the player's A/M changes only its own tab.

ztts-auto-scroll =
    .value = Auto-scroll style
ztts-auto-scroll-line =
    .label = Scroll at every line
ztts-auto-scroll-sentence =
    .label = Scroll at every sentence
ztts-auto-scroll-outside =
    .label = Scroll when outside the view
ztts-help-auto-scroll-line =
    .value = ?
    .help = Brings each new line the highlighted word moves onto to the reading line; without a highlighted word, scrolls at every sentence.
ztts-help-auto-scroll-sentence =
    .value = ?
    .help = Brings each new sentence to the reading line, even when it is already visible.
ztts-help-auto-scroll-outside =
    .value = ?
    .help = Scrolls a sentence to the reading line only when it is not fully visible.
# The reading line (issue #155): the row's label, then the words before the field
# and the words after it, so each language can put "from the top" on its own side.
# Neither may be empty: the pane's check reads a blank message as untranslated.
ztts-reading-line =
    .value = Reading line
ztts-reading-line-before =
    .value = at
ztts-reading-line-after =
    .value = % from the top
ztts-help-reading-line =
    .value = ?
    .help = How far down automatic scrolling places the sentence: 0% at the top, 50% centered, 100% at the bottom. Paginated EPUBs turn by page instead.

ztts-key-auto-scroll =
    .value = Auto-scroll mode
ztts-help-key-auto-scroll =
    .value = ?
    .help = Cycles the auto-scroll style: every line, every sentence, when outside the view. The choice is saved for every document.
ztts-action-auto-scroll = Auto-scroll mode
ztts-key-previous-voice =
    .value = Previous voice
ztts-key-next-voice =
    .value = Next voice
ztts-help-key-voice =
    .value = ?
    .help = Switches to the previous or next voice in the player's list without stopping. Preparing the new voice may use your provider's quota.
ztts-action-previous-voice = Previous voice
ztts-action-next-voice = Next voice
ztts-voice-preparing = Preparing voice: { $voice }
ztts-voice-failed = Could not switch to { $voice }. The previous voice is kept. Please try again.
ztts-voice-unavailable = The voice list is not ready. Open the player and try again.
ztts-auto-scroll-toast-line = Auto-scroll: scroll at every line
ztts-auto-scroll-toast-sentence = Auto-scroll: scroll at every sentence
ztts-auto-scroll-toast-outside = Auto-scroll: when outside the view
# The annotate keys (issue #145): Zotero's own H and U, bindable
ztts-key-highlight-sentence =
    .value = Highlight sentence
ztts-key-underline-sentence =
    .value = Underline sentence
ztts-help-key-annotate =
    .value = ?
    .help = Highlights or underlines the sentence being read and opens its annotation popup; early in a sentence, the one just finished. The other key switches between the two while the popup is open.
ztts-action-highlight-sentence = Highlight sentence
ztts-action-underline-sentence = Underline sentence

ztts-strip-angle-brackets =
    .label = Remove enclosing brackets when reading
ztts-bracket-pairs =
    .aria-label = Bracket pairs to remove
ztts-help-strip-angle-brackets =
    .value = ?
    .help = Removes brackets that enclose text, keeping the words inside; pairs separated by spaces, for example <> [] () 【】. Uncheck to edit the list; applies after reopening the player.
ztts-bracket-use-defaults = Use defaults
ztts-bracket-error-empty = Enter at least one bracket pair, separated by spaces. Use the default list <> [] instead?
ztts-bracket-error-entry = Invalid pair “{ $entry }”. Each pair must contain exactly two different punctuation or symbol characters. Use the default list <> [] instead?
ztts-bracket-error-duplicate = Duplicate pair “{ $entry }”. Enter each pair only once. Use the default list <> [] instead?


ztts-player-heading = Player
ztts-player-layout = Layout
ztts-player-bottom = Bottom bar
ztts-player-floating = Floating panel
ztts-player-top = Top bar
ztts-player-provider = Provider
ztts-player-locale = Language
ztts-player-voice = Voice
ztts-player-play = Play
ztts-player-pause = Pause
ztts-player-speed = Speed
ztts-player-volume = Volume
ztts-player-automatic = Automatic scrolling. Click to switch to manual until you explicitly switch back.
ztts-player-manual = Manual scrolling. Click to go to the reading position and switch to automatic.
ztts-player-search = Search
ztts-player-empty = No matches
ztts-player-loading = Loading voices…
ztts-player-no-voices = No voices available. Enable a provider in OpenReader settings.
ztts-player-favorite = Favorite
ztts-player-unfavorite = Remove favorite
ztts-player-retry = Retry
ztts-player-buffering = Buffering…
ztts-player-unavailable = Read Aloud is unavailable in this document.
# When the player cannot load in a document, Zotero's own player does not stand in (issue #134, ADR 0007)
ztts-player-failed = The OpenReader player could not load here. To read aloud with Zotero's own player meanwhile, turn OpenReader off under Tools → Plugins.
ztts-player-unavailable-choice = This voice or language is no longer available. Choose another one.
ztts-player-invalid-value = The selected value is not supported.
ztts-player-playback-error = Playback failed. Check your provider connection and try again.
ztts-player-quota-error = The provider has reached its limit or has insufficient credits.
# A Zotero voice's two account errors, as the player's ! says them (issue #140); $tier is Zotero Standard or Zotero Premium
ztts-player-zotero-short = Not enough remaining time on { $tier } for this voice.
ztts-player-daily-limit = { $tier } has reached today's limit.
ztts-player-favorite-guard = This change would remove a voice in use. Close the player in the affected tabs before changing it.

ztts-player-options = Options
ztts-player-previous-paragraph = Skip to Previous Paragraph
ztts-player-previous-sentence = Skip to Previous Sentence
ztts-player-next-sentence = Skip to Next Sentence
ztts-player-next-paragraph = Skip to Next Paragraph

ztts-playback-preparing = Preparing…
ztts-playback-failed = Unable to prepare audio. Try playing again.

ztts-action-player-layout = Player layout
ztts-key-player-layout =
    .value = Player layout
ztts-help-key-player-layout =
    .value = ?
    .help = Cycles Top bar → Bottom bar → Floating panel while the player is open; all players share the layout.

ztts-document-voice-unavailable = The saved voice ({ $voice }) is unavailable. Choose a voice in the player to continue.
ztts-default-voice-required = Choose a default voice in OpenReader settings before reading.

ztts-remaining-time =
    .label = Show estimated remaining reading time
ztts-help-remaining-time =
    .value = ?
    .help = Listening time left in the document and its current section, or in the selection, at your speed. Manual pauses and network waits do not count down.
ztts-time-estimating = Estimating…
ztts-time-unavailable = Estimate unavailable
ztts-time-finished = Finished
ztts-time-document = Doc
ztts-time-selection = Selection
ztts-time-minutes = <{ $minutes } min
ztts-time-summary = { $name } { $time }

ztts-time-section = Section
ztts-time-pair = { $document } · { $section }

# Independent follow actions (#153)
ztts-key-locate =
    .value = Go to reading position
ztts-action-locate = Go to reading position
ztts-help-key-locate =
    .value = ?
    .help = Acts only while the player is open: shows the sentence being read once, without changing A/M or resuming paused audio.
ztts-key-following =
    .value = Switch A/M
ztts-action-following = Switch A/M
ztts-help-key-following =
    .value = ?
    .help = Switches this document between A and M, like the player's A/M button; switching to A also shows the current sentence.
