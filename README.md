# Rajongoi TCG

A browser card game: **Duel Masters** basics (shields, Shield Triggers, attacking tapped units, a direct attack to win) combined with **Riftbound**-style mechanics (Legend, Champion Slot, Signature cards, Gear, a rune Mana Deck, Action/Reaction spells on a stack).

- **Play vs AI**: choose your deck and the AI's deck, then press Start.
- **Collection**: browse the OGN and DND sets and Tokens, with filters by type and color.
- **Decks**: four premade decks, a deck builder with live rule checks and a mana curve, and import/export as JSON.

It's a static site with no build step and no dependencies, so it works on GitHub Pages as-is.

## Mascot

`img/mascot.svg` (the watermelon smiley, a sharp vector redraw of `img/mascot-original.png`) is the epic home-page background, with spinning rays, a glow and floating seeds. It also appears faintly on every card back and on the booster packs. To change it, replace that file.

## Sound

All sound effects are generated live with the Web Audio API (`js/ui/sfx.js`): filtered noise, tuned oscillators, envelopes, a reverb and a compressor, so there are no audio files. They cover:
- UI clicks and hovers, and page changes.
- Booster packs: shake, tear, dealing, flips, and rarity reveals.
- The game: card play, spells, gear, runes, turn gong, attacks, blocks, fights, destruction, shield shatter, Shield Triggers, the foil landing boom, the Mighty crack, and the win and lose fanfares.

The 🔊 button in the top bar mutes all sound. The setting is remembered.

## Booster packs

The **Boosters** page opens 15-card packs with an animation: the pack tears open, the cards are dealt face down, and rarer cards glow before they flip. A pack contains:
- 10 Commons. A Legend may replace one, in about 1 of 6 packs.
- 3 Uncommons.
- 1 Rune or Token.
- 1 Champion or Signature in about 1 of 8 packs. Otherwise this slot is a Rare, or an Uncommon if the set has no Rares.

Odds are set in `js/engine/booster.js`. The page remembers which cards you have pulled (in browser storage) and marks first-time pulls as **NEW**. The database has no rarity column, so its cards get a rarity from their type until a finished card sets the real one: Signatures and Legends are epic, Champions rare, cards costing 4 or more uncommon, and the rest common.

## Run

Double-click `index.html`; no server is needed. A local server also works:

```bash
python3 -m http.server 8080
```

After changing code in `js/` or JSON in `data/`, rebuild the bundles:

```bash
npm run build
```

The browser loads the generated `js/bundle.js` and `data/data.js`. Both importers rebuild `data/data.js` automatically.

```bash
npm test
```

`npm test` runs headless AI-vs-AI games for every premade deck pairing.

## Publishing on GitHub Pages

Repo → Settings → Pages → *Deploy from a branch* → `main` / root.

---

## Rules (as implemented)

