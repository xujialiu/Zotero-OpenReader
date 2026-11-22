[Checklist index](../README.md) · [Scripts](../scripts/openai-split/README.md)

## OpenAI, Xiaomi MiMo and OpenAI Compatible (issues #113 and #115)

Three provider sections where there was one with a **Server** dropdown:
**OpenAI** (`openai-official`: API key, Model, Voices; api.openai.com,
fixed), **Xiaomi MiMo** (`mimo`: the same three; api.xiaomimimo.com,
fixed, the chat completions route) and **OpenAI Compatible** (`compatible`:
Address, API key, Model, Voices, Extra headers). Each is a provider of its
own — switch, Test connection, entry in the player's first dropdown and
the voice browser's first column, voice ids `<id>::<voice>` — and all
three can be on at once.

1. **Upgrade with a retired OpenAI section (#115, 1.17.3).** Take the
   baseline on the previous build in a disposable profile with WebDAV
   off. After startup, set synthetic `openai.server` and `openai.model`
   preferences alongside a different current `mimo.model`. Install
   the new build. Expect all three preferences to keep their values,
   the provider switches to keep their baseline values and every
   startup step to succeed. Restore the seeded preferences. File
   restore and shared settings merge are covered by unit tests.
2. **The pane.** Settings → OpenReader: no `ztts-openai-server` menulist
   and no `ztts-provider-openai` groupbox; `ztts-provider-openai-official`
   right after `ztts-provider-local`, its `h2` `OpenAI (platform.openai.com)`
   with the host a `zotero-text-link`, then rows API key (password, pref
   `openai-official.apiKey`, a `?` `ztts-help-openai`), Model (text, list
   `ztts-openai-official-models`), Voices (placeholder `built-in voices`),
   the buttons `ztts-enable-openai-official` / `ztts-test-openai-official`
   and `ztts-test-result-openai-official`; `ztts-provider-compatible` next,
   `h2` `OpenAI Compatible` (plain text), rows Address (placeholder
   `http://localhost:8004`, a `?` `ztts-help-compatible`), API key, Model
   (list `ztts-compatible-models`), Voices (placeholder `the server's own`),
   Extra headers (password, placeholder `Name: value; Name: value`, the
   `?` `ztts-help-extra-headers`), the buttons; `ztts-provider-mimo`
   between `ztts-provider-system` and `ztts-zotero-section`, `h2` `Xiaomi
   MiMo (platform.xiaomimimo.com)` linked, rows API key (`?`
   `ztts-help-mimo`), Model (list `ztts-mimo-models`), Voices, the buttons.
   The provider groupboxes stand Azure · Cloudflare Workers AI · Fish Audio
   · Fish Speech · Kokoro-FastAPI · OpenAI · OpenAI Compatible · Speechify ·
   System voices · Xiaomi MiMo · Zotero: 19 groupboxes in the pane in all.
   The three sections show the configured values (key fields by length).
   zh-CN (item 1.10's route): the `?` texts in Chinese, the headings and
   `OpenAI Compatible` unchanged.
3. **Test connection, each section, nothing switched on.** Xiaomi MiMo
   (with a configured test key) → `Connected. Model mimo-v2.5-tts available. 9 voices
   available. Synthesis works.` within a few seconds, the datalist
   `ztts-mimo-models` filled with the account's models, `mimo-v2.5-tts`
   first; a request to `https://api.xiaomimimo.com/v1/chat/completions`
   and none to `/v1/audio/speech`. OpenAI Compatible (the Chatterbox set)
   → `Connected. 28 voices available. Synthesis works.`, `/v1/models` a
   404 tolerated. OpenAI (no key on this profile) → `No API key set for
   this provider.` with no request made. Address emptied on OpenAI
   Compatible (temporarily, restored right after) → `Cannot connect:
   OpenAI Compatible: no server address`, no request.
4. **Two of them on at once, each its own entry.** No player open. Enable
   Xiaomi MiMo and Enable OpenAI Compatible (each runs its check first) →
   `mimo.enabled` and `compatible.enabled` true, both sections locked.
   `diagnostics.providerTiers()` → `labels` holds `"openai-official":
   "OpenAI"`, `mimo: "Xiaomi MiMo"`, `compatible: "OpenAI Compatible"` (and
   no `openai` key). The voice browser's first column lists `OpenAI
   Compatible` and `Xiaomi MiMo` (sorted by name among the others), 28
   voices under the first (`Abigail.wav` … as their own names) and 9 under
   the second (`mimo_default`, `冰糖`, `茉莉`, `苏打`, `白桦`, `Mia`, `Chloe`,
   `Milo`, `Dean`), all under Multilingual; their ids
   `compatible::Abigail.wav`, `mimo::冰糖`. A fixture's popup opened muted
   lists the same two entries in its first dropdown; one sentence of
   `fixture-b.pdf` read with `mimo::冰糖` (`selectVoice`, paused in the
   same script) logs `[zotero-tts] mimo: no word timestamps for N chars
   (audio through /v1/chat/completions), highlighting the sentence`, and
   one with `compatible::Emily.wav` logs `[zotero-tts] compatible: no word
   timestamps for N chars, highlighting the sentence`. Nothing typed for
   one section reaches another: the MiMo request carries `Authorization`
   and no `CF-Access-Client-Id`; the Chatterbox request carries the two
   `CF-Access-*` headers and no `Authorization` (the debug store, or a
   fetch wrapper in the script).
5. **Restore.** The fixture closed and erased first, then Disable both
   (no player open); the three switches back to what item 1 found (all
   off here); the volume and the memory restored as the baseline says,
   and `reader.readAloudVoices` put back byte for byte from the pre-run
   read — Zotero's own `_persistCurrentVoice` rewrites its `mul` entry at
   every voice pick of item 4 (1397 → 1465 characters on the 2026-09-16
   run).
