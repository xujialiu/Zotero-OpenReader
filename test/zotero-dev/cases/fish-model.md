[Checklist index](../README.md) · [Scripts](../scripts/fish-model/README.md)

## 1c. Fish Audio: the model and its guard (issues #181, #182)

Touches `zotero-tts.fish.*` (`enabled`, `model`, the retired `freeOnly`),
the settings window, a backup file in the scratch directory and one
fixture tab. Run with the owner's key, whose account has API credit 0
(2026-10-16): the free model answers, a paid one answers 402, so nothing
here can spend. That is also the safety net of 1c.3: if the guard let an
unknown model through, Fish would answer it as the paid `s2.1-pro`, and
on this account that is a 402, not a charge. The key is never printed.
Save every pref named above first and restore it at the end.

### 1c.1

1. **The entries.** Fish Audio off. Open the settings window: the Model
   dropdown `menulist#ztts-fish-model` lists, once Fish's own list has
   arrived (a keyless `GET https://api.fish.audio/compat/v1/models`, about
   a second), `s2.1-pro-free — free`, `s2.1-pro — $15 per million bytes`,
   `drama-3 — $50 per million characters`, `s2-pro — $15 per million
   bytes`, then `s1 — paid` while Fish still lists it; in a zh-CN Zotero,
   `s2.1-pro-free（免费）`, `s2.1-pro（每百万字节 $15）` and so on. The
   selected entry is `fish.model`. A pick writes the pref; Enable then
   locks the dropdown with the other fields, and a pick is impossible
   until Disable.

### 1c.2

2. **The upgrade.** With the previous release installed, set
   `extensions.zotero.zotero-tts.fish.freeOnly` to `false` and clear
   `fish.model`; install the build. `fish.model` reads `s2.1-pro`,
   `Zotero.Prefs.prefHasUserValue('zotero-tts.fish.freeOnly')` is false
   (the relative name alone: with `true` Zotero takes the name as the full
   one, and the answer is always false), and the debug store holds `[zotero-tts] Fish Audio reads with
   s2.1-pro: the free-model switch was off`. Repeat with `freeOnly`
   cleared (On, the default): `fish.model` stays unset and the dropdown
   shows `s2.1-pro-free — free`.

### 1c.3

3. **A model Fish does not offer is never asked for.** Fish Audio off;
   set `fish.model` to `s9-not-a-model` by pref. The dropdown's last entry
   reads `s9-not-a-model (not available)` and is selected. Test connection
   → `Connected, but synthesis failed: Fish Audio no longer lists the
   model s9-not-a-model` — not a 402, which would mean the request went
   out. Then put back `s2.1-pro-free`, Enable, start reading
   `fixture-a.pdf` on a Fish Audio voice, and set `fish.model` to
   `s9-not-a-model` by pref while it reads: from the next sentence that
   is not yet prepared, the Player shows `Fish Audio no longer offers the
   chosen model, or OpenReader could not confirm that it does. Choose
   another model under Settings → OpenReader → Fish Audio.`, and no
   `fish: … word timestamps … (s9-not-a-model)` line appears.

### 1c.4

4. **A change of model is heard.** Reading on the free model, a sentence
   read twice the second time logs `(cached)`. Set `fish.model` to
   `s2.1-pro` by pref and replay it: no `(cached)`, and the reply is the
   402 of item 1a.4 — the old model's audio is not served for the new one.

### 1c.5

5. **An old backup.** Restore a backup file whose settings hold
   `"fish.freeOnly": false` and no `fish.model`: the restore reports no
   ignored key for it, and `fish.model` reads `s2.1-pro`.

### 1c.6

6. **Restore** every saved pref, close the fixture tab and the settings
   window; `diagnostics.l10n()` → `blank: []`, no plugin error in the
   error console.
