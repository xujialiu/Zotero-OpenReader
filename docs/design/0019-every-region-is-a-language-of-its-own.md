# Every region is a language of its own

*The engineering half is [ADR 0019](../adr/0019-every-locale-is-a-language-named-as-openreader-names-it.md).*

In the player's language list and in the voice browser, every region,
dialect and script a provider offers is now a language of its own. Azure's
Chinese reads Cantonese, Chinese (China), Chinese (Guangxi), Chinese
(Henan), Chinese (Hong Kong), Chinese (Liaoning), Chinese (Shaanxi),
Chinese (Shandong), Chinese (Sichuan), Chinese (Taiwan) and Wu Chinese.
Before, everything but the dialects was one Chinese of about forty voices.

## Why

The Cantonese and Taiwanese voices were in that one list with the Mandarin
ones. Their names are their own Chinese names, such as 晓晓, 曉曼 and 曉臻, so
nothing on the screen said which voice was which. Finding a Cantonese voice
meant trying them one by one. The phone already lists each region apart,
so the same voice was filed in two different places on the two devices.

The lists followed Zotero's own player, which keeps one Chinese. Zotero
sells Chinese in mainland voices only, so it never needed more. The voices
the owner brings do.

## How a language is named

A name says only what tells a language apart from the provider's others of
the same language, the same rules as on the phone:

- A dialect by its place alone: Chinese (Liaoning).
- Hong Kong and Macao by those names, not "Hong Kong SAR China".
- A writing system where only it differs: Serbian (Cyrillic) and
  Serbian (Latin), Inuktitut (Syllabics) and Inuktitut (Latin).
- A country only where the provider has the language in several, as
  before: English (United States) beside English (United Kingdom), but a
  lone Japanese just Japanese.

The phone names languages in English. Here the names follow Zotero's
language, so a Chinese Zotero reads 中文（香港） and 中文（辽宁）. Azure's
six dialects are translated. A dialect a provider adds later shows in Latin
letters until it is translated too.

Zotero Premium sells Arabic in two groups. One is the Arabic of the whole
Arab world, named Arabic (world), and the other is Saudi Arabia's. The
standard name for the first is a meaningless test region, so it is not
used.

## What the lists do

- **A language lists only its own voices.** Choosing Chinese (Hong Kong)
  shows the Hong Kong voices and nothing else. The same goes for a plain
  English without a country: it no longer shows the US and British voices
  under it.
- **Choosing a language still picks a voice:** the one last used for it,
  else the first, and a reading goes on with it. On the phone, choosing a
  language picks nothing until a voice is chosen. Here that would stop the
  reading.
- **Switching provider keeps the region** where the new provider has it. A
  Hong Kong voice on Azure becomes a Hong Kong voice on the system voices,
  not a Mandarin one.

## What stays as it was

The voice remembered for a language is still one for all its regions: after
a Hong Kong voice is picked, a Chinese document with no voice of its own
starts in Cantonese, as it did before when that voice was picked from the
one list. A document that has its own voice keeps it.

## Turned down

- **Keeping one Chinese and adding the region to each voice's name.**
  Cheaper, but the list would still be forty voices long, and the phone
  would still file the voice elsewhere.
- **English names everywhere**, exactly as on the phone. A Chinese Zotero
  would show an English list of languages among its translated settings.