### Deck construction
| | |
|---|---|
| Main deck | **20 cards, 1 copy each.** The Legend and tokens don't count. |
| Legend | 1. Its 2 colors limit the deck's colors. Its passive is always active. |
| Champion Units | 1–3. At least one shares the Legend's name (`Varok, …` ↔ `Varok, Ashen Warlord`) and starts in the **Champion Slot**. |
| Signature cards | Up to 2. They must belong to the Legend (`legend` field, or a tribe matching the Legend's name). One starts in the **Signature Slot**. |
| Mana Deck | 12 runes in the Legend's colors (6/6 by default). |
| Guide (warnings only) | 6–9 Units, 6–9 Spells, 0–2 Gear, average cost ≈ 4, curve 1:3 · 2:4 · 3:4 · 4:3 · 5–10:1 each. |

### Setup
Shuffle the deck. The top 5 cards become face-down **Shields**. Draw 5 cards; you may put up to 2 on the bottom of the deck and redraw that many. A coin flip decides who goes first. The Legend, Champion Slot and Signature Slot start on the table, and the slot cards can be played from there.

### Turn
1. **Start**: untap everything and resolve start-of-turn effects.
2. **Draw** 1 card. If your deck is empty, take a Shield into your hand instead; with no Shields left, you lose.
3. **Mana**: channel 2 runes from the Mana Deck. The second player channels 3 on their first turn.
4. **Play**: play Units, Spells and Gear. Tap runes equal to the cost, and **at least 1 rune must match a color of the card**. **Recycle N** is an extra cost: put N runes of the card's color (tapped or untapped) on the bottom of the Mana Deck.
5. **Combat**: attack with untapped Units one at a time. Units can't attack the turn they're played unless they have Haste or an active Nostalgia Line. Legal targets:
   - the opponent's **Shields** (breaks 1 Shield, 2 with *Breaker*). A broken Shield goes to its owner's hand, and a **Shield Trigger** can be played for free immediately.
   - a **Direct Attack**, only when the opponent has no Shields. **If it connects, you win.**
   - a **tapped** enemy Unit: higher Might wins and the loser is destroyed. On a tie, both are destroyed.

   After an attack is declared, the defender may redirect it to an untapped **Defensive** Unit. Then both players may cast **Action** spells (only while the stack is empty) and **Reaction** spells (any time, including in response) onto a **stack**. The stack resolves last-in-first-out, and then the fight resolves.
6. **End**: "this turn" effects expire.

Units with 0 or less Might are destroyed. Gear uses 2 slots; playing a third Gear makes the oldest one expire. *Saga* Gear expires after N uses.

### Keywords
Shield Trigger · Shieldify N · Defensive · Deathtouch · Haste · Breaker (Double Breaker) · Party Breaker · Slow Start · Unstoppable · Immobile · Furious (must attack each turn) · Assault · Vigilance · Elusive · Action · Reaction · Nostalgia Line (uses the player's real local time, 16:00–22:00).

Shown on the card but not enforced by the game: Being Áron, Deflect, Tank, Accelerate, Hoodie Gear's cost discount, 100 Forint's joke.

Cards with **"choose one/two"** offer one button per choice when played. A **Furious** unit blocks "End turn" until it has attacked.

---

## Card data

| File | What |
|---|---|
| `data/cards.json` | **All cards from the database** (`RajongoiTCG.accdb`), generated placeholder Legends and neutral Filler cards. |
| `data/decks.json` | One premade deck per "Deck of" owner, also generated. |
| `data/imported.json` + `data/img/` | **Finished cards** from riftcardmaker.net. These override the database row with the same id (`OGN-001` …). |
| `data/effects.json` | Hand-written game-logic overrides, keyed by card id. |

### Updating from the Access database

```bash
python3 tools/import_accdb.py RajongoiTCG.accdb
```

This needs mdbtools (`apt install mdbtools` / `brew install mdbtools`). Every table becomes a set, named by the first word of the table (`OGN 2026-01 (300)` → `OGN`), and `ID` becomes the card number (`OGN-007`). The columns map like this:
- `Mana` → cost
- `Might` → Might
- `Recycle` → runes of the card's color you recycle to the bottom of your Mana Deck as an extra cost
- `Shield Trigger` → keyword
- `Tag` → tribe
- `Deck of` → which premade deck the card goes into (`A/B` puts it into both)
- `FLAG` → shown as WIP

Gaps are filled so the game stays playable:
- **Missing Mana/Might** get provisional numbers, shown with a dashed outline. The form's default `0 / 1 / 0` counts as missing.
- **Spells and Gear without a description** get a provisional effect based on `Purpose` (Counterspell, Draw engine, Late AOE Clear, …) or on their color. These show a grey *Provisional* badge.
- **Cards whose description the engine understands** get real logic from `CARD_LOGIC` in the script.
- **Each deck gets a placeholder Legend** (OGN has no Legends yet) named after the owner's Champion, so the "same name" rule holds. The Legend's two colors are the deck's most common ones, and cards outside them are left out.
- **Decks under 20 cards** are completed with neutral **Filler** cards following the Assembly Guide curve. **Decks over 20** are trimmed, keeping fully designed cards first.

### Playable premade decks

Only the decks of the owners in `PLAYABLE_OWNERS` (in `tools/import_accdb.py`, currently Lui and Balu) can be played in **Play vs AI**. The others are listed as *Coming soon*: neither you nor the AI can pick them, and they can't be copied. To unlock a deck, add its owner to the list and re-run the database import.

### Adding finished cards (riftcardmaker export)

```bash
node tools/import-riftcardmaker.mjs ~/Downloads/*.json
```

Use `--fresh` to rebuild `imported.json` from only the given files. When several exports of the same card are passed, the last one wins.

A card is matched to its database row by name and type, so a typo'd printed number still lands on the right card. Example: *Darkest Dungeoneers* is printed 179, but it is ID 45 in the database. A new card printed with a number the database already uses (*Lutheria*, DND 002/003) keeps that number, and the next database import moves the old row to a free number. Exports also work for:
- **Legends**: they replace the deck's placeholder Legend.
- **Runes**: their art is used for that player's runes on the table.
- **Subnames**.

**Frames follow rarity and type:**
- **Common:** copper frame.
- **Uncommon:** silver frame.
- **Rare:** gold frame, with the art behind the whole card and the text over it.
- **Signature, Legend and EPIC cards:** full-art frame.
- **Gear:** the cost sits in a diamond.
- **Recycle:** a pill directly under the cost, with one rune per Recycle point. It is split in two colors for two-color cards, and either color can be recycled.
- **Rules text:** auto-fitted to its box. The in-game preview also shows the card's text written out below the card.

If an export has no `rarity`, its rarity icon decides the frame.

**Foil:** Champions, Legends and EPIC cards (which includes all Signatures) get a holographic foil shine everywhere: in the Collection, in boosters and in game. The shine follows the mouse pointer. It is set by `isFoil()` in `js/ui/card.js`.

The earlier full-art note still applies: **EPIC Champions and Legends** use the full-art frame: the artwork covers the whole card, placed with the export's crop data. They also get the gold frame, the colored name band and white rules text over the art.

Cards without artwork show a generated placeholder: a gradient in the card's colors, a type symbol and the card's initials.

The importer reads the id from `setInfo` (`OGN 005/300` → `OGN-005`, `Token 003` → `TKN-003`). It maps `energy` → cost, `might` → Might and `power` → Recycle, and extracts the image. Keywords written as `{Keyword#HEX}` are detected automatically. Plain-text effects need an entry in `data/effects.json`:

```json
"OGN-004": { "effects": [ { "do": "tap", "target": "anyUnit" } ] }
```

### Effect reference
An effect is `{ "on": <trigger>, "do": <action>, "target": <target>, ...params }`.

- **on**: `play` (default), `attack`, `destroyed`, `turnStart`, `unitPlayed`, `spellCast`, `static` (Legend/Gear/Unit passives), `activate` (Gear: tap, plus optional `activateCost` on the card).
- **do**: `draw {amount, who?:"opponent"}` · `destroy {maxPower?, filter?}` · `tutor {kind, name?}` · `mightPerRune {color}` (static) · `buff {amount, duration:"turn"|"permanent", filter?:{color, keyword}}` (negative amounts lower Might) · `tap` · `untap` · `bounce` · `breakShield {amount}` · `addShield {amount}` · `shieldify {amount}` · `channel {amount, tapped?}` · `discard {amount}` · `recover` · `grantKeyword {keyword}` · `token {tokenId, amount}`.
- More effects: `ready` · `morph {power}` · `sacrificeSelf` · `breakOwnShield` · `lockShields` · `sealTriggers` · `doubleNext` · `counter {maxCost}` · `splitDestroy {amount}` · `summonNamed {name, from, ready}`. Any effect can take `limit`, `minPower` and `ifInPlay`. `duration` can be `"nextTurn"`.
- Card fields: `modes` + `chooseModes` / `opponentChooses` · `costReduction {perRunePair | perGraveTribe}` · `attackBonus` / `defendBonus` · `escapeOnce` · `surviveRoll` · `activateNoTap` · `unstoppableIfTribe` · `requiresStack` · Legend `championNames`.
- New triggers: `enemyAttack`. `unitPlayed` can take `ifSubjectMighty` and `tapSource`.
- **target**: `enemyUnit`, `friendlyUnit`, `anyUnit`, `enemyTappedUnit`, `enemyGear` (the player picks one) · `allEnemyUnits`, `allFriendlyUnits`, `allUnits`, `self`, `played`.
- `filter`: `{color, notColor, type, notType}`, e.g. `{"notType":"champion"}`.
- Units can have `activate` abilities too (tap: …).
- Card-level fields: `keywords`, `recycle`, `uses` (Saga), `activateCost`, `afterCast:"deckTop"`, `sigType` (`unit`/`spell`/`gear` for Signature cards), `legend` (the Signature's Legend id).

## Code layout
```
js/engine/   rules.js · cards.js · game.js (state machine) · ai.js · deck.js   ← pure JS, no DOM; also runs in Node
js/ui/       card.js (card frame) · collection.js (collection, decks, builder) · play.js (board)
js/app.js    router + home page
tools/       Access-database importer, riftcardmaker importer, data bundler
tests/       AI-vs-AI simulation
```
