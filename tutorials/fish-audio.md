# Fish Audio: cloned voices, a free model, word highlighting

**English** · [简体中文](fish-audio.zh.md)

[Fish Audio](https://fish.audio) is a voice-cloning service: every voice on
it was made from a short recording — by its users, or by you — and its
models speak 83 languages. The plugin's **Fish Audio**
section reaches it with one API key, and Read Aloud highlights word by
word with these voices, as it does with Azure's and Kokoro's. This page:
the key, what is free and what costs, and how a voice gets into the
player.

## The key

1. Sign up at [fish.audio](https://fish.audio), click **Open App**, and
   choose **Developer** at the top of the left sidebar.
2. **API Keys** → **Create API Key** (or go straight to
   [fish.audio/app/api-keys](https://fish.audio/app/api-keys/)): name it,
   leave **Expiration** on **Never** — reading stops the day a key
   expires — and click **Create**. Copy the key right away: the list
   shows it masked afterwards.
3. In Zotero, **Edit → Settings → OpenReader → Fish Audio**: paste it
   into **API key**, click **Test connection**, then **Enable**.

## The model

The block's **Model** dropdown chooses the model every Fish Audio voice
reads with. It starts on the free one, and each entry says whether it is
free; what a paid one costs is on Fish Audio's
[pricing page](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits).
To change it, click **Disable**, choose, then **Enable**, which tries the
new model.

- **s2.1-pro-free** — free, and it needs no balance on the account. Its
  terms, in Fish Audio's words: no cap on the amount of text, no
  guarantee of speed, and the text you send may be kept to improve their
  models. It was announced as a limited-time offer and has been extended
  more than once — as of October 2026, through November 30, 2026; it may
  end.
- **s2.1-pro** — the same model, paid.
- **drama-3** — Fish Audio's newest model, from October 2026, which gets
  names and technical terms right more often; paid.
- **s2-pro** — the model before S2.1 Pro; paid.
- **Any other model** Fish Audio's own list carries comes after these,
  marked free or paid.

The paid models are billed to your **API credit**, the **Balance** under
**Developer → API Billing**, filled with **Top Up**. It is separate from
the website's own plan and credits under **Creative → Billing**. With no
API credit, **Test connection** says *Insufficient API credit* and
nothing plays until you top up or choose the free model again.

**When a model stops.** Fish Audio answers a model it no longer offers
with the paid S2.1 Pro, billed to your API credit, and says nothing; the
plugin cannot tell either. So when the free model's free access ends, or
Fish Audio retires the model you chose, check the dropdown — or keep no
API credit while you read with the free model: then reading stops with
*Insufficient API credit* instead.

## Voices

Voices appear under **Fish Audio** in the player's first dropdown, by name.
Only **Official voices** starts on; **Your voices** and **Manual voices**
start off. The three source switches work independently.

- **Official voices.** Voices published by **Fish Official** are listed
  automatically. Community voices are added only when you enter their
  Model IDs yourself.
- **Your voices.** Voices created by your Fish Audio account are listed
  without pasting their IDs: those on the **My Voices** tab of the
  website's **My Voices** page. A voice you only bookmarked or liked is
  not; add it by its Model ID.
- **Manual voices.** Offers the voices entered in **Voices (Model IDs)**. Turning
  this switch off hides them without erasing the saved IDs.
- **Voices (Model IDs).** Fish Audio calls each voice's identifier its
  Model ID. Click **Model IDs** in the field label to open the
  [Fish Audio discovery page](https://fish.audio/app/discovery/). Open a
  voice's page, click **⋯** → **Copy Model Id**, and paste it here; the
  ID is also the last part of that page's address,
  `fish.audio/app/m/<id>`. Separate several with commas or spaces.
  The **?** beside the field points to that page. Existing pasted voice
  links still work. To edit the field, **Disable** the cloud block first,
  then **Enable** it again.
- **Changing a source.** **Disable** Fish Audio first to unlock its
  source choices, then **Enable** it after making changes. If a player
  is open, disabling asks to stop reading first. A duplicate voice
  appears only once and stays listed as long as an enabled source
  supplies it.
- **Language.** Voices are grouped by their language, or under
  *Multilingual* when they list several. English voices with a
  published regional accent are grouped separately, such as English
  (United States), English (United Kingdom), and English (India).
  English voices without a region stay under English.
- **Default.** The model's own voice is included with **Your voices**, even
  if your account has no custom voices. Turn **Your voices** off to hide it.
  With all three sources off, no Fish Audio voices are available;
  **Test connection** still works. If a saved voice becomes unavailable,
  choose another voice before reading.
- **Updating the list.** **Enable** and **Test connection** reload the
  Fish Audio voice list. Repeated openings reuse the loaded list until
  Zotero restarts. A failed list reload keeps the last successful voices
  with a warning; changing the API key does not reuse another account's
  list.

**Test connection** counts the listed voices and checks that the model
can speak. A manually entered voice whose page has gone is listed as
*(not found)* until you remove its ID.

## Good to know

- *A sentence takes about two seconds* to arrive, the first one of a
  session a little longer; the player fetches ahead, so reading is
  continuous.
- *A very long passage* — a paragraph without a period, a table read as
  one sentence — takes proportionally longer: a minute and a half of
  speech arrives in about forty seconds.
- *What is sent* is the sentence being read, and the id of the voice.
- *Speed* is the player's own slider, as with every voice; nothing is
  regenerated.
