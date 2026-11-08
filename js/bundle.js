(() => {
  // js/engine/rules.js
  var RULES = {
    DECK_SIZE: 20,
    // main deck (Legend + tokens not counted)
    MAX_COPIES: 1,
    // singleton
    MIN_CHAMPIONS: 1,
    MAX_CHAMPIONS: 3,
    MAX_SIGNATURES: 2,
    RUNE_DECK_SIZE: 12,
    // Mana Deck
    SHIELDS: 5,
    OPENING_HAND: 5,
    MULLIGAN_MAX: 2,
    CHANNEL_PER_TURN: 2,
    CHANNEL_SECOND_PLAYER_FIRST_TURN: 3,
    GEAR_SLOTS: 2,
    MAX_HAND: 12,
    // a card that would go to a full hand goes to the Graveyard instead
    MAX_BATTLE: 12,
    // Units a player can have on the Battlefield
    MAX_TURNS: 80
    // safety valve (total turns, both players)
  };
  var GUIDE = {
    units: [6, 9],
    champions: [1, 3],
    spells: [6, 9],
    gears: [0, 2],
    signatures: [0, 2],
    avgCost: 4,
    curve: { 1: 3, 2: 4, 3: 4, 4: 3, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 }
  };
  var COLORS = {
    Fury: { hex: "#d8433b", label: "Fury" },
    Calm: { hex: "#4b9a4b", label: "Calm" },
    Mind: { hex: "#3b82c8", label: "Mind" },
    Body: { hex: "#e07f27", label: "Body" },
    Chaos: { hex: "#8e4fc4", label: "Chaos" },
    Order: { hex: "#d6b02c", label: "Order" }
  };
  var TYPE_INFO = {
    legend: { label: "Legend", hex: "#b8892a" },
    champion: { label: "Champion", hex: "#b23a55" },
    unit: { label: "Unit", hex: "#4f8f3a" },
    spell: { label: "Spell", hex: "#2f7fa8" },
    gear: { label: "Gear", hex: "#7a6a55" },
    signature: { label: "Signature", hex: "#7b3fa6" },
    token: { label: "Token", hex: "#5d5d5d" },
    rune: { label: "Rune", hex: "#8a7a63" }
  };
  var KEYWORDS = {
    "Shield Trigger": { hex: "#CE356B", reminder: "If you got this from your Shield Zone, you may play it immediately for [0] mana." },
    "Shieldify": { hex: "#21705B", reminder: "When you play this, put [N] card(s) in your Shield Zone from your hand." },
    "Defensive": { hex: "#CE356B", reminder: "When an enemy Unit attacks, you may [T] this to redirect the attack to this Unit." },
    "Deathtouch": { hex: "#94B131", reminder: "Whenever this Unit loses in a fight, destroy the Unit that killed it." },
    "Nostalgia Line": { hex: "#CE356B", reminder: "This can attack the turn it is played if you play it between 16.00 - 22.00 local time." },
    "Haste": { hex: "#D9822B", reminder: "Can attack the turn it is played." },
    "Being \xC1ron": { hex: "#6D6E6B", reminder: "Table rule - resolved in real life, not by the game." },
    "Breaker": { hex: "#B03A2E", reminder: "Breaks 2 shields instead of 1." },
    "Party Breaker": { hex: "#CE356B", reminder: "Can attack untapped Units." },
    "Slow Start": { hex: "#6D6E6B", reminder: "Enters tapped." },
    "Indestructible": { hex: "#21705B", reminder: "Can't be destroyed." },
    "Unstoppable": { hex: "#6D6E6B", reminder: "This Unit's attacks can't be redirected." },
    "Action": { hex: "#6D5BD0", reminder: "Can also be played during combat." },
    "Reaction": { hex: "#2E8B9A", reminder: "Can be played during combat, even in response to another spell." }
  };

  // js/engine/cards.js
  var DB = /* @__PURE__ */ new Map();
  function setCardDb(list, overrides = {}) {
    DB = /* @__PURE__ */ new Map();
    for (const raw of list) {
      const c = normalize({ ...raw, ...overrides[raw.id] || {} });
      DB.set(c.id, c);
    }
    return DB;
  }
  function mergeSources(dbCards, imported) {
    const byId = new Map(dbCards.map((c) => [c.id, c]));
    for (const c of imported) {
      const db = byId.get(c.id);
      const m = { ...db || {}, ...c };
      if (db && db.type === "signature" && ["unit", "spell", "gear"].includes(c.type)) {
        m.type = db.type;
        if (db.sigType) m.sigType = db.sigType;
      }
      if (db && !(c.effects || []).length) m.effects = db.provisionalEffect ? [] : db.effects || [];
      if (db && db.provisionalEffect && c.uses == null) delete m.uses;
      if (db) m.keywords = [.../* @__PURE__ */ new Set([...c.keywords || [], ...db.keywords || []])];
      delete m.provisional;
      delete m.provisionalEffect;
      delete m.placeholder;
      m.wip = false;
      byId.set(c.id, m);
    }
    return [...byId.values()];
  }
  function rarityOf(def) {
    const r = String(def.rarity || "").toLowerCase();
    if (["epic", "legendary", "showcase", "overnumbered"].includes(r)) return "epic";
    if (["common", "uncommon", "rare"].includes(r)) return r;
    return "common";
  }
  function getDef(id) {
    const d = DB.get(id);
    if (!d) throw new Error(`Unknown card id: ${id}`);
    return d;
  }
  function hasDef(id) {
    return DB.has(id);
  }
  function allCards() {
    return [...DB.values()];
  }
  function normalize(c) {
    const def = {
      keywords: [],
      effects: [],
      colors: [],
      tribes: [],
      cost: 0,
      power: 0,
      rarity: "common",
      flavor: "",
      image: null,
      illustrator: "",
      ...c
    };
    def.colors = (def.colors || []).map(cap);
    def.type = (def.type || "unit").toLowerCase();
    applyRarityRules(def);
    def.tribes = (def.tribes || []).map((t2) => /^video ?game$/i.test(String(t2).trim()) ? "Game" : t2);
    if (def.type === "signature" && !def.sigType) def.sigType = "spell";
    def.recycle = def.recycle || 0;
    def.text = def.text && def.text.trim() ? def.text : describe(def);
    if (def.provisionalEffect) def.text = `{Provisional#7A7A7A}__(placeholder effect until this card is designed)__
${def.text}`;
    return def;
  }
  var isEpicMusical = (def) => /^EPIC\b/.test(String(def.name || ""));
  function applyRarityRules(def) {
    if (def.type === "legend") def.rarity = "rare";
    else if (def.type === "signature" || isEpicMusical(def) || def.fullArtRune || def.fullArt && def.image) def.rarity = "epic";
    else if (rarityOf(def) === "epic") def.rarity = "rare";
    return def;
  }
  var cap = (s) => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
  function kindOf(def) {
    switch (def.type) {
      case "unit":
      case "champion":
      case "token":
        return "unit";
      case "spell":
        return "spell";
      case "gear":
        return "gear";
      case "legend":
        return "legend";
      case "rune":
        return "rune";
      case "signature":
        return def.sigType || "spell";
      default:
        return "unit";
    }
  }
  function baseName(name) {
    return String(name || "").split(/[|,]/)[0].trim().toLowerCase();
  }
  function championMatchesLegend(champ, legend) {
    if (!champ || !legend) return false;
    const names2 = [legend.name, legend.subname, ...legend.championNames || []].filter(Boolean).map(baseName);
    return names2.includes(baseName(champ.name)) || !!champ.subname && names2.includes(baseName(champ.subname));
  }
  function signatureMatchesLegend(sig, legend) {
    if (!sig || !legend) return false;
    if (sig.legend) return sig.legend === legend.id;
    return (sig.tribes || []).some((t2) => baseName(t2) === baseName(legend.name));
  }
  function keywordMarkup(kw2, n) {
    const k = KEYWORDS[kw2];
    if (!k) return `{${kw2}#555555}`;
    const label = n != null ? `${kw2} ${n}` : kw2;
    const reminder = k.reminder.replace("[N]", `[${n ?? 1}]`);
    return `{${label}#${k.hex.replace("#", "")}}__(${reminder})__`;
  }
  var TARGET_TEXT = {
    enemyUnit: "target enemy Unit",
    friendlyUnit: "target friendly Unit",
    anyUnit: "target Unit",
    enemyTappedUnit: "target tapped enemy Unit",
    enemyGear: "target enemy Gear",
    allEnemyUnits: "all enemy Units",
    allFriendlyUnits: "all your Units",
    allUnits: "all Units",
    self: "this Unit",
    played: "that Unit"
  };
  var TRIGGER_TEXT = {
    play: (d) => kindOf(d) === "spell" ? "" : "When you play this: ",
    attack: () => "When this attacks: ",
    destroyed: () => "When this is destroyed: ",
    turnStart: () => "At the start of your turn: ",
    unitPlayed: () => "Whenever you play a Unit: ",
    spellCast: () => "Whenever you cast a Spell: ",
    static: () => "",
    lowShields: () => "When you are down to 1 shield or less: ",
    tribeCombo: () => "Once per turn, if you have played both a Movie and a Game card: ",
    activate: (d) => `[T]${d.activateCost ? ` + [${d.activateCost}]` : ""}: `
  };
  function describeEffect(e, def) {
    const t2 = TARGET_TEXT[e.target] || "target Unit";
    const n = e.amount ?? 1;
    const f = e.filter || {};
    const pw = (e.maxPower != null ? ` with [M]${e.maxPower} or less` : "") + (f.notType ? ` (not ${f.notType === "champion" ? "a Champion" : f.notType})` : "") + (f.color ? ` (${f.color} only)` : "") + (f.notColor ? ` (non-${f.notColor})` : "");
    const dur = e.duration === "permanent" ? "" : " this turn";
    switch (e.do) {
      case "draw":
        return e.who === "opponent" ? `Your opponent draws ${n}.` : `Draw ${n}.`;
      case "destroy":
        return `Destroy ${t2}${pw}.`;
      case "buff": {
        if (e.on === "static") {
          const who = `Your ${f.color ? f.color + " " : ""}Units${f.keyword ? " with " + f.keyword : ""}`;
          return `${who} have ${n >= 0 ? "+" : ""}${n} [M].`;
        }
        return n >= 0 ? `Give ${t2} +${n} [M]${dur}.` : `Reduce ${t2}'s [M]Might by [${-n}]${dur === " this turn" ? " until the end of this turn" : ""}.`;
      }
      case "tap":
        return `Tap [T] ${t2}${pw}.`;
      case "untap":
        return `Ready ${t2}.`;
      case "bounce":
        return `Return ${t2}${pw} to its owner's hand.`;
      case "breakShield":
        return `Break ${n} of your opponent's shields.`;
      case "addShield":
        return `Put the top ${n} card${n > 1 ? "s" : ""} of your deck into your Shield Zone.`;
      case "shieldify":
        return keywordMarkup("Shieldify", n);
      case "channel":
        return `Channel ${n} extra rune${n > 1 ? "s" : ""}${e.tapped ? " tapped" : ""}.`;
      case "discard":
        return `Your opponent discards ${n} random card${n > 1 ? "s" : ""}.`;
      case "recover":
        return `Return a Unit from your Graveyard to your hand.`;
      case "seizure":
        return "Banish all Units on the Field, and enter Seizure.";
      case "contract":
        return "Your opponent draws 1 card. At the start of your next turn, if they have more cards in hand than you, destroy their strongest Unit.";
      case "cantLose":
        return "You can't lose the game this turn.";
      case "grantKeyword":
        return `Give ${t2} ${e.keyword}${dur}.`;
      case "copyUnit":
        return `Copy ${t2}${pw}; the copy has Haste and dies at the end of this turn.`;
      case "artDiscount":
        return "Your other Art cards cost [1] this turn; any played this way are banished at the end of your turn.";
      case "nextDiscount":
        return `The next ${e.tribes ? e.tribes.join(" or ") : e.color} card${e.thisTurn ? " this turn" : ""} costs [${n}] less.`;
      case "drawKeepTribe":
        return `Draw [${n}] cards. Keep the ${e.tribe} cards, shuffle the rest back into your deck.`;
      case "recoverTribe":
        return `Return a ${(e.tribes || []).join(" or ")} card from your Graveyard to your hand.`;
      case "lastPlayBuff":
        return `If this is the last card you play this turn, give ${t2} +${n} [M] and ${e.keyword}.`;
      case "tutor":
        return `Search your deck for a ${e.kind === "spell" ? "Spell" : "Unit"}${e.name ? ` named ${e.name}` : ""}, put it into your hand, then shuffle.`;
      case "mightPerRune":
        return `Has [+${n}M] for each ${e.color} rune in your Mana Zone.`;
      case "token":
        return `Create ${n > 1 ? n + " " : "a "}${e.tokenName || "token"}${n > 1 ? "s" : ""}.`;
      default:
        return e.text || "";
    }
  }
  function describe(def) {
    const lines = [];
    for (const kw2 of def.keywords || []) {
      if (kw2 === "Shieldify") continue;
      lines.push(keywordMarkup(kw2));
    }
    if (def.uses) lines.push(`{Saga ${def.uses}#8A6D3B}__(Expires after ${def.uses} uses.)__`);
    const groups = /* @__PURE__ */ new Map();
    for (const e of def.effects || []) {
      if (e.do === "shieldify") {
        lines.push(describeEffect(e, def));
        continue;
      }
      const on = e.on || "play";
      if (!groups.has(on)) groups.set(on, []);
      groups.get(on).push(describeEffect(e, def));
    }
    for (const [on, parts] of groups) lines.push((TRIGGER_TEXT[on] || (() => ""))(def) + parts.join(" "));
    if (def.afterCast === "deckTop") lines.push("Then put this card on top of your deck.");
    return lines.join("\n");
  }

  // js/engine/deck.js
  function deckStats(deck) {
    const ids = Object.entries(deck.cards || {}).flatMap(([id, n]) => Array(n).fill(id)).filter(hasDef);
    const defs2 = ids.map(getDef);
    const count = (f) => defs2.filter(f).length;
    const curve = {};
    for (const d of defs2) curve[Math.min(d.cost, 10)] = (curve[Math.min(d.cost, 10)] || 0) + 1;
    const totalCost = defs2.reduce((a, d) => a + (d.cost || 0), 0);
    return {
      total: ids.length,
      units: count((d) => d.type === "unit"),
      champions: count((d) => d.type === "champion"),
      spells: count((d) => d.type === "spell"),
      gears: count((d) => d.type === "gear"),
      signatures: count((d) => d.type === "signature"),
      curve,
      totalCost,
      avgCost: ids.length ? totalCost / ids.length : 0,
      runes: Object.values(deck.runes || {}).reduce((a, b) => a + b, 0)
    };
  }
  function validateDeck(deck) {
    const errors = [], warnings = [];
    if (!deck.legend || !hasDef(deck.legend)) {
      errors.push("Choose a Legend.");
      return { errors, warnings, stats: deckStats(deck) };
    }
    const legend = getDef(deck.legend);
    const st2 = deckStats(deck);
    for (const id of Object.keys(deck.cards || {})) if (!hasDef(id)) errors.push(`Unknown card ${id}.`);
    if (st2.total !== RULES.DECK_SIZE) errors.push(`Deck must have exactly ${RULES.DECK_SIZE} cards (has ${st2.total}).`);
    for (const [id, n] of Object.entries(deck.cards || {})) if (n > RULES.MAX_COPIES && hasDef(id)) errors.push(`Only ${RULES.MAX_COPIES} copy allowed: ${getDef(id).name}.`);
    const ids = Object.keys(deck.cards || {}).filter(hasDef);
    const defs2 = ids.map(getDef);
    for (const d of defs2) {
      if (d.type === "legend" || d.type === "token" || d.type === "rune") errors.push(`${d.name} can't be in the main deck.`);
      if (d.type === "signature" && !signatureMatchesLegend(d, legend)) {
        errors.push(`${d.name} is a Signature card of another Legend.`);
      } else if (d.colors.some((c) => !legend.colors.includes(c))) {
        errors.push(`${d.name} is outside your Legend's colors (${legend.colors.join("/")}).`);
      }
    }
    if (st2.champions < RULES.MIN_CHAMPIONS || st2.champions > RULES.MAX_CHAMPIONS)
      errors.push(`Deck needs ${RULES.MIN_CHAMPIONS}-${RULES.MAX_CHAMPIONS} Champion Units (has ${st2.champions}).`);
    if (!defs2.some((d) => d.type === "champion" && championMatchesLegend(d, legend)))
      errors.push(`At least one Champion must share the Legend's name (${legend.name.split(",")[0]}).`);
    if (st2.signatures > RULES.MAX_SIGNATURES) errors.push(`Max ${RULES.MAX_SIGNATURES} Signature cards.`);
    if (!deck.champion || !ids.includes(deck.champion)) errors.push("Choose the Champion that starts in the Champion Slot.");
    else if (!championMatchesLegend(getDef(deck.champion), legend)) errors.push("The Champion Slot card must share the Legend's name.");
    if (st2.signatures > 0 && (!deck.signature || !ids.includes(deck.signature))) errors.push("Choose the Signature card that starts in the Signature Slot.");
    if (st2.runes !== RULES.RUNE_DECK_SIZE) errors.push(`Mana Deck must have ${RULES.RUNE_DECK_SIZE} runes (has ${st2.runes}).`);
    for (const c of Object.keys(deck.runes || {})) if (deck.runes[c] > 0 && !legend.colors.includes(c)) errors.push(`${c} runes don't match your Legend.`);
    const range = (k, label) => {
      const [lo, hi] = GUIDE[k];
      if (st2[k] < lo || st2[k] > hi) warnings.push(`Guide: ${lo}-${hi} ${label} (has ${st2[k]}).`);
    };
    range("units", "Units");
    range("spells", "Spells");
    range("gears", "Gears");
    if (Math.abs(st2.avgCost - GUIDE.avgCost) > 0.6) warnings.push(`Guide: average cost ~${GUIDE.avgCost} (is ${st2.avgCost.toFixed(1)}).`);
    return { errors, warnings, stats: st2 };
  }

  // js/cardstore.js
  var DB_NAME = "rajongoi-cards";
  var STORE = "cards";
  var LS = "rajongoi.customCards.v1";
  function open() {
    return new Promise((res, rej) => {
      if (typeof indexedDB === "undefined") return rej(new Error("no indexedDB"));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t2 = db.transaction(STORE, mode);
      const out = fn(t2.objectStore(STORE));
      t2.oncomplete = () => {
        db.close();
        res(out?.result ?? out);
      };
      t2.onerror = () => {
        db.close();
        rej(t2.error);
      };
    });
  }
  var lsGet = () => {
    try {
      return JSON.parse(localStorage.getItem(LS)) || [];
    } catch {
      return [];
    }
  };
  var lsSet = (l) => localStorage.setItem(LS, JSON.stringify(l));
  async function loadCustomCards() {
    try {
      return await tx("readonly", (s) => s.getAll());
    } catch {
      return lsGet();
    }
  }
  async function putCustomCard(card) {
    try {
      await tx("readwrite", (s) => s.put(card));
    } catch {
      lsSet([...lsGet().filter((c) => c.id !== card.id), card]);
    }
  }
  async function removeCustomCard(id) {
    try {
      await tx("readwrite", (s) => s.delete(id));
    } catch {
      lsSet(lsGet().filter((c) => c.id !== id));
    }
  }

  // js/data.js
  var LS_KEY = "riftmasters.decks.v1";
  var premade = [];
  var guides = {};
  var sources = null;
  var custom = [];
  async function getJson(url, fallback) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) return fallback;
      return await r.json();
    } catch {
      return fallback;
    }
  }
  async function loadData() {
    const pre = typeof window !== "undefined" && window.RM_DATA;
    const [placeholders, imported, overrides, decks, deckGuides] = pre ? [[...pre.cards, ...pre.tokens || []], pre.imported, pre.effects, pre.decks, pre.guides || {}] : await Promise.all([
      Promise.all([getJson("data/cards.json", []), getJson("data/tokens.json", [])]).then(([a, b]) => [...a, ...b]),
      getJson("data/imported.json", []),
      getJson("data/effects.json", {}),
      getJson("data/decks.json", []),
      getJson("data/deck-guides.json", {})
    ]);
    custom = await loadCustomCards().catch(() => []);
    sources = { placeholders, imported, overrides };
    rebuild();
    premade = decks;
    guides = deckGuides || {};
    return allCards();
  }
  function rebuild() {
    const { placeholders, imported, overrides } = sources;
    const over = { ...overrides };
    for (const c of custom) delete over[c.id];
    setCardDb([...mergeSources(placeholders, imported).filter((c) => !custom.some((x) => x.id === c.id)), ...custom], over);
  }
  function customCards() {
    return custom;
  }
  var isCustomCard = (id) => custom.some((c) => c.id === id);
  async function saveCustomCard(card) {
    await putCustomCard(card);
    custom = [...custom.filter((c) => c.id !== card.id), card];
    rebuild();
  }
  async function deleteCustomCard(id) {
    await removeCustomCard(id);
    custom = custom.filter((c) => c.id !== id);
    rebuild();
  }
  function customDecks() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveCustomDecks(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch {
    }
  }
  function allDecks() {
    return [...premade, ...customDecks()];
  }
  function playableDecks() {
    return allDecks().filter((d) => !d.comingSoon && !validateDeck(d).errors.length);
  }
  function comingSoonDecks() {
    return allDecks().filter((d) => d.comingSoon);
  }
  function deckGuide(id, lang = "hu") {
    const g = guides[id];
    return g ? g[lang] || g.en || g.hu || g : null;
  }
  function deckName(d) {
    if (!d) return "";
    if (!d.premade || !d.owner || !hasDef(d.legend)) return d.name;
    const L2 = getDef(d.legend);
    if (L2.placeholder) return d.name;
    return L2.name.split("|")[0].trim().toLowerCase() === d.owner.toLowerCase() ? L2.name : `${d.owner} | ${L2.name}`;
  }
  var RUNE_LS = "rajongoi.runeArt.v1";
  var PULLS_LS = "rajongoi.pulls.v1";
  var readLS = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k)) || {};
    } catch {
      return {};
    }
  };
  function setRuneChoice(deckId, color, value) {
    const all = readLS(RUNE_LS);
    all[deckId] = { ...all[deckId] || {}, [color]: value };
    try {
      localStorage.setItem(RUNE_LS, JSON.stringify(all));
    } catch {
    }
  }
  function deckRuneArt(d) {
    const art = { ...d?.runeArt || {} };
    const own = readLS(RUNE_LS)[d?.id] || {};
    for (const [c, v] of Object.entries(own)) {
      if (v === "standard") delete art[c];
      else if (hasDef(v)) art[c] = v;
    }
    return art;
  }
  function runeOptions(d, color) {
    const pulled = readLS(PULLS_LS);
    return allCards().filter((c) => c.type === "rune" && c.colors[0] === color && !c.templateRune && (!c.fullArtRune || pulled[c.id]) && (!d.premade || (c.owners || []).some((o) => o.toLowerCase() === String(d.owner || "").toLowerCase())));
  }
  function findDeck(id) {
    return allDecks().find((d) => d.id === id);
  }

  // js/ui/card.js
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var ICONS = {
    T: '<span class="ico ico-tap" title="Tap">\u21B7</span>',
    M: '<span class="ico ico-might" title="Might"><i class="mi"></i></span>',
    R: `<span class="ico ico-rune" title="Rune of this card's color">\u25C6</span>`
  };
  function markup(text) {
    let h = esc(text);
    h = h.replace(
      /\{([^#}]+)#([0-9a-fA-F]{6})(?:#([0-9a-fA-F]{6}))?\}/g,
      (_, label, bg, fg) => `<span class="kw" style="background:#${bg};color:#${fg || "fff"}">${label.trim()}</span>`
    );
    h = h.replace(/__(.+?)__/gs, "<i>$1</i>");
    h = h.replace(/__/g, "");
    h = h.replace(/\[([A-Za-z])#([0-9a-fA-F]{6})\]/g, (_, k, c) => `<span class="ico" style="background:#${c}">${k.toUpperCase()}</span>`);
    h = h.replace(/\[([TMR])\]/g, (_, k) => ICONS[k]);
    h = h.replace(/\[U\]/g, '<span class="ico" title="Unit">\u2694</span>');
    h = h.replace(/\[H\]/g, '<span class="ico" title="Champion">\u2605</span>');
    h = h.replace(/\[P\]/g, '<span class="ico" title="Power rune">P</span>');
    h = h.replace(/\[\+(\d+)M\]/g, "+$1 " + ICONS.M);
    h = h.replace(/\[(\d+)M\]/g, "$1" + ICONS.M);
    h = h.replace(/\[(\d+)P\]/g, '$1<span class="ico" title="Power rune">P</span>');
    h = h.replace(/\[(\d+\+?)\]/g, '<span class="ico ico-num">$1</span>');
    return h.split("\n").map((l) => l.trim() ? `<p>${l}</p>` : "").join("");
  }
  var DOMAIN_PATH = {
    Fury: "M16 3c1.5 5.5 8 8.5 8 15.5A8 8 0 0 1 8 18.5c0-4 2.2-6 3.6-8.4.6 2.4 1.8 3.8 3.2 4.4C15.6 11 14.8 7 16 3z",
    Calm: "M26 6C14 6 6 12 6 22c0 1.6.3 3 .8 4.2C9 18 14 13 21 10c-6 4.2-10.4 9.8-12.6 16.6C9.6 27.5 11 28 13 28c9 0 13-9 13-22z",
    Mind: "M2 16c3.8-6 8.6-9 14-9s10.2 3 14 9c-3.8 6-8.6 9-14 9S5.8 22 2 16zM16 10a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM16 13a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
    Body: "M2 27L12 9l5 8 3-5 10 15z",
    Chaos: "M16 2l3 9 9-3-6 8 6 8-9-3-3 9-3-9-9 3 6-8-6-8 9 3z",
    Order: "M4 23l2-14 6 6 4-10 4 10 6-6 2 14zM4 25h24v3H4z"
  };
  var domainSvg = (color) => DOMAIN_PATH[color] ? `<svg class="dom-svg" viewBox="0 0 32 32" aria-hidden="true"><path fill-rule="evenodd" d="${DOMAIN_PATH[color]}"/></svg>` : "";
  var domainIcon = (color, cls = "") => `<span class="dom ${cls}" style="--dc:${COLORS[color]?.hex || "#777"}" title="${esc(color)}">${domainSvg(color)}</span>`;
  var GLYPH = { unit: "\u2694", champion: "\u2605", spell: "\u2726", gear: "\u2699", legend: "\u265B", signature: "\u272A", token: "\u265F", rune: "\u25C6" };
  function colorHex(def) {
    return def.colors.length ? COLORS[def.colors[0]]?.hex || "#777" : "#6d6e6b";
  }
  var color2 = (def) => def.colors[1] ? COLORS[def.colors[1]].hex : colorHex(def);
  function isFullArt(def) {
    return def.type === "legend" || !!def.image && def.type !== "rune" && (!!def.fullArt || def.type === "signature");
  }
  var isFoil = (def) => ["champion", "legend"].includes(def.type) || rarityOf(def) === "epic" || !!def.fullArtRune;
  var isRareArt = (def) => !!def.image && rarityOf(def) === "rare";
  var thumbOf = (src) => String(src).replace(/^data\/img\/([^/]+)\.jpe?g$/i, "data/img/thumb/$1.webp");
  function cardImg(def, size) {
    const src = size === "lg" ? def.image : thumbOf(def.image);
    const c = def.imageCrop;
    if (!c || !c.width || !c.height) return `<img class="card-img" src="${esc(src)}" alt="" decoding="async" style="width:100%;height:100%;object-fit:cover">`;
    const w = 1e4 / c.width, h = 1e4 / c.height;
    const l = -c.x / c.width * 100, t2 = -c.y / c.height * 100;
    return `<img class="card-img" src="${esc(src)}" alt="" decoding="async" style="width:${w.toFixed(2)}%;height:${h.toFixed(2)}%;left:${l.toFixed(2)}%;top:${t2.toFixed(2)}%">`;
  }
  function placeholderArt(def) {
    const initials = def.name.replace(/[^A-Za-zÀ-ž ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return `<div class="art-ph" style="--c1:${colorHex(def)};--c2:${def.colors[1] ? COLORS[def.colors[1]].hex : "#1d1a16"}">
    <span class="ph-glyph">${GLYPH[def.type] || "\u2726"}</span>
    <span class="ph-initials">${esc(initials)}</span>
    <span class="ph-label">artwork coming soon</span>
  </div>`;
  }
  function typeLabel(def) {
    if (def.type === "signature") return `Signature ${def.sigType === "unit" ? "Unit" : def.sigType === "gear" ? "Gear" : "Spell"}`;
    if (def.type === "token") return "Token Unit";
    if (def.type === "champion") return "Champion Unit";
    return TYPE_INFO[def.type]?.label || def.type;
  }
  var recyclePill = (def) => def.recycle ? `<div class="rpill" title="Recycle ${def.recycle} rune(s) of this color">${Array.from({ length: def.recycle }, () => `<span>${domainSvg(def.colors[0])}</span>`).join("")}</div>` : "";
  var footerDomains = (def) => def.colors.length ? `<span class="ft-doms">${def.colors.map((c) => domainIcon(c)).join("")}</span>` : "";
  function rulesHtml(def) {
    const rules = def.text ? markup(def.text) : def.image && !def.wip ? "" : `<p class="wip-text">Design in progress${def.purpose ? ` \u2014 ${esc(def.purpose)}` : ""}.</p>`;
    return `<div class="textbox"><div class="rules">${rules}</div>${def.flavor ? `<div class="flavor">${esc(def.flavor)}</div>` : ""}</div>`;
  }
  function runeHtml(def, opts) {
    const cls = [
      "card",
      "rune-card",
      def.name && !/^\s*$/.test(def.name) && !def.fullArtRune ? "" : "rune-bare",
      isFoil(def) ? "foil" : "",
      `size-${opts.size || "md"}`,
      opts.mini ? "mini" : "",
      opts.classes || ""
    ].join(" ");
    return `<div class="${cls}" data-cid="${esc(def.id)}" style="--c1:${colorHex(def)};--c2:${colorHex(def)}">
    <div class="art art-full">${def.image ? cardImg(def, opts.size) : `<div class="rune-tpl">${domainSvg(def.colors[0])}</div>`}</div>
    <div class="frame"></div>
    <div class="typeline"><span class="domains"><span class="domain" style="background:${colorHex(def)}">${domainSvg(def.colors[0])}</span></span><span class="type-badge">Rune</span></div>
    <div class="rune-name">${esc(def.name)}</div>
    <div class="footer"><span>${esc(def.setInfo || def.id)}</span><span>${esc(def.illustrator || "")}</span></div>
    ${isFoil(def) ? '<div class="foil-layer"></div>' : ""}
  </div>`;
  }
  function cardHtml(def, opts = {}) {
    if (def.type === "rune") return runeHtml(def, opts);
    const k = kindOf(def);
    const rarity = rarityOf(def);
    const full = isFullArt(def), rare = isRareArt(def);
    const legend = def.type === "legend";
    const showMight = k === "unit";
    const might = opts.power ?? def.power;
    const mightCls = opts.power != null && opts.power !== def.power ? opts.power > def.power ? "up" : "down" : "";
    const prov = def.provisional || [];
    const cls = [
      "card",
      `r-${rarity}`,
      full ? "fullart" : rare ? "rareart" : "standard",
      legend ? "is-legend" : "",
      k === "gear" ? "is-gear" : "",
      isFoil(def) ? "foil" : "",
      `size-${opts.size || "md"}`,
      opts.mini ? "mini" : "",
      opts.tapped ? "tapped" : "",
      opts.classes || ""
    ].join(" ");
    const data = `data-cid="${esc(def.id)}"${opts.uid ? ` data-uid="${esc(opts.uid)}"` : ""}`;
    const style = `--domain:${colorHex(def)};--c1:${colorHex(def)};--c2:${color2(def)};--type:${TYPE_INFO[def.type]?.hex || "#555"}`;
    const tribes = (def.tribes || []).slice(0, 2);
    const art = def.image ? `<div class="art ${full || rare ? "art-full" : "art-window"}">${cardImg(def, opts.size)}</div>` : `<div class="art ${full ? "art-full" : "art-window"}">${placeholderArt(def)}</div>`;
    const costCls = opts.cost != null && opts.cost !== def.cost ? opts.cost < def.cost ? "cheaper" : "pricier" : "";
    const cost = legend || def.type === "rune" || def.type === "token" ? "" : `<div class="cost ${prov.includes("cost") ? "prov" : ""} ${costCls}" title="${prov.includes("cost") ? "Provisional cost" : costCls ? `Cost ${opts.cost} (printed ${def.cost})` : "Cost"}"><span>${opts.cost ?? def.cost}</span></div>`;
    const domainsTopLeft = full && legend ? `<div class="fa-domains">${def.colors.map((c) => domainIcon(c, "big")).join("")}</div>` : "";
    const mightHtml = showMight ? `<div class="might ${mightCls} ${prov.includes("might") ? "prov" : ""}"><span class="might-ico"><i></i></span><span class="might-val">${might}</span></div>` : "";
    const typeline = full ? `<div class="typeline gold"><span>${[typeLabel(def), ...tribes].map(esc).join(" <i>\u25C6</i> ")}</span></div>` : `<div class="typeline"><span class="domains">${def.colors.map((c) => `<span class="domain" style="background:${COLORS[c]?.hex}" title="${c}">${domainSvg(c)}</span>`).join("")}</span><span class="type-badge">${esc(typeLabel(def))}</span>${tribes.map((t2) => `<span class="tribe">${esc(t2)}</span>`).join("")}</div>`;
    return `<div class="${cls}" ${data} style="${style};${opts.style || ""}">
    ${art}
    ${full || rare ? '<div class="art-shade"></div>' : ""}
    <div class="frame"></div>
    ${cost}${domainsTopLeft}${recyclePill(def)}${mightHtml}
    ${def.wip || def.placeholder ? `<div class="wip-tag">${def.filler ? "FILLER" : def.placeholder ? "PLACEHOLDER" : "WIP"}</div>` : ""}
    ${typeline}
    <div class="namebar"><span class="name">${esc(def.name)}</span>${def.subname && !opts.mini ? `<small>${esc(def.subname)}</small>` : ""}</div>
    ${rulesHtml(def)}
    <div class="footer"><span>${esc(def.setInfo || def.id)}</span><span class="ft-right"><span>${esc(def.illustrator || (def.owners || []).join(" / "))}</span>${footerDomains(def)}</span></div>
    ${isFoil(def) ? '<div class="foil-layer"></div>' : ""}
    ${opts.badges || ""}
  </div>`;
  }
  function cardDetailsHtml(def, opts = {}) {
    const k = kindOf(def);
    const stats = [];
    if (def.type !== "legend" && def.type !== "rune") stats.push(`Cost <b>${opts.cost ?? def.cost}</b>`);
    if (def.recycle) stats.push(`Recycle <b>${def.recycle}</b>`);
    if (k === "unit") stats.push(`Might <b>${opts.power ?? def.power}</b>${opts.power != null && opts.power !== def.power ? ` <span class="muted">(printed ${def.power})</span>` : ""}`);
    const kwHelp = (def.keywords || []).filter((kw2) => KEYWORDS[kw2] && !(def.text || "").includes(kw2)).map((kw2) => `<p><span class="kw" style="background:${KEYWORDS[kw2].hex}">${esc(kw2)}</span> <i>${esc(KEYWORDS[kw2].reminder.replace("[N]", ""))}</i></p>`).join("");
    return `<div class="card-details" style="--domain:${colorHex(def)}">
    <div class="cd-name">${esc(def.name)}${def.subname ? ` <span class="muted">\u2014 ${esc(def.subname)}</span>` : ""}</div>
    <div class="cd-type">${esc(typeLabel(def))}${(def.tribes || []).length ? " \xB7 " + def.tribes.map(esc).join(", ") : ""} \xB7 ${def.colors.join(" / ") || "Neutral"}</div>
    ${stats.length ? `<div class="cd-stats">${stats.join(" \xB7 ")}</div>` : ""}
    <div class="cd-text">${def.text ? markup(def.text) : '<p class="muted">No rules text yet.</p>'}${kwHelp}</div>
    ${def.flavor ? `<div class="cd-flavor">${esc(def.flavor)}</div>` : ""}
  </div>`;
  }
  function cardBackHtml(opts = {}) {
    return `<div class="card card-back size-${opts.size || "sm"} ${opts.classes || ""}" ${opts.attrs || ""}><div class="back-inner"><span>RAJONGOI<br>TCG</span></div>${opts.label ? `<div class="back-label">${opts.label}</div>` : ""}</div>`;
  }
  function fitCard(card) {
    if (card.classList.contains("mini") || card.classList.contains("card-back")) return;
    const box = card.querySelector(".textbox");
    const name = card.querySelector(".namebar .name");
    if (!box || box.offsetParent === null || box.clientHeight === 0) return;
    box.style.fontSize = "";
    let size = parseFloat(getComputedStyle(box).fontSize);
    const min = size * 0.45;
    for (let i = 0; i < 30 && box.scrollHeight > box.clientHeight + 1 && size > min; i++) {
      size *= 0.94;
      box.style.fontSize = size + "px";
    }
    if (name) {
      name.style.fontSize = "";
      let ns = parseFloat(getComputedStyle(name).fontSize);
      const nmin = ns * 0.5;
      for (let i = 0; i < 20 && name.scrollWidth > name.clientWidth + 1 && ns > nmin; i++) {
        ns *= 0.94;
        name.style.fontSize = ns + "px";
      }
    }
    card.dataset.fitted = String(card.offsetWidth);
  }
  function fitCards(root = document, force = false) {
    for (const card of root.querySelectorAll(".card")) {
      if (!force && card.dataset.fitted === String(card.offsetWidth)) continue;
      if (io && !visible.has(card)) continue;
      fitCard(card);
    }
  }
  var io = null;
  var visible = /* @__PURE__ */ new WeakSet();
  var scheduled = false;
  function installAutoFit() {
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            visible.add(e.target);
            if (e.target.dataset.fitted !== String(e.target.offsetWidth)) fitCard(e.target);
          } else visible.delete(e.target);
        }
      }, { rootMargin: "300px 0px" });
    }
    const watch = (root) => {
      if (!io) return;
      if (root.classList?.contains("card")) io.observe(root);
      root.querySelectorAll?.(".card").forEach((c) => io.observe(c));
    };
    const run = () => {
      scheduled = false;
      fitCards();
    };
    const schedule = () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(run);
      }
    };
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && watch(n));
      schedule();
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    if (document.fonts?.ready) document.fonts.ready.then(() => fitCards(document, true));
    watch(document.body);
    schedule();
  }

  // js/engine/achievements.js
  var sameTurn = (events, ev, f) => events.filter((e) => e.turn === ev.turn && f(e));
  var defOf = (id) => {
    try {
      return getDef(id);
    } catch {
      return null;
    }
  };
  var makesTokens = (ids) => [...ids].filter((id) => JSON.stringify(defOf(id)?.effects || []).includes('"do":"token"'));
  var withKw = (ids, kw2) => [...ids].filter((id) => (defOf(id)?.keywords || []).includes(kw2));
  var withTribe = (ids, t2) => [...ids].filter((id) => (defOf(id)?.tribes || []).some((x) => x.toLowerCase() === t2.toLowerCase()));
  var names = (ids) => ids.map((id) => defOf(id)?.name || id).join(", ");
  var playedThisTurn = (events, ev, me, id) => events.some((e) => e.type === "play" && e.player === me && e.id === id && e.turn === ev.turn);
  var tiers = ({ name, icon, levels, desc, hint, count }) => levels.map(([id, n, tier2], i) => ({
    id,
    name: name + ["", " II", " III"][i],
    icon,
    tier: tier2,
    desc: desc(n),
    ...hint ? { hint: (ctx2) => hint(ctx2, n) } : {},
    check: (ctx2) => count(ctx2) >= n
  }));
  var ACHIEVEMENTS = [
    {
      id: "funniest",
      name: "Funniest shit I have ever seen",
      icon: "\u{1F923}",
      desc: "Destroy your opponent with a copy of a token creature they created, using the Parody Alchemist.",
      hint: ({ mine, theirs }) => {
        if (!mine.has("OGN-180")) return null;
        if (!theirs) return {
          hu: "Akkor siker\xFClhet, ha az AI paklija tokeneket csin\xE1l: m\xE1sold le az egyiket a Parody Alchemisttel, \xE9s azzal m\xE9rd a d\xF6nt\u0151 csap\xE1st.",
          en: "Possible if the AI's deck makes tokens: copy one with Parody Alchemist and land the final blow with it."
        };
        const t2 = makesTokens(theirs);
        return t2.length ? {
          hu: `Az ellenf\xE9l tokeneket csin\xE1l (${names(t2)}). M\xE1sold le az egyiket a Parody Alchemisttel, \xE9s a m\xE1solattal vidd be a gy\u0151ztes Direct Attackot.`,
          en: `They make tokens (${names(t2)}) \u2014 copy one with Parody Alchemist and deliver the final direct attack with the copy.`
        } : null;
      },
      check: ({ ev, me }) => ev.type === "finalBlow" && ev.player === me && ev.copy && ev.token
    },
    {
      id: "unexpected-flex",
      name: "Unexpected FLEX",
      icon: "\u{1F4AA}",
      desc: "Play The Ultimate Flex from a triggered shield.",
      hint: ({ mine }) => !mine.has("OGN-186") ? null : mine.has("OGN-182") ? {
        hu: "Tedd a The ULTIMATE FLEX-et Shieldbe a The Solar Boat Team Shieldify-j\xE1val, hogy Shield Triggerk\xE9nt els\xFClhessen.",
        en: "Shieldify The ULTIMATE FLEX with The Solar Boat Team so it can trigger from your shields."
      } : { hu: "Benne van a pakliban a The ULTIMATE FLEX. Rem\xE9ld, hogy Shieldbe ker\xFCl.", en: "You run The ULTIMATE FLEX \u2014 hope it lands in your shields." },
      check: ({ ev, me }) => ev.type === "play" && ev.player === me && ev.id === "OGN-186" && ev.via === "shieldTrigger"
    },
    // Speed Painting I / II / III: Accelerate 1 / 3 / 5 Miniatures with the Painter in one turn
    ...tiers({
      name: "Speed Painting",
      icon: "\u{1F58C}\uFE0F",
      levels: [["painter-1", 1, "bronze"], ["painter", 3, "silver"], ["painter-5", 5, "gold"]],
      desc: (n) => `Accelerate ${n} Miniature${n > 1 ? "s" : ""} with the Miniature Painter in a single turn.`,
      hint: ({ mine }, n) => mine.has("OGN-188") && (mine.has("OGN-179") || mine.has("OGN-189")) ? {
        hu: `Egy k\xF6rben k\xE9sz\xEDts \xE9s gyors\xEDts (Accelerate) ${n} Miniature-t a 3D Printerekkel, mik\xF6zben a Painter lent van.`,
        en: `In one turn make and accelerate ${n} Miniature${n > 1 ? "s" : ""} with your 3D Printers while the Painter is on the field.`
      } : null,
      count: ({ ev, me, events }) => ev.type === "accelerate" && ev.player === me && !ev.via ? sameTurn(events, ev, (e) => e.type === "accelerate" && e.player === me && !e.via).length : 0
    }),
    {
      id: "manyika-rest",
      name: "Manyika can rest finally",
      icon: "\u{1FAA6}",
      desc: "Watch a Manyika Dreadnought die from a Burst-Pouch (either of you may control them).",
      hint: ({ mine, theirs }) => {
        const a = mine.has("OGN-176"), b = theirs?.has("OGN-176");
        if (a && b) return {
          hu: "Mindk\xE9t pakliban van Manyika Dreadnought. T\xE1madd meg az \xF6v\xE9t a Burst-Pouchoddal, vagy hagyd, hogy az \xF6v\xE9 belefusson a ti\xE9dbe.",
          en: "Both decks run Manyika Dreadnought \u2014 attack theirs with your Burst-Pouch, or let theirs run into yours."
        };
        if (a && !theirs) return {
          hu: "Mindk\xE9t oldalon kell egy Manyika. Akkor siker\xFClhet, ha az AI is Manyika Dreadnought-os paklit v\xE1laszt.",
          en: "Needs a Manyika on both sides \u2014 possible if the AI also picks a deck with Manyika Dreadnought."
        };
        if ((a || b) && (mine.has("OGN-180") || theirs?.has("OGN-180"))) return {
          hu: "M\xE1solj le egy Burst-Pouchot a Parody Alchemisttel, \xE9s t\xE1madj vele egy Manyika Dreadnoughtra.",
          en: "Copy a Burst-Pouch with Parody Alchemist and attack into a Manyika Dreadnought."
        };
        return null;
      },
      check: ({ ev }) => ev.type === "kill" && ev.victim === "OGN-176" && ev.killer === "TKN-005"
    },
    // Art of Destruction I / II / III: banish 1 / 3 / 5 cards in a turn with The Chronicler
    ...tiers({
      name: "Art of Destruction",
      icon: "\u{1F3A8}",
      levels: [["art-destruction-1", 1, "bronze"], ["art-destruction-3", 3, "silver"], ["art-destruction", 5, "gold"]],
      desc: (n) => `Banish ${n} card${n > 1 ? "s" : ""} in a turn with The Chronicler.`,
      hint: ({ mine }, n) => {
        if (!mine.has("OGN-178")) return null;
        const k = withTribe(mine, "Art").filter((id) => id !== "OGN-178").length;
        return k >= n ? {
          hu: `Gy\u0171jts ${n} Art lapot a kezedbe, j\xE1tszd ki a The Chroniclert, majd \u0151ket 1-\xE9rt (${k} Art lap van a pakliban).`,
          en: `Hold ${n} Art card${n > 1 ? "s" : ""}, play The Chronicler, then cast ${n > 1 ? "them" : "it"} for 1 (${k} Art cards in your deck).`
        } : null;
      },
      count: ({ ev, me, events }) => ev.type === "banish" && ev.player === me ? sameTurn(events, ev, (e) => e.type === "banish" && e.player === me).length : 0
    }),
    {
      id: "came-prepared",
      name: "Came Prepared",
      icon: "\u{1F6E1}\uFE0F",
      desc: "Shieldify a Shield Trigger card.",
      hint: ({ mine }) => {
        const sh = withKw(mine, "Shieldify"), st2 = withKw(mine, "Shield Trigger");
        return sh.length && st2.length ? {
          hu: `J\xE1tszd ki ezt: ${names(sh)}, mik\xF6zben egy Shield Trigger lap van a kezedben (${names(st2)}), \xE9s azt tedd a Shieldek k\xF6z\xE9.`,
          en: `Play ${names(sh)} with a Shield Trigger card in hand (${names(st2)}).`
        } : null;
      },
      check: ({ ev, me }) => ev.type === "shieldify" && ev.player === me && (getDef(ev.id).keywords || []).includes("Shield Trigger")
    },
    {
      id: "art-of-deal",
      name: "Art of the Deal",
      icon: "\u{1F91D}",
      tier: "bronze",
      desc: "Make a deal with your opponent using The Dealmaker \u2014 and collect when the bill comes due.",
      hint: ({ mine }) => mine.has("OGN-183") ? {
        hu: "Tapeld a The Dealmakert, amikor az ellenf\xE9l keze m\xE1r k\xF6zel van a ti\xE9dhez: a k\xF6vetkez\u0151 k\xF6r\xF6dben, ha t\xF6bb lapja van, elviszed a leger\u0151sebb Unitj\xE1t.",
        en: "Tap The Dealmaker when your opponent's hand is close to yours: next turn, if they hold more cards, you collect their strongest Unit."
      } : null,
      check: ({ ev, me }) => ev.type === "contractCollected" && ev.player === me
    },
    {
      id: "art-of-deal-2",
      name: "Art of the Deal II",
      icon: "\u{1F91D}",
      tier: "silver",
      desc: "Win the game with The Dealmaker's gift: make your opponent draw when they can't.",
      hint: ({ mine }) => mine.has("OGN-183") ? {
        hu: "Ha az ellenf\xE9lnek m\xE1r se paklija, se Shieldje nincs, tapeld a The Dealmakert: a \u201Eaj\xE1nd\xE9k\u201D lap h\xFAz\xE1s\xE1ba belebukik.",
        en: "When your opponent has no deck and no Shields left, tap The Dealmaker: they lose drawing your 'gift'."
      } : null,
      check: ({ ev, me }) => ev.type === "dealWin" && ev.player === me
    },
    {
      id: "art-of-deal-3",
      name: "Art of the Deal III",
      icon: "\u{1F91D}",
      tier: "gold",
      desc: "Collect a Dealmaker contract that destroys your opponent's only Unit.",
      hint: ({ mine }) => mine.has("OGN-183") ? {
        hu: "Akkor tapeld a The Dealmakert, amikor az ellenf\xE9lnek csak egy Unitja van, \xE9s tartsd kevesebb lapon a kezed, mint \u0151.",
        en: "Tap The Dealmaker when your opponent has a single Unit, and keep fewer cards in hand than they do."
      } : null,
      check: ({ ev, me }) => ev.type === "contractCollected" && ev.player === me && ev.only
    },
    {
      id: "strawberry",
      name: "Join the Strawberry Club",
      icon: "\u{1F353}",
      desc: "Have your opponent play Welcome to the Strawberry Club! against you as a Shield Trigger.",
      hint: ({ theirs }) => !theirs ? { hu: "Akkor siker\xFClhet, ha az AI paklij\xE1ban van Welcome to the Strawberry Club!.", en: "Possible if the AI's deck runs Welcome to the Strawberry Club!." } : theirs.has("OGN-012") ? {
        hu: "Az AI-n\xE1l van Welcome to the Strawberry Club!. T\xF6rd a Shieldjeit, \xE9s egyszer els\xFClhet.",
        en: "The AI runs Welcome to the Strawberry Club! \u2014 keep breaking shields and it may trigger."
      } : null,
      check: ({ ev, op }) => ev.type === "play" && ev.player === op && ev.id === "OGN-012" && ev.via === "shieldTrigger"
    },
    {
      id: "movie-night",
      name: "Quality Movie Night",
      icon: "\u{1F3AC}",
      desc: "Play Movie Night at Chris and The Law on the same turn.",
      hint: ({ mine }) => mine.has("OGN-173") && mine.has("OGN-171") ? { hu: "Movie Night at Chris, majd a The Law legyen az utols\xF3 lapod abban a k\xF6rben (4 mana).", en: "Cast Movie Night at Chris, then The Law as your last card that turn (4 mana)." } : null,
      check: ({ ev, me, events }) => ev.type === "play" && ev.player === me && ["OGN-173", "OGN-171"].includes(ev.id) && playedThisTurn(events, ev, me, "OGN-173") && playedThisTurn(events, ev, me, "OGN-171")
    },
    {
      id: "finale",
      name: "Finale",
      icon: "\u{1F404}",
      desc: "Play Cowtrix and GOLDEN on the same turn.",
      hint: ({ mine }) => mine.has("OGN-172") && mine.has("OGN-177") ? { hu: "J\xE1tszd ki a Cowtrixot Rumival (felh\xFAzza a GOLDEN-t), \xE9s m\xE9g ugyanabban a k\xF6rben a GOLDEN-t.", en: "Play Cowtrix choosing Rumi (draws GOLDEN), then cast GOLDEN the same turn." } : null,
      check: ({ ev, me, events }) => ev.type === "play" && ev.player === me && ["OGN-172", "OGN-177"].includes(ev.id) && playedThisTurn(events, ev, me, "OGN-172") && playedThisTurn(events, ev, me, "OGN-177")
    },
    {
      id: "printer-upgrade",
      name: "Printer Upgrade",
      icon: "\u{1F5A8}\uFE0F",
      desc: "Replace 3D Printer - Lui's Forge with 3D Printer - X Forge 2.",
      hint: ({ mine }) => mine.has("OGN-179") && mine.has("OGN-189") ? {
        hu: "Ha mindk\xE9t Gear Slot foglalt (az egyikben a Lui's Forge), j\xE1tszd ki az X Forge 2-t, \xE9s v\xE1laszd a Lui's Forge cser\xE9j\xE9t.",
        en: "With both Gear slots full (one of them Lui's Forge), play X Forge 2 and choose to replace Lui's Forge."
      } : null,
      check: ({ ev, me }) => ev.type === "gearReplace" && ev.player === me && ev.oldId === "OGN-179" && ev.newId === "OGN-189"
    },
    {
      id: "dungeon-survivors",
      name: "Dungeon Survivors",
      icon: "\u{1F3F0}",
      desc: "Win the game with Darkest Dungeoneers tapped on your side of the battlefield.",
      hint: ({ mine }) => mine.has("OGN-045") ? {
        hu: "A gy\u0151ztes k\xF6r\xF6dben a Darkest Dungeoneers legyen leford\xEDtva: v\xE9dekezzen (Defensive) vagy t\xE1madjon.",
        en: "Have Darkest Dungeoneers tapped on your winning turn: use its Defensive or attack with it."
      } : null,
      check: ({ ev, me, s }) => ev.type === "win" && ev.player === me && s.players[me].battle.some((u) => u.id === "OGN-045" && u.tapped)
    },
    // ---- more card stories ---------------------------------------------------------------
    {
      id: "checkmate",
      name: "Checkmate Fantasy",
      icon: "\u265B",
      desc: "Promote a Pawn all the way to a Queen with Aspect of Foundation.",
      hint: ({ mine }) => mine.has("OGN-L-kozi") ? { hu: "H\xE1rom k\xF6r\xF6n \xE1t tapeld a Legendet: Pawn \u2192 Knight/Bishop/Rook \u2192 Queen. V\xE9dd k\xF6zben a b\xE1but!", en: "Tap the Legend three turns in a row: Pawn \u2192 Knight/Bishop/Rook \u2192 Queen. Keep the piece alive!" } : null,
      check: ({ ev, me }) => ev.type === "promote" && ev.player === me && ev.to === "TKN-011"
    },
    {
      id: "memoization",
      name: "Memoization",
      icon: "\u{1F4BE}",
      desc: "Force exactly 3 Thunks at once with Aspect of Excessive Detail.",
      hint: ({ mine }) => mine.has("OGN-L-domi") ? { hu: "Gy\u0171jts 3 thunkot a Legend al\xE1, \xE9s csak ut\xE1na Force-old \u0151ket: plusz lapot is kapsz.", en: "Stack 3 Thunks under the Legend before you Force them \u2014 you draw an extra card too." } : null,
      check: ({ ev, me }) => ev.type === "force" && ev.player === me && ev.count === 3
    },
    {
      id: "zero-day",
      name: "Zero-Day",
      icon: "\u{1F573}\uFE0F",
      desc: "Steal a Shield Trigger with Exploit \u2014 and play it for free.",
      hint: ({ mine }) => mine.has("OGN-L-laci") ? { hu: "Side Channellel ford\xEDts fel egy Shieldet; ha Shield Trigger, a k\xF6vetkez\u0151 k\xF6rben lopd el Exploittal.", en: "Turn a Shield face up with Side Channel; if it is a Shield Trigger, steal it with Exploit next turn." } : null,
      check: ({ ev, me, events }) => ev.type === "play" && ev.player === me && ev.via === "shieldTrigger" && events.some((e) => e.type === "exploit" && e.player === me && e.id === ev.id && e.n < ev.n)
    },
    {
      id: "mad-science",
      name: "Mad Science",
      icon: "\u{1F9EA}",
      desc: "Enter Seizure with Aspect of Science \u2014 and still win the game.",
      hint: ({ mine }) => mine.has("OGN-L-anna") ? { hu: "1 Shieldn\xE9l tiszt\xE1ra s\xF6pr\xF6d a p\xE1ly\xE1t. Ut\xE1na Shieldify-olj \xE9s ford\xEDts!", en: "At 1 Shield the Field is wiped. Then Shieldify back up and turn it around!" } : null,
      check: ({ ev, me, s }) => ev.type === "win" && ev.player === me && !!s.players[me].seizure
    },
    {
      id: "pot-of-greed",
      name: "What Does Pot of Greed Do?!",
      icon: "\u{1F3FA}",
      desc: "Activate Pot of Greed, which allows you to draw 2 cards from your deck.",
      hint: ({ mine }) => mine.has("OGN-187") ? { hu: "Csak j\xE1tszd ki. Mondd is ki hangosan.", en: "Just play it. Say the line out loud." } : null,
      check: ({ ev, me }) => ev.type === "play" && ev.player === me && ev.id === "OGN-187"
    },
    {
      id: "spin-to-win",
      name: "Spin to Win",
      icon: "\u{1F300}",
      desc: "Destroy 4 or more Units with a single Girl with a Spinner.",
      hint: ({ mine }) => mine.has("OGN-013") ? { hu: "V\xE1rj, am\xEDg sok kis (nem Mighty) Unit \xE1ll a p\xE1ly\xE1n, \xE9s akkor p\xF6rgesd meg.", en: "Wait until the Field is crowded with small (non-Mighty) Units, then spin." } : null,
      check: ({ ev, me, events }) => {
        if (ev.type !== "destroy") return false;
        const spin = [...events].reverse().find((e) => e.type === "play" && e.player === me && e.id === "OGN-013" && e.n < ev.n && e.turn === ev.turn);
        if (!spin) return false;
        const next = events.find((e) => e.type === "play" && e.n > spin.n);
        return events.filter((e) => e.type === "destroy" && e.n > spin.n && (!next || e.n < next.n)).length >= 4;
      }
    },
    {
      id: "emperor-protects",
      name: "The Emperor Protects",
      icon: "\u{1F3B2}",
      desc: "Captain Tingus loses a fight \u2014 and survives on the D6.",
      hint: ({ mine }) => mine.has("OGN-120") ? { hu: "Captain Tingus vesztes harc ut\xE1n 4+ dob\xE1ssal t\xFAl\xE9l. Merj vele nagyobbat t\xE1madni!", en: "Captain Tingus survives a lost fight on a 4+. Dare to attack bigger Units with him!" } : null,
      check: ({ ev, me }) => ev.type === "survive" && ev.player === me && ev.id === "OGN-120"
    },
    {
      id: "not-today-satan",
      name: "Not Today, Satan",
      icon: "\u{1F608}",
      desc: "Zselm\xF3 escapes from hell instead of dying.",
      hint: ({ mine }) => mine.has("OGN-009") ? { hu: "Zselm\xF3 els\u0151 hal\xE1la helyett +1 Might-ot kap \u2014 k\xFCldd b\xE1tran harcba.", en: "Zselm\xF3's first death gives him +1 Might instead \u2014 send him into a fight." } : null,
      check: ({ ev, me }) => ev.type === "escape" && ev.player === me && ev.id === "OGN-009"
    },
    {
      id: "floodgates",
      name: "Opened the Floodgates",
      icon: "\u{1F30A}",
      desc: "Land the winning direct attack with The Sluice Machine.",
      hint: ({ mine }) => mine.has("OGN-181") ? { hu: "Tartsd meg a 8 Might-os The Sluice Machine-t a d\xF6nt\u0151 Direct Attackra.", en: "Save the 8-Might Sluice Machine for the final direct attack." } : null,
      check: ({ ev, me }) => ev.type === "finalBlow" && ev.player === me && ev.id === "OGN-181"
    },
    {
      id: "open-bar",
      name: "Open Bar",
      icon: "\u{1F943}",
      desc: "Have 3 Whiskey tokens on your Battlefield at the same time.",
      hint: ({ mine }) => mine.has("OGN-L-balu") ? { hu: "Tapeld minden k\xF6rben a Legendet, \xE9s vigy\xE1zz a Whiskey-kre.", en: "Tap the Legend every turn and keep the Whiskeys alive." } : null,
      check: ({ me, s }) => s.players[me].battle.filter((u) => u.id === "TKN-006").length >= 3
    }
  ];
  function achievementHints(mine, theirs) {
    const out = [];
    for (const a of ACHIEVEMENTS) {
      if (a.unobtainable || !a.hint) continue;
      let tip = null;
      try {
        tip = a.hint({ mine, theirs });
      } catch {
      }
      if (tip) out.push({ ...a, tip });
    }
    return out;
  }
  function checkAchievements(s, me, seen, already = /* @__PURE__ */ new Set()) {
    const events = s.events || [];
    const out = [];
    for (const ev of events) {
      if (ev.n <= seen) continue;
      for (const a of ACHIEVEMENTS) {
        if (already.has(a.id) || out.includes(a.id)) continue;
        try {
          if (a.check({ s, me, op: 1 - me, ev, events })) out.push(a.id);
        } catch {
        }
      }
    }
    return out;
  }

  // js/ui/sfx.js
  var LS2 = "rajongoi.sound.v1";
  var ctx = null;
  var master;
  var verbIn;
  var noiseBuf;
  var muted = false;
  var volume = 0.7;
  try {
    const s = JSON.parse(localStorage.getItem(LS2));
    if (s) {
      muted = !!s.muted;
      volume = s.volume ?? volume;
    }
  } catch {
  }
  function save() {
    try {
      localStorage.setItem(LS2, JSON.stringify({ muted, volume }));
    } catch {
    }
  }
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 3e-3;
      comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(comp);
      comp.connect(ctx.destination);
      const verb = ctx.createConvolver();
      verb.buffer = impulse(2.2, 3);
      verbIn = ctx.createGain();
      verbIn.gain.value = 1;
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      verbIn.connect(verb);
      verb.connect(wet);
      wet.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function impulse(seconds, decay) {
    const len = ctx.sampleRate * seconds;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  function env(t2, { attack = 4e-3, dur = 0.2, gain = 0.3, rev = 0.15, curve = "exp" }) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(1e-4, t2);
    g.gain.linearRampToValueAtTime(gain, t2 + attack);
    if (curve === "exp") g.gain.exponentialRampToValueAtTime(1e-4, t2 + attack + dur);
    else g.gain.linearRampToValueAtTime(1e-4, t2 + attack + dur);
    g.connect(master);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s);
      s.connect(verbIn);
    }
    return g;
  }
  function tone({ freq = 440, to, type = "sine", dur = 0.2, gain = 0.2, attack = 4e-3, rev = 0.15, delay = 0, detune = 0, glide }) {
    const t2 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t2);
    o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t2 + (glide ?? dur));
    o.connect(env(t2, { attack, dur, gain, rev }));
    o.start(t2);
    o.stop(t2 + attack + dur + 0.05);
  }
  function noise({ filter = "bandpass", freq = 1e3, to, q = 1, dur = 0.2, gain = 0.2, attack = 4e-3, rev = 0.15, delay = 0, curve }) {
    const t2 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t2);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t2 + dur);
    src.connect(f);
    f.connect(env(t2, { attack, dur, gain, rev, curve }));
    src.start(t2, Math.random());
    src.stop(t2 + attack + dur + 0.05);
  }
  function bell(freq, { gain = 0.12, dur = 1.2, delay = 0, rev = 0.5 } = {}) {
    [[1, 1], [2.01, 0.45], [3.02, 0.22], [4.17, 0.12]].forEach(([m, g]) => tone({ freq: freq * m, type: "sine", dur: dur / (m * 0.7), gain: gain * g, rev, delay }));
  }
  var play = (fn) => (...a) => {
    if (muted) return;
    if (!ac()) return;
    try {
      fn(...a);
    } catch {
    }
  };
  var lastHover = 0;
  var sfx = {
    // ---------------------------------------------------------------- UI
    click: play(() => {
      tone({ freq: 1500, to: 900, type: "triangle", dur: 0.05, gain: 0.12, rev: 0.05 });
      noise({ filter: "highpass", freq: 3500, dur: 0.025, gain: 0.08, rev: 0 });
    }),
    hover: play(() => {
      const now = performance.now();
      if (now - lastHover < 45) return;
      lastHover = now;
      tone({ freq: 2400, type: "sine", dur: 0.035, gain: 0.025, rev: 0.05 });
    }),
    nav: play(() => {
      noise({ filter: "bandpass", freq: 500, to: 2800, q: 1.4, dur: 0.22, gain: 0.08, attack: 0.05, rev: 0.25 });
      tone({ freq: 660, type: "sine", dur: 0.18, gain: 0.03, delay: 0.08, rev: 0.4 });
    }),
    toggle: play(() => {
      tone({ freq: 880, type: "triangle", dur: 0.08, gain: 0.1 });
      tone({ freq: 1320, type: "triangle", dur: 0.1, gain: 0.08, delay: 0.06 });
    }),
    // ------------------------------------------------------------- cards
    swish: play((vol = 1) => {
      noise({ filter: "bandpass", freq: 3e3, to: 900, q: 0.9, dur: 0.13, gain: 0.12 * vol, attack: 0.02, rev: 0.08 });
    }),
    draw: play(() => {
      noise({ filter: "bandpass", freq: 2600, to: 1200, q: 1, dur: 0.16, gain: 0.14, attack: 0.03, rev: 0.1 });
      tone({ freq: 900, type: "triangle", dur: 0.03, gain: 0.05, delay: 0.12, rev: 0 });
    }),
    play: play(() => {
      noise({ filter: "bandpass", freq: 2200, to: 700, q: 0.8, dur: 0.12, gain: 0.12, attack: 0.02 });
      tone({ freq: 170, to: 60, type: "sine", dur: 0.2, gain: 0.45, delay: 0.1, rev: 0.12 });
      noise({ filter: "lowpass", freq: 900, dur: 0.09, gain: 0.25, delay: 0.1, rev: 0.1 });
    }),
    spell: play(() => {
      noise({ filter: "highpass", freq: 1500, to: 7e3, dur: 0.5, gain: 0.08, attack: 0.15, rev: 0.6 });
      [659, 880, 1175, 1568].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.5, gain: 0.07, delay: i * 0.06, rev: 0.6, detune: 4 }));
    }),
    gear: play(() => {
      noise({ filter: "bandpass", freq: 1800, q: 6, dur: 0.05, gain: 0.25, rev: 0.1 });
      noise({ filter: "bandpass", freq: 1200, q: 6, dur: 0.06, gain: 0.2, delay: 0.09, rev: 0.1 });
      tone({ freq: 220, to: 330, type: "square", dur: 0.12, gain: 0.04, delay: 0.05, rev: 0.2 });
    }),
    rune: play(() => {
      bell(1046, { gain: 0.07, dur: 0.9 });
      bell(1568, { gain: 0.05, dur: 0.8, delay: 0.07 });
    }),
    turn: play((mine) => {
      const base = mine ? 196 : 147;
      [1, 1.5, 2].forEach((m, i) => tone({ freq: base * m, type: "sine", dur: 1.4, gain: 0.08 / (i + 1), attack: 0.02, rev: 0.7 }));
      noise({ filter: "lowpass", freq: 400, dur: 0.3, gain: 0.08, rev: 0.4 });
    }),
    attack: play(() => {
      noise({ filter: "bandpass", freq: 300, to: 3500, q: 1.2, dur: 0.24, gain: 0.22, attack: 0.08, rev: 0.2 });
      tone({ freq: 110, to: 55, type: "sawtooth", dur: 0.25, gain: 0.06, attack: 0.05, rev: 0.2 });
    }),
    block: play(() => {
      noise({ filter: "bandpass", freq: 2500, q: 3, dur: 0.18, gain: 0.25, rev: 0.3 });
      tone({ freq: 523, type: "triangle", dur: 0.4, gain: 0.08, rev: 0.5 });
      tone({ freq: 784, type: "triangle", dur: 0.4, gain: 0.06, rev: 0.5, delay: 0.02 });
    }),
    impact: play(() => {
      tone({ freq: 95, to: 38, type: "sine", dur: 0.35, gain: 0.6, rev: 0.2 });
      noise({ filter: "lowpass", freq: 1400, to: 300, dur: 0.3, gain: 0.35, rev: 0.25 });
    }),
    destroy: play(() => {
      noise({ filter: "lowpass", freq: 3e3, to: 200, dur: 0.6, gain: 0.3, rev: 0.4 });
      tone({ freq: 220, to: 70, type: "sawtooth", dur: 0.4, gain: 0.05, rev: 0.4 });
      for (let i = 0; i < 6; i++) noise({ filter: "bandpass", freq: 800 + Math.random() * 2500, q: 8, dur: 0.04, gain: 0.12, delay: 0.05 + i * 0.05, rev: 0.2 });
    }),
    shield: play(() => {
      noise({ filter: "highpass", freq: 3e3, dur: 0.35, gain: 0.25, rev: 0.4 });
      for (let i = 0; i < 9; i++) tone({ freq: 2200 + Math.random() * 3800, type: "sine", dur: 0.15 + Math.random() * 0.25, gain: 0.05, delay: Math.random() * 0.12, rev: 0.5 });
      tone({ freq: 140, to: 60, type: "sine", dur: 0.25, gain: 0.3, rev: 0.2 });
    }),
    trigger: play(() => {
      noise({ filter: "bandpass", freq: 400, to: 4e3, q: 2, dur: 0.4, gain: 0.12, attack: 0.2, rev: 0.5 });
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: "sawtooth", dur: 0.35, gain: 0.04, delay: 0.25 + i * 0.05, rev: 0.6 }));
      bell(1046, { gain: 0.08, delay: 0.45 });
    }),
    foilLand: play((delay = 0.55) => {
      noise({ filter: "bandpass", freq: 5e3, to: 500, q: 1, dur: delay, gain: 0.14, attack: 0.15, rev: 0.4 });
      tone({ freq: 1200, to: 200, type: "sine", dur: delay, gain: 0.03, attack: 0.1, rev: 0.4 });
      tone({ freq: 75, to: 32, type: "sine", dur: 0.7, gain: 0.8, delay, rev: 0.4 });
      noise({ filter: "lowpass", freq: 700, to: 120, dur: 0.6, gain: 0.45, delay, rev: 0.5 });
      [1568, 2093, 2637, 3136].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.6, gain: 0.035, delay: delay + 0.05 + i * 0.04, rev: 0.7 }));
    }),
    lightning: play(() => {
      noise({ filter: "highpass", freq: 2500, dur: 0.12, gain: 0.5, attack: 1e-3, rev: 0.6 });
      for (let i = 0; i < 10; i++) noise({ filter: "bandpass", freq: 1500 + Math.random() * 5e3, q: 3, dur: 0.02, gain: 0.25, delay: Math.random() * 0.12, rev: 0.4 });
      noise({ filter: "highpass", freq: 1800, dur: 0.1, gain: 0.35, delay: 0.17, rev: 0.6 });
      tone({ freq: 55, to: 28, type: "sine", dur: 1.6, gain: 0.55, delay: 0.05, rev: 0.7 });
      noise({ filter: "lowpass", freq: 380, to: 90, dur: 2.2, gain: 0.45, attack: 0.08, delay: 0.1, rev: 0.8 });
    }),
    crack: play(() => {
      for (let i = 0; i < 12; i++) noise({ filter: "bandpass", freq: 600 + Math.random() * 2200, q: 4, dur: 0.03 + Math.random() * 0.05, gain: 0.25, delay: i * 0.025 + Math.random() * 0.02, rev: 0.2 });
      tone({ freq: 48, to: 30, type: "sine", dur: 1.1, gain: 0.55, rev: 0.4 });
      noise({ filter: "lowpass", freq: 250, dur: 1.1, gain: 0.35, attack: 0.02, rev: 0.4 });
      for (let i = 0; i < 8; i++) noise({ filter: "bandpass", freq: 3e3 + Math.random() * 3e3, q: 6, dur: 0.03, gain: 0.08, delay: 0.3 + Math.random() * 0.6, rev: 0.2 });
    }),
    win: play(() => {
      [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.42]].forEach(([f, d]) => {
        tone({ freq: f, type: "sawtooth", dur: 0.5, gain: 0.05, delay: d, rev: 0.6 });
        tone({ freq: f, type: "triangle", dur: 0.6, gain: 0.08, delay: d, rev: 0.6, detune: 6 });
      });
      [1046, 1318, 1568].forEach((f) => tone({ freq: f, type: "triangle", dur: 1.6, gain: 0.06, delay: 0.6, rev: 0.8 }));
      bell(2093, { gain: 0.08, delay: 0.6, dur: 1.8 });
    }),
    lose: play(() => {
      [[392, 0], [349, 0.25], [311, 0.5], [262, 0.8]].forEach(([f, d]) => tone({ freq: f, type: "triangle", dur: 0.7, gain: 0.09, delay: d, rev: 0.7 }));
      tone({ freq: 65, to: 40, type: "sine", dur: 1.5, gain: 0.3, delay: 0.8, rev: 0.6 });
    }),
    // ------------------------------------------------------------ boosters
    packShake: play(() => {
      for (let i = 0; i < 6; i++) noise({ filter: "bandpass", freq: 1200 + Math.random() * 1500, q: 2, dur: 0.06, gain: 0.1, delay: i * 0.08, rev: 0.05 });
      tone({ freq: 60, type: "sine", dur: 0.5, gain: 0.15, attack: 0.1, rev: 0.1 });
    }),
    packTear: play(() => {
      for (let i = 0; i < 14; i++) noise({ filter: "bandpass", freq: 2500 + Math.random() * 4e3, q: 1.5, dur: 0.03 + Math.random() * 0.03, gain: 0.22, delay: i * 0.022, rev: 0.1 });
      noise({ filter: "highpass", freq: 6e3, to: 1500, dur: 0.35, gain: 0.12, rev: 0.2 });
      tone({ freq: 90, to: 45, type: "sine", dur: 0.4, gain: 0.35, delay: 0.3, rev: 0.4 });
      noise({ filter: "highpass", freq: 2e3, to: 9e3, dur: 0.8, gain: 0.06, attack: 0.3, delay: 0.3, rev: 0.8 });
    }),
    deal: play((i = 0) => {
      noise({ filter: "bandpass", freq: 3200, to: 1100, q: 1, dur: 0.09, gain: 0.08, attack: 0.015, rev: 0.05 });
      tone({ freq: 1500 + i * 20, type: "triangle", dur: 0.02, gain: 0.025, delay: 0.07, rev: 0 });
    }),
    flip: play(() => {
      noise({ filter: "bandpass", freq: 1800, to: 3500, q: 1.2, dur: 0.08, gain: 0.14, rev: 0.05 });
      tone({ freq: 700, type: "triangle", dur: 0.04, gain: 0.06, delay: 0.06 });
    }),
    reveal: play((tier2) => {
      if (tier2 === "uncommon") {
        bell(1318, { gain: 0.05, dur: 0.6 });
        return;
      }
      if (tier2 === "rare" || tier2 === "legend") {
        [1046, 1318, 1568].forEach((f, i) => bell(f, { gain: 0.07, dur: 1.1, delay: i * 0.07 }));
        noise({ filter: "highpass", freq: 4e3, dur: 0.6, gain: 0.05, attack: 0.1, rev: 0.8 });
        return;
      }
      noise({ filter: "bandpass", freq: 300, to: 6e3, q: 1.5, dur: 0.5, gain: 0.15, attack: 0.3, rev: 0.6 });
      tone({ freq: 60, to: 35, type: "sine", dur: 0.9, gain: 0.6, delay: 0.45, rev: 0.5 });
      [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 1.4, gain: 0.05, delay: 0.45 + i * 0.045, rev: 0.8, detune: 5 }));
      bell(2093, { gain: 0.1, delay: 0.5, dur: 2 });
    })
  };
  function isMuted() {
    return muted;
  }
  function setMuted(m) {
    muted = m;
    save();
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  }
  function soundForLog(line, humanName) {
    if (/ wins!/.test(line)) return line.startsWith(humanName) ? sfx.win() : sfx.lose();
    if (/^— Turn/.test(line)) return sfx.turn(line.includes(humanName));
    if (/Shield Trigger!/.test(line)) return sfx.trigger();
    if (/shield breaks/.test(line)) return sfx.shield();
    if (/defends!/.test(line)) return sfx.block();
    if (/ attacks /.test(line)) return sfx.attack();
    if (/^Fight:/.test(line)) return sfx.impact();
    if (/is destroyed|has 0 Might/.test(line)) return sfx.destroy();
    if (/ casts /.test(line)) return sfx.spell();
    if (/ equips | activates /.test(line)) return sfx.gear();
    if (/ plays /.test(line)) return null;
    if (/ channels /.test(line)) return sfx.rune();
    return null;
  }

  // js/ui/achievements.js
  var TIER = { bronze: "Bronze", silver: "Silver", gold: "Gold" };
  var achIcon = (a, cls = "ach-ico") => `<div class="${cls} ${a.tier ? "tier-" + a.tier : ""}">${a.icon}</div>`;
  var tierChip = (a) => a.tier ? ` <span class="ach-tier tier-${a.tier}">${TIER[a.tier]}</span>` : "";
  var LS3 = "rajongoi.achievements.v1";
  function unlockedMap() {
    try {
      return JSON.parse(localStorage.getItem(LS3)) || {};
    } catch {
      return {};
    }
  }
  function save2(m) {
    try {
      localStorage.setItem(LS3, JSON.stringify(m));
    } catch {
    }
  }
  function unlock(ids) {
    const m = unlockedMap();
    const fresh = ids.filter((id) => !m[id]);
    for (const id of fresh) m[id] = Date.now();
    if (!fresh.length) return;
    save2(m);
    fresh.forEach((id, i) => setTimeout(() => toast(ACHIEVEMENTS.find((a) => a.id === id)), i * 1600));
  }
  function toast(a) {
    if (!a) return;
    const el = document.createElement("div");
    el.className = "ach-toast";
    el.innerHTML = `${achIcon(a)}<div><div class="ach-kicker">Achievement unlocked!</div><b>${esc(a.name)}</b>${tierChip(a)}<div class="ach-desc">${esc(a.desc)}</div></div>`;
    document.body.appendChild(el);
    sfx.reveal("rare");
    setTimeout(() => el.classList.add("out"), 4200);
    setTimeout(() => el.remove(), 4800);
  }
  function renderAchievements(app2) {
    const m = unlockedMap();
    const got = ACHIEVEMENTS.filter((a) => m[a.id]).length;
    const obtainable = ACHIEVEMENTS.filter((a) => !a.unobtainable).length;
    app2.innerHTML = `<div class="page ach-page">
    <div class="row" style="margin-bottom:6px"><h2 style="margin:0">Achievements</h2><span class="spacer"></span>
      <span class="ach-count"><b>${got}</b> / ${obtainable} unlocked</span></div>
    <div class="ach-bar"><i style="width:${(100 * got / obtainable).toFixed(0)}%"></i></div>
    <p class="muted">Achievements are unlocked in <b>Play vs AI</b> and are saved in this browser.</p>
    <div class="ach-grid">${ACHIEVEMENTS.map((a) => {
      const when = m[a.id] ? new Date(m[a.id]).toLocaleDateString() : "";
      return `<div class="ach ${m[a.id] ? "got" : "locked"} ${a.unobtainable ? "unob" : ""}">
        ${achIcon(a)}
        <div class="ach-body"><b>${esc(a.name)}</b>${tierChip(a)}<div class="ach-desc">${esc(a.desc)}</div>
          <div class="ach-state">${m[a.id] ? `\u2713 Unlocked ${esc(when)}` : a.unobtainable ? esc(a.unobtainable) : "Locked"}</div></div>
      </div>`;
    }).join("")}</div>
  </div>`;
  }

  // js/ui/lang.js
  var LS4 = "rajongoi.lang";
  function getLang() {
    try {
      return localStorage.getItem(LS4) === "en" ? "en" : "hu";
    } catch {
      return "hu";
    }
  }
  function setLang(l) {
    try {
      localStorage.setItem(LS4, l);
    } catch {
    }
  }
  function langToggleHtml() {
    const l = getLang();
    return `<div class="lang-toggle" role="group" aria-label="Language">
    <button type="button" data-lang="hu" class="${l === "hu" ? "on" : ""}">Magyar</button>
    <button type="button" data-lang="en" class="${l === "en" ? "on" : ""}">English</button></div>`;
  }
  function bindLangToggle(root, rerender) {
    root.querySelectorAll(".lang-toggle [data-lang]").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      if (b.dataset.lang === getLang()) return;
      setLang(b.dataset.lang);
      rerender();
    });
  }

  // js/ui/deckinfo.js
  var T = {
    noGuide: ["Ehhez a paklihoz m\xE9g nincs le\xEDr\xE1s.", "No strategy notes for this deck yet."],
    plan: ["J\xE1t\xE9kterv", "Game plan"],
    combos: ["Komb\xF3k", "Combos"],
    random: ["Az AI v\xE9letlenszer\u0171en v\xE1laszt a j\xE1tszhat\xF3 paklik k\xF6z\xFCl.", "The AI will pick one of the playable decks at random."],
    aiPlan: ["Az AI teljes j\xE1t\xE9kterve", "The AI's full game plan"],
    howTo: ["\xCDgy j\xE1tszd ezt a paklit", "How to play this deck"],
    matchup: ["Tippek az ellenf\xE9l ellen", "Matchup tips"],
    achs: ["Megszerezhet\u0151 achievementek", "Achievements you can go for"],
    achsRandom: [" (v\xE9letlen ellenf\xE9llel)", " (opponent random)"],
    unlocked: ["\u2713 megvan", "\u2713 unlocked"]
  };
  var t = (k) => T[k][getLang() === "hu" ? 0 : 1];
  var L = (hu, en) => getLang() === "hu" ? hu : en;
  var deckIds = (d) => new Set([d.legend, d.champion, ...Object.keys(d.cards || {})].filter((id) => id && hasDef(id)));
  var defs = (ids) => [...ids].map(getDef);
  var kw = (d, k) => (d.keywords || []).includes(k);
  var nameList = (list) => list.map((d) => `<b>${esc(d.name)}</b>`).join(", ");
  function startingCards(d) {
    const sigs = Object.keys(d.cards || {}).filter((id) => hasDef(id) && getDef(id).type === "signature");
    if (d.signature && !sigs.includes(d.signature)) sigs.unshift(d.signature);
    return [
      ...d.legend ? [{ id: d.legend, role: "Legend" }] : [],
      ...d.champion ? [{ id: d.champion, role: "Champion" }] : [],
      ...sigs.map((id) => ({ id, role: "Signature" }))
    ].filter((x) => hasDef(x.id));
  }
  function matchupTips(mine, theirs) {
    const M = defs(mine), T2 = defs(theirs);
    const tips = [];
    const triggers = T2.filter((d) => kw(d, "Shield Trigger"));
    if (triggers.length) {
      tips.push(L(
        `${triggers.length} Shield Trigger van a paklij\xE1ban (${nameList(triggers)}). ` + (mine.has("OGN-177") ? "A nagy t\xE1mad\xE1s el\u0151tt j\xE1tszd ki a <b>GOLDEN</b>-t, hogy egyik se s\xFClj\xF6n el." : "Ne t\xE1madj t\xFAl sok lappal egyszerre a Shieldjeire."),
        `They run ${triggers.length} Shield Trigger${triggers.length > 1 ? "s" : ""} (${nameList(triggers)}). ` + (mine.has("OGN-177") ? "Cast <b>GOLDEN</b> before your big attack so none of them can fire." : "Don't over-commit into their shields.")
      ));
    }
    const walls = T2.filter((d) => kw(d, "Defensive"));
    if (walls.length) {
      const pb = M.filter((d) => kw(d, "Party Breaker"));
      tips.push(L(
        `A Defensive Unitjai (${nameList(walls)}) magukra ir\xE1ny\xEDthatj\xE1k a t\xE1mad\xE1saidat.` + (pb.length ? ` ${nameList(pb)} \xE1ll\xF3 Unitokat is t\xE1madhat, ezzel takar\xEDtsd el \u0151ket el\u0151bb.` : " Ford\xEDtsd le vagy t\xE1vol\xEDtsd el \u0151ket, miel\u0151tt a Shieldekre m\xE9sz."),
        `Their Defensive units (${nameList(walls)}) can redirect your attacks.` + (pb.length ? ` ${nameList(pb)} can attack untapped units \u2014 use it to clear them first.` : " Tap or remove them before going for shields.")
      ));
    }
    const chaos = T2.filter((d) => (d.colors || []).includes("Chaos") && d.type !== "legend" && (d.power ?? 0) < 5);
    if (chaos.length && mine.has("OGN-172")) tips.push(L(`A <b>Cowtrix</b> \xE9rkez\xE9skor elpuszt\xEDtja a nem Mighty Chaos lapjait (${chaos.length} van a paklij\xE1ban).`, `<b>Cowtrix</b> destroys their non-Mighty Chaos cards when it enters (${chaos.length} in their deck).`));
    const big = T2.filter((d) => (d.cost || 0) >= 7 && ["unit", "champion"].includes(d.type));
    if (big.length) tips.push(L(`A leger\u0151sebb lapjai: ${nameList(big)}. Ha m\xE1r van r\xE1juk man\xE1ja, tarts vissza egy Defensive Unitot.`, `Their top end: ${nameList(big)}. Keep a Defensive unit back once they reach that much mana.`));
    const deathtouch = T2.filter((d) => JSON.stringify(d.effects || []).includes("TKN-005") || kw(d, "Deathtouch"));
    if (deathtouch.length) tips.push(L(`Vigy\xE1zz a Deathtouch-ra (${nameList(deathtouch)}): tokennel t\xE1madd, ne a legjobb Unitoddal.`, `Watch out for Deathtouch (${nameList(deathtouch)}): attack it with tokens, not with your best unit.`));
    if (theirs.has("OGN-186")) tips.push(L("N\xE1la is van <b>The ULTIMATE FLEX</b>: ha els\xFCl, abban a k\xF6rben nem vesz\xEDthet, \xFAgyhogy ne pazarold bele a gy\u0151ztes t\xE1mad\xE1st.", "They also run <b>The ULTIMATE FLEX</b>: when it resolves they can't lose that turn, so don't waste a lethal swing into it."));
    return tips;
  }
  function cardRow(d) {
    return `<div class="di-cards">${startingCards(d).map((x) => `<div class="di-card" data-di-cid="${x.id}">
    ${cardHtml(getDef(x.id), { size: "sm" })}<span class="di-role">${x.role}</span></div>`).join("")}</div>`;
  }
  function guideHtml(d, withStyle = true) {
    const g = deckGuide(d.id, getLang());
    if (!g) return `<p class="muted">${t("noGuide")}</p>`;
    const chips = (ids) => ids.filter(hasDef).map((id) => `<span class="di-chip" data-di-cid="${id}">${esc(getDef(id).name)}</span>`).join("");
    return `${withStyle ? styleHtml(g) : ""}
    ${g.plan?.length ? `<h4>${t("plan")}</h4><ol class="di-plan">${g.plan.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${g.mulligan ? `<p class="di-mull"><b>Mulligan:</b> ${esc(g.mulligan)}</p>` : ""}
    ${g.combos?.length ? `<h4>${t("combos")}</h4><div class="di-combos">${g.combos.map((c) => `<div class="di-combo"><div class="di-chips">${chips(c.cards)}</div>${esc(c.text)}</div>`).join("")}</div>` : ""}`;
  }
  var styleHtml = (g) => `<div class="di-style"><span class="di-arch">${esc(g.archetype || "")}</span>${esc(g.style || "")}</div>`;
  function strategyHtml(d) {
    const g = deckGuide(d.id, getLang());
    if (!g) return `<p class="muted">${t("noGuide")}</p>`;
    return `${styleHtml(g)}${g.plan?.length ? `<details class="di-sec"><summary>${t("plan")}</summary><ol class="di-plan">${g.plan.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></details>` : ""}`;
  }
  function deckInfoHtml(deck, other2, side2) {
    if (!deck) {
      return `<div class="deck-info"><p class="muted">${t("random")}</p></div>`;
    }
    const mine = deckIds(deck), theirs = other2 ? deckIds(other2) : null;
    if (side2 === "ai") {
      const g = deckGuide(deck.id, getLang());
      return `<div class="deck-info">${cardRow(deck)}
      ${g ? styleHtml(g) : ""}
      <details class="di-sec"><summary>${t("aiPlan")}</summary>${guideHtml(deck, false)}</details>
    </div>`;
    }
    const tips = theirs ? matchupTips(mine, theirs) : [];
    const got = unlockedMap();
    const hints = achievementHints(mine, theirs).sort((a, b) => !!got[a.id] - !!got[b.id]);
    return `<div class="deck-info">${cardRow(deck)}
    <details class="di-sec" open><summary>${t("howTo")}</summary>${guideHtml(deck)}</details>
    ${tips.length ? `<details class="di-sec" open><summary>${t("matchup")}</summary><ul class="di-tips">${tips.map((t2) => `<li>${t2}</li>`).join("")}</ul></details>` : ""}
    ${hints.length ? `<details class="di-sec" open><summary>${t("achs")}${theirs ? "" : t("achsRandom")}</summary>
      <div class="di-achs">${hints.map((a) => `<div class="di-ach ${got[a.id] ? "got" : ""}">${achIcon(a)}
        <div><b>${esc(a.name)}</b>${tierChip(a)}${got[a.id] ? ` <span class="di-done">${t("unlocked")}</span>` : ""}<div class="muted">${esc(L(a.tip.hu, a.tip.en))}</div></div></div>`).join("")}</div></details>` : ""}
  </div>`;
  }

  // js/ui/collection.js
  var SET_NAMES = { OGN: "OGN 2026-01", DND: "DND \u2014 DLC", TKN: "Tokens", RUN: "Runes" };
  var TYPE_ORDER = ["legend", "champion", "unit", "spell", "gear", "signature", "token", "rune"];
  var sortCards = (a, b) => a.set.localeCompare(b.set) || String(a.number).localeCompare(String(b.number));
  function showCardModal(def) {
    const m = document.createElement("div");
    m.className = "modal";
    const kws = (def.keywords || []).join(", ") || "\u2014";
    m.innerHTML = `<div class="modal-box"><div class="modal-card">
    ${cardHtml(def, { size: "lg" })}
    <dl class="info">
      <dd>${cardDetailsHtml(def)}</dd>
      <dt>Type</dt><dd>${esc(TYPE_INFO[def.type]?.label || def.type)}${def.sigType ? " (" + def.sigType + ")" : ""}</dd>
      <dt>Colors</dt><dd>${def.colors.join(" / ") || "Neutral"}</dd>
      <dt>Cost / Might / Recycle</dt><dd>${def.cost} / ${kindOf(def) === "unit" ? def.power : "\u2014"} / ${def.recycle || 0}${def.provisional ? ` <span class="muted">(provisional: ${def.provisional.join(", ")})</span>` : ""}</dd>
      ${def.owners?.length ? `<dt>Deck of</dt><dd>${esc(def.owners.join(" / "))}</dd>` : ""}
      ${def.purpose ? `<dt>Purpose</dt><dd>${esc(def.purpose)}</dd>` : ""}
      <dt>Status</dt><dd>${def.image ? "Finished (with artwork)" : def.filler ? "Filler card (completes short decks)" : def.placeholder ? "Placeholder" : def.wip ? "Work in progress (FLAG)" : "Designed"}${def.provisionalEffect ? " \xB7 provisional effect" : ""}</dd>
      <dt>Keywords</dt><dd>${esc(kws)}</dd>
      <dt>Card id</dt><dd><code>${esc(def.id)}</code></dd>
      <dt>Game logic</dt><dd><code style="font-size:12px;white-space:pre-wrap">${esc(JSON.stringify(def.effects || []))}</code></dd>
      <dd style="margin-top:14px"><button class="close">Close</button> <a class="btn ghost" href="#/editor/${encodeURIComponent(def.id)}">\u270E Edit in Card Editor</a></dd>
    </dl></div></div>`;
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest(".close")) m.remove();
    });
    document.body.appendChild(m);
  }
  var filt = { types: /* @__PURE__ */ new Set(), colors: /* @__PURE__ */ new Set(), owner: "", status: "", q: "", sort: "auto" };
  var COLOR_ORDER = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"];
  var RARITY_ORDER = ["common", "uncommon", "rare", "epic"];
  var DECK_TYPE_ORDER = { legend: 0, champion: 1, signature: 2 };
  var byNumber = (a, b) => sortCards(a, b);
  var colorKey = (c) => c.colors.length ? COLOR_ORDER.indexOf(c.colors[0]) * 10 + (c.colors[1] ? 1 + COLOR_ORDER.indexOf(c.colors[1]) : 0) : 99;
  var SORTS = {
    number: { label: "Card number", fn: byNumber },
    mana: { label: "Mana", fn: (a, b) => (a.cost || 0) - (b.cost || 0) || byNumber(a, b) },
    color: { label: "Color", fn: (a, b) => colorKey(a) - colorKey(b) || (a.cost || 0) - (b.cost || 0) || byNumber(a, b) },
    rarity: { label: "Rarity", fn: (a, b) => RARITY_ORDER.indexOf(rarityOf(b)) - RARITY_ORDER.indexOf(rarityOf(a)) || (a.cost || 0) - (b.cost || 0) || byNumber(a, b) },
    // a deck reads best as Legend, Champions, Signatures, then everything by mana
    deck: { label: "Deck order", fn: (a, b) => (DECK_TYPE_ORDER[a.type] ?? 3) - (DECK_TYPE_ORDER[b.type] ?? 3) || (a.cost || 0) - (b.cost || 0) || byNumber(a, b) }
  };
  function renderCollection(app2, set) {
    const cards = allCards();
    const ORDER = ["OGN", "DND", "TKN", "RUN"];
    const rank = (x) => ORDER.indexOf(x) + 1 || 50;
    const sets = [...new Set(cards.map((c) => c.set))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    if (!sets.includes(set)) set = sets[0];
    const inSet = cards.filter((c) => c.set === set).sort(sortCards);
    const types = TYPE_ORDER.filter((t2) => inSet.some((c) => c.type === t2));
    const owners = [...new Set(inSet.flatMap((c) => c.owners || []))].sort((a, b) => a.localeCompare(b));
    if (filt.owner && !owners.includes(filt.owner)) filt.owner = "";
    const status = (c) => c.image ? "art" : c.wip || c.placeholder ? "wip" : "designed";
    const draw2 = () => {
      const sortKey = filt.sort === "auto" ? filt.owner ? "deck" : "number" : filt.sort;
      const shown = inSet.filter((c) => (!filt.types.size || filt.types.has(c.type)) && (!filt.colors.size || c.colors.some((x) => filt.colors.has(x))) && (!filt.owner || (c.owners || []).includes(filt.owner)) && (!filt.status || status(c) === filt.status) && (!filt.q || (c.name + " " + c.text).toLowerCase().includes(filt.q.toLowerCase()))).sort(SORTS[sortKey].fn);
      const nArt = inSet.filter((c) => status(c) === "art").length;
      const nWip = inSet.filter((c) => status(c) === "wip").length;
      app2.innerHTML = `<div class="page">
      <div class="tabs">${sets.map((s) => `<button class="${s === set ? "active" : ""}" data-set="${s}">${esc(SET_NAMES[s] || s)} <span class="muted">(${cards.filter((c) => c.set === s).length})</span></button>`).join("")}</div>
      <div class="filters">
        ${types.map((t2) => `<span class="chip ${filt.types.has(t2) ? "on" : ""}" data-type="${t2}"><span class="dot" style="background:${TYPE_INFO[t2]?.hex || "#777"}"></span>${TYPE_INFO[t2]?.label || "Token"}</span>`).join("")}
        <span style="width:10px"></span>
        ${Object.entries(COLORS).map(([k, v]) => `<span class="chip ${filt.colors.has(k) ? "on" : ""}" data-color="${k}"><span class="dot" style="background:${v.hex}"></span>${k}</span>`).join("")}
        ${owners.length ? `<select id="owner"><option value="">Every deck</option>${owners.map((o) => `<option ${o === filt.owner ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : ""}
        <select id="status"><option value="">Any status</option>
          <option value="art" ${filt.status === "art" ? "selected" : ""}>With artwork</option>
          <option value="designed" ${filt.status === "designed" ? "selected" : ""}>Designed (FLAG off)</option>
          <option value="wip" ${filt.status === "wip" ? "selected" : ""}>Work in progress</option></select>
        <label class="sortby">Sort <select id="sort">
          <option value="auto" ${filt.sort === "auto" ? "selected" : ""}>Auto (${filt.owner ? "deck order" : "card number"})</option>
          ${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${filt.sort === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
        <input type="search" placeholder="Search\u2026" value="${esc(filt.q)}" id="q">
        <span class="muted">${shown.length} shown \xB7 ${nArt} with art \xB7 ${nWip} WIP</span>
      </div>
      <div class="grid">${shown.map((c) => cardHtml(c, { size: "md" })).join("") || '<p class="muted">No cards match.</p>'}</div>
    </div>`;
      app2.querySelectorAll("[data-set]").forEach((b) => b.onclick = () => location.hash = "#/collection/" + b.dataset.set);
      app2.querySelectorAll("[data-type]").forEach((b) => b.onclick = () => {
        toggle(filt.types, b.dataset.type);
        draw2();
      });
      app2.querySelectorAll("[data-color]").forEach((b) => b.onclick = () => {
        toggle(filt.colors, b.dataset.color);
        draw2();
      });
      if (app2.querySelector("#owner")) app2.querySelector("#owner").onchange = (e) => {
        filt.owner = e.target.value;
        draw2();
      };
      app2.querySelector("#status").onchange = (e) => {
        filt.status = e.target.value;
        draw2();
      };
      app2.querySelector("#sort").onchange = (e) => {
        filt.sort = e.target.value;
        draw2();
      };
      const q = app2.querySelector("#q");
      q.oninput = () => {
        filt.q = q.value;
        draw2();
        const nq = app2.querySelector("#q");
        nq.focus();
        nq.setSelectionRange(nq.value.length, nq.value.length);
      };
      app2.querySelectorAll(".grid .card").forEach((el) => el.onclick = () => showCardModal(getDef(el.dataset.cid)));
    };
    draw2();
  }
  var toggle = (set, v) => set.has(v) ? set.delete(v) : set.add(v);
  function renderDecks(app2, arg) {
    if (arg && findDeck(arg)) return renderDeckView(app2, findDeck(arg));
    const decks = allDecks();
    const tile = (d) => {
      const v = validateDeck(d);
      const legend = hasDef(d.legend) ? getDef(d.legend) : null;
      return `<div class="deck-tile clickable" data-view="${esc(d.id)}" title="Show the cards in this deck">
      ${legend ? cardHtml(legend, { size: "xs" }) : ""}
      <div style="flex:1;min-width:0">
        <h3>${esc(deckName(d))}</h3>
        <div class="meta">${legend ? esc(legend.colors.join(" / ")) : "No legend"} \xB7 ${v.stats.total} cards \xB7 avg ${v.stats.avgCost.toFixed(1)}</div>
        <div class="meta">${d.comingSoon ? '<span class="soon-tag">COMING SOON</span> ' : ""}${d.premade ? "Premade" : "Custom"} \xB7 ${v.errors.length ? `<span class="msg err">${v.errors.length} problem(s)</span>` : '<span class="msg ok">Legal</span>'}</div>
        <div class="row" style="margin-top:8px">
          ${d.comingSoon ? "" : d.premade ? `<button data-copy="${d.id}">Copy &amp; edit</button>` : `<button data-edit="${d.id}">Edit</button><button class="danger" data-del="${d.id}">Delete</button>`}
          <button class="ghost" data-export="${d.id}" title="Copy deck JSON">Export</button>
        </div>
      </div></div>`;
    };
    app2.innerHTML = `<div class="page">
    <div class="row" style="margin-bottom:14px"><h2 style="margin:0">Decks</h2><span class="spacer"></span>
      <button class="ghost" id="imp">Import JSON</button><button class="primary" id="new">New deck</button></div>
    <p class="muted" style="margin-top:0">${RULES.DECK_SIZE} cards, 1 copy each, ${RULES.MIN_CHAMPIONS}-${RULES.MAX_CHAMPIONS} Champions (one sharing the Legend's name), max ${RULES.MAX_SIGNATURES} Signatures, ${RULES.RUNE_DECK_SIZE}-rune Mana Deck. The Legend isn't counted.</p>
    <div class="decks">${decks.map(tile).join("")}</div></div>`;
    app2.querySelector("#new").onclick = () => location.hash = "#/deck/new";
    app2.querySelectorAll("[data-view]").forEach((t2) => t2.onclick = (e) => {
      if (e.target.closest("button")) return;
      location.hash = "#/decks/" + encodeURIComponent(t2.dataset.view);
    });
    app2.querySelector("#imp").onclick = () => {
      const txt = prompt("Paste deck JSON:");
      if (!txt) return;
      try {
        const d = JSON.parse(txt);
        d.id = "custom-" + Date.now();
        d.premade = false;
        saveCustomDecks([...customDecks(), d]);
        renderDecks(app2);
      } catch (e) {
        alert("Invalid JSON: " + e.message);
      }
    };
    app2.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => location.hash = "#/deck/" + b.dataset.edit);
    app2.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => location.hash = "#/deck/copy:" + b.dataset.copy);
    app2.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
      if (!confirm("Delete this deck?")) return;
      saveCustomDecks(customDecks().filter((d) => d.id !== b.dataset.del));
      renderDecks(app2);
    });
    app2.querySelectorAll("[data-export]").forEach((b) => b.onclick = async () => {
      const d = findDeck(b.dataset.export);
      const json = JSON.stringify({ ...d, premade: void 0 }, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        b.textContent = "Copied!";
      } catch {
        prompt("Deck JSON:", json);
      }
    });
  }
  function runeBoxHtml(d) {
    const colors = Object.keys(d.runes || {});
    if (!colors.length) return "";
    const art = deckRuneArt(d), hu = getLang() === "hu";
    const setTag = String(hasDef(d.legend) && getDef(d.legend).set || "OGN").toLowerCase();
    const rows = colors.map((c) => {
      const opts = runeOptions(d, c);
      const cur = art[c] && hasDef(art[c]) ? art[c] : "standard";
      const shown = cur !== "standard" ? getDef(cur) : hasDef(`RUN-${c}-${setTag}`) ? getDef(`RUN-${c}-${setTag}`) : null;
      return `<div class="dv-rune">${shown ? cardHtml(shown, { size: "xs" }) : ""}
      <div><b>${esc(c)}</b> <span class="muted">\xD7 ${d.runes[c]}</span>
        <select data-rune-color="${esc(c)}">
          <option value="standard" ${cur === "standard" ? "selected" : ""}>${hu ? "Standard r\xFAna" : "Standard Rune"}</option>
          ${opts.map((o) => `<option value="${esc(o.id)}" ${cur === o.id ? "selected" : ""}>${esc((o.owners || []).join(" / ") || o.name)}${o.fullArtRune ? " \u2014 full-art \u2728" : ""}</option>`).join("")}
        </select></div></div>`;
    }).join("");
    return `<div class="dv-box"><h4>${hu ? "R\xFAn\xE1k" : "Runes"}</h4><div class="dv-runes-pick">${rows}</div>
    <p class="muted dv-note">${hu ? "Full-art v\xE1ltozat akkor v\xE1laszthat\xF3, ha m\xE1r kinyitottad boosterb\u0151l." : "A full-art version can be picked once you pulled it from a booster."}</p></div>`;
  }
  function curveHtml(curve) {
    const max = Math.max(4, ...Object.values(curve), ...Object.values(GUIDE.curve));
    return `<div class="curve dv-curve">${Array.from({ length: 10 }, (_, i) => i + 1).map((c) => `<div class="bar" title="cost ${c}${c === 10 ? "+" : ""}: ${curve[c] || 0} (guide ${GUIDE.curve[c] || 0})">
      <div class="fill" style="height:${(curve[c] || 0) / max * 100}%">${curve[c] ? `<span class="n">${curve[c]}</span>` : ""}</div>
      <div class="target" style="bottom:${(GUIDE.curve[c] || 0) / max * 100}%"></div></div>`).join("")}</div>
    <div class="curve-labels">${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}${i === 9 ? "+" : ""}</span>`).join("")}</div>
    <p class="muted dv-note">${getLang() === "hu" ? "Oszlopok: a pakli \xB7 szaggatott: aj\xE1nlott g\xF6rbe" : "Bars: this deck \xB7 dashed: Assembly Guide"}</p>`;
  }
  function renderDeckView(app2, d) {
    const v = validateDeck(d);
    const legend = hasDef(d.legend) ? getDef(d.legend) : null;
    const ids = Object.keys(d.cards || {}).filter(hasDef);
    const defs2 = ids.map(getDef);
    const row = (c, extra = "") => `<li class="dv-row r-${rarityOf(c)}" data-cid="${esc(c.id)}" tabindex="0">
      <span class="dv-cost">${c.type === "legend" ? "\u265B" : c.cost}</span>
      <span class="dv-dot" style="background:${(c.colors || []).map((x) => COLORS[x]?.hex).filter(Boolean).length > 1 ? `linear-gradient(90deg, ${COLORS[c.colors[0]].hex} 50%, ${COLORS[c.colors[1]].hex} 50%)` : COLORS[c.colors?.[0]]?.hex || "#777"}"></span>
      <span class="dv-name">${esc(c.name)}</span>
      <span class="dv-type">${esc(TYPE_INFO[c.type]?.label || c.type)}${extra}</span></li>`;
    const slotTag = (c) => c.id === d.champion ? " \xB7 start" : c.id === d.signature ? " \xB7 start" : "";
    const byCost = (a, b) => a.cost - b.cost || a.name.localeCompare(b.name);
    const groups = [
      ["Champion", defs2.filter((c) => c.type === "champion").sort(byCost)],
      ["Signature", defs2.filter((c) => c.type === "signature").sort(byCost)],
      ["Cards", defs2.filter((c) => !["champion", "signature"].includes(c.type)).sort(byCost)]
    ].filter(([, l]) => l.length);
    const first = legend || defs2[0];
    app2.innerHTML = `<div class="page deck-view">
    <div class="row" style="margin-bottom:10px"><a class="btn ghost" href="#/decks">\u2190 Decks</a>
      <h2 style="margin:0 0 0 6px">${esc(deckName(d))}</h2><span class="spacer"></span>
      <span class="muted">${legend ? esc(legend.colors.join(" / ")) + " \xB7 " : ""}${v.stats.total} cards \xB7 avg ${v.stats.avgCost.toFixed(1)}${d.comingSoon ? ' \xB7 <span class="soon-tag">COMING SOON</span>' : ""}</span>
      ${d.comingSoon ? "" : d.premade ? `<a class="btn" href="#/deck/copy:${esc(d.id)}">Copy &amp; edit</a>` : `<a class="btn" href="#/deck/${esc(d.id)}">Edit</a>`}</div>
    <div class="dv-layout">
      <div class="dv-list">
        ${legend ? `<h4>Legend</h4><ul>${row(legend)}</ul>` : ""}
        ${groups.map(([label, list]) => `<h4>${label} <span class="muted">${list.length}</span></h4><ul>${list.map((c) => row(c, slotTag(c))).join("")}</ul>`).join("")}
        ${d.runes ? `<h4>Mana Deck</h4><div class="dv-runes">${Object.entries(d.runes).map(([c, n]) => `<span><i style="background:${COLORS[c]?.hex}"></i>${n} ${esc(c)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="dv-card" id="dv-card"></div>
      <div class="dv-side">
        <div class="dv-box"><div class="dv-box-head"><h4>${getLang() === "hu" ? "Strat\xE9gia" : "Strategy"}</h4>${langToggleHtml()}</div>${strategyHtml(d)}</div>
        ${runeBoxHtml(d)}
        <div class="dv-box"><h4>${getLang() === "hu" ? "Mana-g\xF6rbe" : "Mana curve"} <span class="muted">\xB7 avg ${v.stats.avgCost.toFixed(1)}</span></h4>${curveHtml(v.stats.curve)}</div>
        <div class="dv-info" id="dv-info"></div>
      </div>
    </div></div>`;
    bindLangToggle(app2, () => renderDeckView(app2, d));
    app2.querySelectorAll("[data-rune-color]").forEach((sel) => sel.onchange = () => {
      setRuneChoice(d.id, sel.dataset.runeColor, sel.value);
      renderDeckView(app2, d);
    });
    const show = (id) => {
      if (!hasDef(id)) return;
      const c = getDef(id);
      app2.querySelector("#dv-card").innerHTML = cardHtml(c, { size: "lg" });
      app2.querySelector("#dv-info").innerHTML = `<h4>What it does</h4>${cardDetailsHtml(c)}
      ${c.id === d.champion ? '<p class="muted">Starts in the Champion Slot.</p>' : c.id === d.signature ? '<p class="muted">Starts in the Signature Slot.</p>' : ""}`;
      app2.querySelectorAll(".dv-row").forEach((r) => r.classList.toggle("on", r.dataset.cid === id));
    };
    app2.querySelectorAll(".dv-row").forEach((r) => {
      r.onclick = () => show(r.dataset.cid);
      r.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          show(r.dataset.cid);
        }
      };
    });
    if (first) show(first.id);
  }
  function renderBuilder(app2, arg) {
    let draft;
    if (arg === "new") draft = { id: "custom-" + Date.now(), name: "New deck", legend: null, champion: null, signature: null, cards: {}, runes: {} };
    else if (arg.startsWith("copy:")) {
      const src = findDeck(arg.slice(5));
      draft = structuredClone(src);
      draft.id = "custom-" + Date.now();
      draft.name = deckName(src) + " (copy)";
      draft.premade = false;
    } else draft = structuredClone(findDeck(arg) || {});
    if (!draft.cards) {
      location.hash = "#/decks";
      return;
    }
    const legends = allCards().filter((c) => c.type === "legend").sort(sortCards);
    const bf = { set: "ALL", type: "ALL", q: "" };
    const pool = () => {
      if (!draft.legend) return [];
      const L2 = getDef(draft.legend);
      return allCards().filter((c) => {
        if (c.type === "legend" || c.type === "token" || c.type === "rune") return false;
        if (c.type === "signature" && !signatureMatchesLegend(c, L2)) return false;
        return c.colors.every((x) => L2.colors.includes(x));
      }).sort((a, b) => a.cost - b.cost || sortCards(a, b));
    };
    const setLegend = (id) => {
      draft.legend = id || null;
      if (!id) return;
      const L2 = getDef(id);
      const ok = new Set(pool().map((c) => c.id));
      for (const k of Object.keys(draft.cards)) if (!ok.has(k)) delete draft.cards[k];
      const half = RULES.RUNE_DECK_SIZE / 2;
      draft.runes = L2.colors.length > 1 ? { [L2.colors[0]]: half, [L2.colors[1]]: RULES.RUNE_DECK_SIZE - half } : { [L2.colors[0]]: RULES.RUNE_DECK_SIZE };
      fixSlots();
    };
    const fixSlots = () => {
      const L2 = draft.legend ? getDef(draft.legend) : null;
      const ids = Object.keys(draft.cards);
      const champs = ids.map(getDef).filter((d) => d.type === "champion" && championMatchesLegend(d, L2));
      if (!ids.includes(draft.champion) || !champs.some((c) => c.id === draft.champion)) draft.champion = champs[0]?.id || null;
      const sigs = ids.map(getDef).filter((d) => d.type === "signature");
      if (!ids.includes(draft.signature)) draft.signature = sigs[0]?.id || null;
    };
    const draw2 = () => {
      const L2 = draft.legend ? getDef(draft.legend) : null;
      const v = validateDeck(draft);
      const st2 = v.stats;
      const shown = pool().filter((c) => (bf.set === "ALL" || c.set === bf.set) && (bf.type === "ALL" || c.type === bf.type) && (!bf.q || (c.name + " " + c.text).toLowerCase().includes(bf.q.toLowerCase())));
      const inDeck = Object.keys(draft.cards).map(getDef).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.cost - b.cost);
      const groups = TYPE_ORDER.map((t2) => [t2, inDeck.filter((d) => d.type === t2)]).filter(([, l]) => l.length);
      const champs = inDeck.filter((d) => d.type === "champion" && championMatchesLegend(d, L2));
      const sigs = inDeck.filter((d) => d.type === "signature");
      const maxBar = Math.max(4, ...Object.values(st2.curve), ...Object.values(GUIDE.curve));
      const sets = [...new Set(pool().map((c) => c.set))].sort();
      const runeA = L2?.colors[0], runeB = L2?.colors[1];
      app2.innerHTML = `<div class="page"><div class="builder">
      <div>
        <div class="row" style="margin-bottom:10px"><button class="ghost" id="back">\u2190 Decks</button><h2 style="margin:0">Deck builder</h2></div>
        ${!L2 ? '<p class="muted">Pick a Legend on the right to see the cards you can use.</p>' : `
        <div class="filters">
          ${["ALL", ...sets].map((s) => `<span class="chip ${bf.set === s ? "on" : ""}" data-bset="${s}">${s === "ALL" ? "All sets" : s}</span>`).join("")}
          <span style="width:8px"></span>
          ${["ALL", "champion", "unit", "spell", "gear", "signature"].map((t2) => `<span class="chip ${bf.type === t2 ? "on" : ""}" data-btype="${t2}">${t2 === "ALL" ? "All types" : TYPE_INFO[t2].label}</span>`).join("")}
          <input type="search" id="bq" placeholder="Search\u2026" value="${esc(bf.q)}">
        </div>
        <p class="muted" style="margin-top:0">Click a card to add or remove it (singleton).</p>
        <div class="grid">${shown.map((c) => cardHtml(c, { size: "md", classes: draft.cards[c.id] ? "in-deck" : "" })).join("")}</div>`}
      </div>
      <aside class="side">
        <div class="field"><label>Deck name</label><input type="text" id="dname" value="${esc(draft.name)}"></div>
        <div class="field"><label>Legend</label><select id="legend"><option value="">\u2014 choose \u2014</option>
          ${legends.map((l) => `<option value="${l.id}" ${l.id === draft.legend ? "selected" : ""}>${esc(l.name)} (${l.colors.join("/")})</option>`).join("")}</select></div>
        ${L2 ? `
        <div class="field"><label>Champion Slot (starts on the table)</label><select id="champ">
          ${champs.length ? champs.map((c) => `<option value="${c.id}" ${c.id === draft.champion ? "selected" : ""}>${esc(c.name)}</option>`).join("") : '<option value="">add a matching Champion</option>'}</select></div>
        <div class="field"><label>Signature Slot (starts on the table)</label><select id="sig">
          ${sigs.length ? sigs.map((c) => `<option value="${c.id}" ${c.id === draft.signature ? "selected" : ""}>${esc(c.name)}</option>`).join("") : '<option value="">none</option>'}</select></div>
        <div class="field"><label>Mana Deck: ${runeB ? `${runeA} ${draft.runes[runeA] || 0} \xB7 ${runeB} ${draft.runes[runeB] || 0}` : `${runeA} ${RULES.RUNE_DECK_SIZE}`}</label>
          ${runeB ? `<input type="range" id="runes" min="0" max="${RULES.RUNE_DECK_SIZE}" value="${draft.runes[runeA] || 0}" style="width:100%">` : ""}</div>
        <div class="row"><b>${st2.total}/${RULES.DECK_SIZE}</b><span class="muted">U ${st2.units} \xB7 C ${st2.champions} \xB7 S ${st2.spells} \xB7 G ${st2.gears} \xB7 Sig ${st2.signatures} \xB7 avg ${st2.avgCost.toFixed(1)}</span></div>
        <div class="curve">${Array.from({ length: 10 }, (_, i) => i + 1).map((c) => `<div class="bar" title="cost ${c}: ${st2.curve[c] || 0} (guide ${GUIDE.curve[c] || 0})">
          <div class="fill" style="height:${(st2.curve[c] || 0) / maxBar * 100}%"></div>
          <div class="target" style="bottom:${(GUIDE.curve[c] || 0) / maxBar * 100}%"></div></div>`).join("")}</div>
        <div class="curve-labels">${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}${i === 9 ? "+" : ""}</span>`).join("")}</div>
        <p class="muted" style="font-size:13px;margin:2px 0 8px">Bars = your curve, dashed = Assembly Guide.</p>
        ${v.errors.map((e) => `<div class="msg err">\u2717 ${esc(e)}</div>`).join("")}
        ${v.warnings.map((e) => `<div class="msg warn">! ${esc(e)}</div>`).join("")}
        ${!v.errors.length ? '<div class="msg ok">\u2713 Deck is legal</div>' : ""}
        <ul class="decklist">${groups.map(([t2, l]) => `<li class="grp">${TYPE_INFO[t2]?.label || t2} (${l.length})</li>` + l.map((d) => `<li data-rm="${d.id}" data-cid="${d.id}"><span class="c">${d.cost}</span>${esc(d.name)}</li>`).join("")).join("")}</ul>` : ""}
        <div class="row"><button class="primary" id="save">Save deck</button><button class="ghost" id="cancel">Cancel</button></div>
      </aside></div></div>`;
      const $ = (s) => app2.querySelector(s);
      $("#back").onclick = $("#cancel").onclick = () => location.hash = "#/decks";
      $("#dname").oninput = (e) => draft.name = e.target.value;
      $("#legend").onchange = (e) => {
        setLegend(e.target.value);
        draw2();
      };
      if (L2) {
        $("#champ").onchange = (e) => {
          draft.champion = e.target.value;
          draw2();
        };
        $("#sig").onchange = (e) => {
          draft.signature = e.target.value;
          draw2();
        };
        if ($("#runes")) $("#runes").oninput = (e) => {
          draft.runes = { [runeA]: +e.target.value, [runeB]: RULES.RUNE_DECK_SIZE - e.target.value };
          draw2();
        };
        app2.querySelectorAll("[data-bset]").forEach((b) => b.onclick = () => {
          bf.set = b.dataset.bset;
          draw2();
        });
        app2.querySelectorAll("[data-btype]").forEach((b) => b.onclick = () => {
          bf.type = b.dataset.btype;
          draw2();
        });
        $("#bq").oninput = (e) => {
          bf.q = e.target.value;
          draw2();
          const n = $("#bq");
          n.focus();
          n.setSelectionRange(n.value.length, n.value.length);
        };
        app2.querySelectorAll(".grid .card").forEach((el) => {
          el.onclick = () => {
            const id = el.dataset.cid;
            draft.cards[id] ? delete draft.cards[id] : draft.cards[id] = 1;
            fixSlots();
            draw2();
          };
          el.oncontextmenu = (e) => {
            e.preventDefault();
            showCardModal(getDef(el.dataset.cid));
          };
        });
        app2.querySelectorAll("[data-rm]").forEach((li) => li.onclick = () => {
          delete draft.cards[li.dataset.rm];
          fixSlots();
          draw2();
        });
      }
      $("#save").onclick = () => {
        const list = customDecks().filter((d) => d.id !== draft.id);
        saveCustomDecks([...list, { ...draft, premade: false }]);
        location.hash = "#/decks";
      };
    };
    draw2();
  }

  // js/engine/game.js
  var clockHour = () => (/* @__PURE__ */ new Date()).getHours();
  function rand(s) {
    s.seed = s.seed + 1831565813 | 0;
    let t2 = s.seed;
    t2 = Math.imul(t2 ^ t2 >>> 15, t2 | 1);
    t2 ^= t2 + Math.imul(t2 ^ t2 >>> 7, t2 | 61);
    return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function createGame({ decks, names: names2 = ["You", "AI"], ai = [false, true], seed = Date.now(), firstPlayer = null }) {
    const s = {
      seed: seed | 0,
      uid: 0,
      turn: 0,
      active: 0,
      first: 0,
      phase: "setup",
      pending: null,
      suspended: null,
      queue: [],
      combat: null,
      stack: [],
      winner: null,
      winReason: "",
      log: [],
      players: [],
      firstOverride: firstPlayer
    };
    decks.forEach((d, i) => s.players.push(buildPlayer(s, d, i, names2[i], ai[i])));
    log(s, `${s.players[0].name} (${decks[0].name}) vs ${s.players[1].name} (${decks[1].name})`);
    s.pending = { kind: "mulligan", player: 0 };
    return s;
  }
  function mk(s, id, owner) {
    const d = getDef(id);
    return { uid: "c" + ++s.uid, id, owner, tapped: false, sick: false, mods: [], uses: d.uses ?? null, fast: false };
  }
  function buildPlayer(s, deck, idx, name, isAI) {
    const ids = [];
    for (const [id, n] of Object.entries(deck.cards)) for (let k = 0; k < n; k++) ids.push(id);
    const take = (id) => {
      const i = ids.indexOf(id);
      if (i < 0) return null;
      ids.splice(i, 1);
      return mk(s, id, idx);
    };
    const p = {
      idx,
      name,
      isAI: !!isAI,
      deckName: deck.name,
      legend: mk(s, deck.legend, idx),
      championSlot: deck.champion ? take(deck.champion) : null,
      signatureSlot: deck.signature ? take(deck.signature) : null,
      deck: shuffle(s, ids.map((id) => mk(s, id, idx))),
      hand: [],
      shields: [],
      battle: [],
      graveyard: [],
      mana: [],
      gear: [],
      manaDeck: [],
      turnsTaken: 0
    };
    for (const [color, n] of Object.entries(deck.runes || {}))
      for (let k = 0; k < n; k++) p.manaDeck.push({ uid: "r" + ++s.uid, color, tapped: false });
    shuffle(s, p.manaDeck);
    p.shields = p.deck.splice(0, RULES.SHIELDS);
    p.hand = p.deck.splice(0, RULES.OPENING_HAND);
    return p;
  }
  function log(s, msg) {
    s.logTotal = (s.logTotal || 0) + 1;
    s.log.push(msg);
    if (s.log.length > 150) s.log.splice(0, s.log.length - 150);
  }
  var other = (i) => 1 - i;
  var whoActs = (s) => s.pending ? s.pending.player : s.active;
  var nm = (inst) => getDef(inst.id).name;
  function findInst(s, uid) {
    for (const p of s.players) {
      for (const zone of ["hand", "battle", "gear", "graveyard", "shields", "deck"]) {
        const inst = p[zone].find((c) => c.uid === uid);
        if (inst) return { inst, zone, player: p.idx };
      }
      if (p.championSlot?.uid === uid) return { inst: p.championSlot, zone: "championSlot", player: p.idx };
      if (p.signatureSlot?.uid === uid) return { inst: p.signatureSlot, zone: "signatureSlot", player: p.idx };
      if (p.legend.uid === uid) return { inst: p.legend, zone: "legend", player: p.idx };
    }
    for (const it of s.stack) if (it.inst.uid === uid) return { inst: it.inst, zone: "stack", player: it.controller };
    for (const p of s.players) {
      const r = (p.reveal || []).find((c) => c.uid === uid);
      if (r) return { inst: r, zone: "reveal", player: p.idx };
    }
    return null;
  }
  function hasKeyword(s, inst, kw2) {
    const d = getDef(inst.id);
    if (kw2 === "Defensive" && hasKeyword(s, inst, "Indestructible")) return false;
    if ((d.keywords || []).includes(kw2)) return true;
    if (kw2 === "Unstoppable" && d.unstoppableIfTribe) {
      const p = s.players[inst.owner];
      if ([...p.battle, ...p.gear].some((c) => (getDef(c.id).tribes || []).includes(d.unstoppableIfTribe))) return true;
    }
    return inst.mods.some((m) => m.keyword === kw2);
  }
  var isMighty = (s, u) => power(s, u) >= 5;
  function power(s, inst, opts = {}) {
    const d = getDef(inst.id);
    let p = inst.morph ?? (d.power || 0);
    for (const m of inst.mods) if (m.power && !(opts.ignoreTemp && m.until)) p += m.power;
    const owner = s.players[inst.owner];
    if (inst.morph == null) for (const e of d.effects || []) {
      if (e.on === "static" && e.do === "mightPerRune") p += owner.mana.filter((r) => r.color === e.color).length * (e.amount ?? 1);
      if (e.on === "static" && e.do === "mightPerShield") p += owner.shields.length * (e.amount ?? 1);
    }
    for (const src of staticSources(owner)) {
      for (const e of getDef(src.id).effects || []) {
        if (e.on !== "static" || e.do !== "buff") continue;
        const f = e.filter || {};
        if (f.color && !d.colors.includes(f.color)) continue;
        if (f.keyword && !hasKeyword(s, inst, f.keyword)) continue;
        if (f.name && d.name !== f.name) continue;
        if (f.token && !d.token) continue;
        if (e.target === "self" && src.uid !== inst.uid) continue;
        p += e.amount || 0;
      }
    }
    return p;
  }
  function staticSources(p) {
    return [p.legend, ...p.gear, ...p.battle];
  }
  function canAttackNow(s, inst) {
    return !inst.tapped && (!inst.sick || inst.fast || hasKeyword(s, inst, "Haste"));
  }
  var canAttackWith = (s, u) => canAttackNow(s, u) && !hasKeyword(s, u, "Immobile");
  var hasTribe = (d, t2) => (d.tribes || []).some((x) => String(x).toLowerCase() === String(t2).toLowerCase());
  var isArt = (d) => hasTribe(d, "art");
  function artDiscounted(s, pi, d) {
    const p = s.players[pi];
    return p.artTurn === s.turn && isArt(d) && d.cost > 1 && kindOf(d) !== "legend";
  }
  function nextDiscountFits(s, p, d) {
    const nd = p.nextDiscount;
    if (!nd) return false;
    if (nd.turn != null && nd.turn !== s.turn) return false;
    if (nd.color && !d.colors.includes(nd.color)) return false;
    if (nd.tribes && !nd.tribes.some((t2) => hasTribe(d, t2))) return false;
    return true;
  }
  function effectiveCost(s, pi, d) {
    const p = s.players[pi];
    let base = artDiscounted(s, pi, d) ? 1 : d.cost;
    if (nextDiscountFits(s, p, d)) base = Math.max(0, base - p.nextDiscount.amount);
    const r = d.costReduction;
    if (!r) return base;
    let n = 0;
    if (r.perRunePair) n += Math.min(...r.perRunePair.map((c) => p.mana.filter((x) => x.color === c).length));
    if (r.perGraveTribe) n += p.graveyard.filter((c) => (getDef(c.id).tribes || []).includes(r.perGraveTribe)).length;
    return Math.max(0, base - n);
  }
  function untappedRunes(p) {
    return p.mana.filter((r) => !r.tapped);
  }
  var matches = (colors) => (r) => !colors || !colors.length || colors.includes(r.color);
  function canAfford(p, cost, colors, recycle = 0) {
    if (recycle > 0 && p.mana.filter(matches(colors)).length < recycle) return false;
    if (!cost) return true;
    const free = untappedRunes(p);
    if (free.length < cost) return false;
    if (colors && colors.length) return free.some((r) => colors.includes(r.color));
    return true;
  }
  var affordDef = (s, p, d) => canAfford(p, effectiveCost(s, p.idx, d), d.colors, d.recycle || 0);
  function payCost(s, p, cost, colors, recycle = 0) {
    if (!canAfford(p, cost, colors, recycle)) return false;
    if (cost) tapRunes(p, cost, colors);
    if (recycle > 0) {
      const pool = p.mana.filter(matches(colors)).sort((a, b) => b.tapped - a.tapped).slice(0, recycle);
      for (const r of pool) {
        p.mana.splice(p.mana.indexOf(r), 1);
        r.tapped = false;
        p.manaDeck.push(r);
      }
      log(s, `${p.name} recycles ${recycle} rune${recycle > 1 ? "s" : ""}.`);
    }
    return true;
  }
  function tapRunes(p, cost, colors) {
    const free = untappedRunes(p);
    const chosen = [];
    if (colors && colors.length) chosen.push(free.find((r) => colors.includes(r.color)));
    const rest = free.filter((r) => !chosen.includes(r)).sort((a, b) => (colors?.includes(a.color) ? 1 : 0) - (colors?.includes(b.color) ? 1 : 0));
    while (chosen.length < cost) chosen.push(rest.shift());
    chosen.forEach((r) => r.tapped = true);
  }
  function channel(s, p, n, tapped = false) {
    let got = 0;
    for (let i = 0; i < n && p.manaDeck.length; i++) {
      const r = p.manaDeck.shift();
      r.tapped = tapped;
      p.mana.push(r);
      got++;
    }
    if (got) log(s, `${p.name} channels ${got} rune${got > 1 ? "s" : ""}.`);
  }
  var SINGLE_TARGETS = /* @__PURE__ */ new Set(["enemyUnit", "friendlyUnit", "anyUnit", "enemyTappedUnit", "enemyGear"]);
  function listTargets(s, pi, spec) {
    if (!spec) return [];
    const me = s.players[pi], op = s.players[other(pi)];
    let pool;
    switch (spec.target) {
      case "enemyUnit":
        pool = op.battle;
        break;
      case "friendlyUnit":
        pool = me.battle;
        break;
      case "anyUnit":
        pool = [...me.battle, ...op.battle];
        break;
      case "enemyTappedUnit":
        pool = op.battle.filter((u) => u.tapped);
        break;
      case "enemyGear":
        return op.gear.map((g) => g.uid);
      default:
        return [];
    }
    if (spec.maxPower != null) pool = pool.filter((u) => power(s, u) <= spec.maxPower);
    if (spec.minPower != null) pool = pool.filter((u) => power(s, u) >= spec.minPower);
    if (spec.filter) pool = pool.filter((u) => matchFilter(u, spec.filter));
    pool = pool.filter((u) => u.owner === pi || !hasKeyword(s, u, "Elusive"));
    return pool.map((u) => u.uid);
  }
  function matchFilter(u, f) {
    if (!f) return true;
    const d = getDef(u.id);
    if (f.color && !d.colors.includes(f.color)) return false;
    if (f.notColor && d.colors.includes(f.notColor)) return false;
    if (f.type && d.type !== f.type) return false;
    if (f.notType && d.type === f.notType) return false;
    return true;
  }
  function resolveTargets(s, pi, source, e, targetUid, subject) {
    const me = s.players[pi], op = s.players[other(pi)];
    switch (e.target) {
      case "allEnemyUnits":
        return [...op.battle];
      case "allFriendlyUnits":
        return [...me.battle];
      case "allUnits":
        return [...me.battle, ...op.battle];
      case "self":
        return source && me.battle.includes(source) ? [source] : [];
      case "played":
        return subject ? [subject] : [];
      case void 0:
      case null:
      case "none":
        return [];
    }
    if (!targetUid) return [];
    if (!listTargets(s, pi, { ...e, maxPower: null, filter: null }).includes(targetUid)) return [];
    const f = findInst(s, targetUid);
    return f ? [f.inst] : [];
  }
  function sourcesFor(p) {
    const out = p.hand.map((inst) => ({ inst, from: "hand" }));
    if (p.championSlot) out.push({ inst: p.championSlot, from: "championSlot" });
    if (p.signatureSlot) out.push({ inst: p.signatureSlot, from: "signatureSlot" });
    return out;
  }
  function modeChoices(d) {
    if (!d.modes || !d.modes.length || d.opponentChooses) return [null];
    const k = Math.min(d.chooseModes || 1, d.modes.length);
    const idx = d.modes.map((_, i) => i);
    const out = [];
    const rec = (start, acc) => {
      if (acc.length === k) {
        out.push(acc);
        return;
      }
      for (let i = start; i < idx.length; i++) rec(i + 1, [...acc, i]);
    };
    rec(0, []);
    return out;
  }
  function playEffects(d, modes) {
    const base = effectsOn(d, "play");
    if (!modes || !d.modes) return base;
    return [...base, ...modes.flatMap((i) => (d.modes[i].effects || []).map((e) => ({ on: "play", ...e })))];
  }
  function toHand(s, p, card) {
    if (p.hand.length >= RULES.MAX_HAND) {
      p.graveyard.push(card);
      log(s, `${p.name}'s hand is full (${RULES.MAX_HAND}): ${nm(card)} goes to the Graveyard.`);
      return false;
    }
    p.hand.push(card);
    return true;
  }
  var fieldFull = (p) => p.battle.length >= RULES.MAX_BATTLE;
  function noRoom(s, p, what) {
    log(s, `${p.name}'s Battlefield is full (${RULES.MAX_BATTLE} Units): ${what} can't enter.`);
  }
  function accelerateFor(p, d) {
    const e = p.legend && (getDef(p.legend.id).effects || []).find((x) => x.on === "static" && x.do === "tribeAccelerate");
    return e && hasTribe(d, e.tribe) ? { amount: e.amount ?? 1, color: e.color } : null;
  }
  function canAccelerate(s, p, d, acc) {
    const sim = { mana: p.mana.map((r) => ({ ...r })), manaDeck: [] };
    if (!canAfford(sim, acc.amount, [acc.color], 0)) return false;
    tapRunes(sim, acc.amount, [acc.color]);
    return canAfford(sim, effectiveCost(s, p.idx, d), d.colors, d.recycle || 0);
  }
  function playOptions(s, pi, mode) {
    const p = s.players[pi];
    const acts = [];
    const seen = /* @__PURE__ */ new Set();
    for (const { inst } of sourcesFor(p)) {
      const d = getDef(inst.id);
      const k = kindOf(d);
      if (k === "legend") continue;
      if (mode === "priority") {
        if (k !== "spell") continue;
        const kws = d.keywords || [];
        if (!(kws.includes("Reaction") || kws.includes("Action") && s.stack.length === 0)) continue;
      }
      if (d.requiresStack && !s.stack.some((it) => it.controller !== pi)) continue;
      if (!affordDef(s, p, d)) continue;
      if (k === "unit" && fieldFull(p)) continue;
      const dupKey = inst.id + (p.hand.includes(inst) ? "h" : "s");
      if (seen.has(dupKey)) continue;
      seen.add(dupKey);
      for (const m of modeChoices(d)) {
        const opts = withTargets(s, pi, d, { type: "play", uid: inst.uid, ...m ? { modes: m } : {} }, k === "spell", "play", m);
        if (k === "gear" && p.gear.length >= RULES.GEAR_SLOTS) for (const o of opts) for (const g of p.gear) acts.push({ ...o, replace: g.uid });
        else acts.push(...opts);
        const acc = k === "unit" && accelerateFor(p, d);
        if (acc && canAccelerate(s, p, d, acc)) acts.push(...opts.map((o) => ({ ...o, accel: true })));
      }
    }
    return acts;
  }
  function withTargets(s, pi, d, base, required, trigger = "play", modes = null) {
    const effs = trigger === "play" ? playEffects(d, modes) : effectsOn(d, trigger);
    const spec = effs.find((e) => SINGLE_TARGETS.has(e.target)) || null;
    if (!spec) return [base];
    const ts = listTargets(s, pi, spec);
    if (!ts.length) return required ? [] : [base];
    return ts.map((t2) => ({ ...base, target: t2 }));
  }
  function promoteOptions(p, g, d, promo) {
    const chess = p.battle.filter((u) => getDef(u.id).chessRank);
    if (!chess.length) return [{ type: "activate", uid: g.uid }];
    const out = [];
    for (const u of chess) for (const to of promo.promote[getDef(u.id).chessRank] || []) {
      out.push({ type: "activate", uid: g.uid, target: u.uid, modes: [d.modes.findIndex((m) => m.to === to)] });
    }
    return out;
  }
  function doPromote(s, pi, d, promo, a) {
    const p = s.players[pi];
    if (!a.target) {
      if (fieldFull(p)) return noRoom(s, p, "a Pawn");
      const t3 = mk(s, promo.pawn, pi);
      t3.sick = true;
      p.battle.push(t3);
      log(s, `${p.name} creates ${nm(t3)}.`);
      return;
    }
    const i = p.battle.findIndex((u) => u.uid === a.target);
    if (i < 0) return;
    const old = p.battle[i];
    const t2 = mk(s, d.modes[a.modes[0]].to, pi);
    t2.sick = true;
    p.battle.splice(i, 1, t2);
    log(s, `${nm(old)} is promoted to ${nm(t2)}!`);
    emit(s, "promote", { player: pi, from: old.id, to: t2.id });
  }
  function hackOptions(s, p, g, d) {
    const op = s.players[other(p.idx)];
    const out = [];
    for (const sh of op.shields) if (!sh.faceUp) out.push({ type: "activate", uid: g.uid, target: sh.uid, modes: [0] });
    const cost = (d.effects.find((e) => e.do === "exploit") || {}).cost || 0;
    if (p.hand.length && canAfford(p, cost, null)) {
      for (const sh of op.shields) if (sh.faceUp) out.push({ type: "activate", uid: g.uid, target: sh.uid, modes: [1] });
    }
    return out;
  }
  function doHack(s, pi, d, a) {
    const p = s.players[pi], op = s.players[other(pi)];
    const sh = op.shields.find((x) => x.uid === a.target);
    if (!sh) return;
    if (a.modes?.[0] === 1) {
      payCost(s, p, (d.effects.find((e) => e.do === "exploit") || {}).cost || 0, null);
      log(s, `Exploit: ${p.name} swaps a card from hand with ${op.name}'s face-up ${nm(sh)}.`);
      s.queue.push({ kind: "exploitSwap", player: pi, shield: sh.uid });
      return;
    }
    sh.faceUp = true;
    log(s, `Side Channel: ${op.name}'s Shield is turned face up \u2014 ${nm(sh)}.`);
  }
  function doExploitSwap(s, pi, a) {
    const q = s.queue.shift();
    const p = s.players[pi], op = s.players[other(pi)];
    const i = op.shields.findIndex((x) => x.uid === q.shield);
    const h = p.hand.findIndex((c) => c.uid === a.uid);
    if (i >= 0 && h >= 0) {
      const taken = op.shields[i];
      const given = p.hand.splice(h, 1)[0];
      given.owner = op.idx;
      delete given.faceUp;
      taken.owner = pi;
      delete taken.faceUp;
      op.shields[i] = given;
      toHand(s, p, taken);
      log(s, `${p.name} takes ${nm(taken)} and plants a face-down card in ${op.name}'s Shield Zone.`);
      emit(s, "exploit", { player: pi, id: taken.id, planted: given.id });
      if ((getDef(taken.id).keywords || []).includes("Shield Trigger")) s.queue.unshift({ kind: "shieldTrigger", player: pi, uid: taken.uid });
    }
    nextFromQueue(s);
  }
  function activateOptions(s, pi) {
    const p = s.players[pi];
    const acts = [];
    for (const g of [...p.gear, ...p.battle, p.legend]) {
      const d = getDef(g.id);
      if (!(d.effects || []).some((e) => e.on === "activate")) continue;
      if (d.activateNoTap) {
        if (g.activatedTurn === s.turn) continue;
      } else if (g.tapped || p.battle.includes(g) && !canAttackNow(s, g)) continue;
      if (g === p.legend && !(d.effects || []).some((e) => e.on === "activate" && (e.do !== "recoverTribe" || p.graveyard.some((c) => e.tribes.some((t2) => hasTribe(getDef(c.id), t2)))))) continue;
      if (!(d.effects || []).some((e) => e.on === "activate" && (e.requires !== "seizure" || p.seizure) && (e.do !== "shieldify" || p.hand.length) && (e.do !== "forceThunks" || (p.thunks || []).length))) continue;
      if (!canAfford(p, d.activateCost || 0, null)) continue;
      const promo = (d.effects || []).find((e) => e.on === "activate" && e.do === "promote");
      if (promo) {
        acts.push(...promoteOptions(p, g, d, promo));
        continue;
      }
      if ((d.effects || []).some((e) => e.on === "activate" && e.do === "sideChannel")) {
        acts.push(...hackOptions(s, p, g, d));
        continue;
      }
      acts.push(...withTargets(s, pi, d, { type: "activate", uid: g.uid }, true, "activate"));
    }
    return acts;
  }
  function attackOptions(s, pi) {
    const me = s.players[pi], op = s.players[other(pi)];
    const acts = [];
    for (const u of me.battle) {
      if (!canAttackWith(s, u)) continue;
      acts.push({ type: "attack", uid: u.uid, target: { kind: op.shields.length ? "shield" : "player" } });
      const party = hasKeyword(s, u, "Party Breaker");
      for (const t2 of op.battle) if (t2.tapped || party) acts.push({ type: "attack", uid: u.uid, target: { kind: "unit", uid: t2.uid } });
    }
    return acts;
  }
  function subsets(arr, max) {
    const out = [[]];
    for (const x of arr) {
      const n = out.length;
      for (let i = 0; i < n; i++) if (out[i].length < max) out.push([...out[i], x]);
    }
    return out;
  }
  function legalActions(s, pi) {
    if (s.winner != null || whoActs(s) !== pi) return [];
    const pd = s.pending;
    const me = s.players[pi];
    if (pd) {
      switch (pd.kind) {
        case "mulligan":
          return subsets(me.hand.map((c) => c.uid), RULES.MULLIGAN_MAX).map((uids) => ({ type: "mulligan", uids }));
        case "block": {
          const acts2 = [{ type: "noBlock" }];
          for (const b of blockers(s, pi)) acts2.push({ type: "block", uid: b.uid });
          return acts2;
        }
        case "priority":
          return [{ type: "pass" }, ...playOptions(s, pi, "priority")];
        case "shieldTrigger": {
          const acts2 = [{ type: "shieldTrigger", use: false }];
          const f = findInst(s, pd.uid);
          if (f && f.zone === "hand") {
            const d = getDef(f.inst.id);
            for (const m of modeChoices(d)) acts2.push(...withTargets(s, pi, d, { type: "shieldTrigger", use: true, ...m ? { modes: m } : {} }, kindOf(d) === "spell", "play", m));
          }
          return acts2;
        }
        case "shieldify":
          return me.hand.map((c) => ({ type: "shieldify", uid: c.uid }));
        case "exploitSwap":
          return me.hand.map((c) => ({ type: "exploitSwap", uid: c.uid }));
        case "pick":
          return subsets(pd.choosable, pd.max).filter((u) => u.length >= pd.min).map((uids) => ({ type: "pick", uids }));
      }
      return [];
    }
    const acts = [];
    if (s.phase === "play") acts.push(...playOptions(s, pi, "main"), ...activateOptions(s, pi));
    let mustAttack = false;
    if (s.phase === "combat" && !s.combat) {
      const atk = attackOptions(s, pi);
      acts.push(...atk, ...activateOptions(s, pi));
      mustAttack = atk.some((a) => hasKeyword(s, findInst(s, a.uid).inst, "Furious"));
    }
    if (!mustAttack) acts.push({ type: "endPhase" });
    return acts;
  }
  function blockers(s, defIdx) {
    const c = s.combat;
    const att = findInst(s, c.attacker)?.inst;
    if (att && hasKeyword(s, att, "Unstoppable")) return [];
    return s.players[defIdx].battle.filter((u) => !u.tapped && hasKeyword(s, u, "Defensive") && !(c.target.kind === "unit" && c.target.uid === u.uid));
  }
  var keyOf = (a) => JSON.stringify(a, Object.keys(a).sort()) + JSON.stringify(a.target ?? null) + JSON.stringify(a.uids ?? null) + JSON.stringify(a.modes ?? null) + JSON.stringify(a.replace ?? null);
  function isLegal(s, pi, a) {
    const k = keyOf(normalizeAction(a));
    return legalActions(s, pi).some((x) => keyOf(normalizeAction(x)) === k);
  }
  function normalizeAction(a) {
    const n = { ...a };
    if (n.uids) n.uids = [...n.uids].sort();
    return n;
  }
  function step(s, a) {
    const pi = whoActs(s);
    if (!isLegal(s, pi, a)) throw new Error("Illegal action: " + JSON.stringify(a));
    const pd = s.pending;
    switch (a.type) {
      case "mulligan":
        doMulligan(s, pi, a.uids);
        break;
      case "play":
        doPlay(s, pi, a);
        break;
      case "activate":
        doActivate(s, pi, a);
        break;
      case "attack":
        doAttack(s, pi, a);
        break;
      case "block":
      case "noBlock":
        doBlock(s, pi, a);
        break;
      case "pass":
        doPass(s, pd);
        break;
      case "shieldTrigger":
        doShieldTrigger(s, pi, a);
        break;
      case "shieldify":
        doShieldify(s, pi, a);
        break;
      case "exploitSwap":
        doExploitSwap(s, pi, a);
        break;
      case "pick":
        doPick(s, pi, a);
        break;
      case "endPhase":
        doEndPhase(s);
        break;
    }
    settle(s);
    return s;
  }
  function settle(s) {
    for (let guard = 0; guard < 100; guard++) {
      if (s.winner != null) {
        s.pending = null;
        return;
      }
      checkDeaths(s);
      checkLowShields(s);
      if (s.winner != null) continue;
      if (s.queue.length && ["shieldify", "exploitSwap"].includes(s.queue[0].kind) && !s.players[s.queue[0].player].hand.length) {
        s.queue.shift();
        if (s.pending && s.pending.kind === "shieldify") s.pending = s.queue[0] || takeSuspended(s);
        continue;
      }
      if (s.queue.length && (!s.pending || !isQueueKind(s.pending))) {
        s.suspended = s.pending;
        s.pending = s.queue[0];
        continue;
      }
      if (!s.pending && s.turn > RULES.MAX_TURNS) {
        const [a, b] = s.players.map((p) => p.shields.length);
        setWinner(s, a === b ? -1 : a > b ? 0 : 1, "Turn limit reached");
        continue;
      }
      return;
    }
  }
  var isQueueKind = (pd) => pd.kind === "shieldTrigger" || pd.kind === "shieldify" || pd.kind === "pick" || pd.kind === "exploitSwap";
  function takeSuspended(s) {
    const x = s.suspended;
    s.suspended = null;
    return x;
  }
  function nextFromQueue(s) {
    s.pending = s.queue.length ? s.queue[0] : takeSuspended(s);
  }
  function emit(s, type, data = {}) {
    s.evCount = (s.evCount || 0) + 1;
    s.events = [...s.events || [], { n: s.evCount, type, turn: s.turn, ...data }].slice(-60);
  }
  function setWinner(s, pi, reason) {
    if (s.winner != null) return;
    if (pi >= 0 && s.players[other(pi)].cantLoseTurn === s.turn) {
      log(s, `${s.players[other(pi)].name} can't lose the game this turn!`);
      return;
    }
    s.winner = pi;
    s.winReason = reason;
    log(s, pi === -1 ? `Draw \u2014 ${reason}.` : `${s.players[pi].name} wins! ${reason}`);
    emit(s, "win", { player: pi });
  }
  function checkDeaths(s) {
    for (const p of s.players) {
      for (const u of [...p.battle]) if (p.battle.includes(u) && power(s, u) <= 0 && !hasKeyword(s, u, "Indestructible")) {
        log(s, `${nm(u)} has 0 Might and is destroyed.`);
        destroyUnit(s, u);
      }
    }
  }
  function checkLowShields(s) {
    for (const p of s.players) {
      if (p.seizure || !p.legend) continue;
      const e = (getDef(p.legend.id).effects || []).find((x) => x.on === "lowShields" && x.do === "seizure");
      if (!e || p.shields.length > (e.threshold ?? 1)) continue;
      p.seizure = true;
      const gone = s.players.reduce((n, q) => n + q.battle.length, 0);
      for (const q of s.players) q.battle = [];
      log(s, `${p.name} enters Seizure! ${gone ? `All ${gone} Unit${gone > 1 ? "s" : ""} on the Field are banished.` : "The Field is empty."}`);
      emit(s, "seizure", { player: p.idx, banished: gone });
    }
  }
  function doMulligan(s, pi, uids) {
    const p = s.players[pi];
    for (const uid of uids) {
      const i = p.hand.findIndex((c) => c.uid === uid);
      p.deck.push(...p.hand.splice(i, 1));
    }
    for (let i = 0; i < uids.length; i++) p.hand.push(p.deck.shift());
    log(s, uids.length ? `${p.name} mulligans ${uids.length} card${uids.length > 1 ? "s" : ""}.` : `${p.name} keeps their hand.`);
    if (pi === 0) {
      s.pending = { kind: "mulligan", player: 1 };
      return;
    }
    s.pending = null;
    s.first = s.firstOverride ?? (rand(s) < 0.5 ? 0 : 1);
    s.active = s.first;
    log(s, `Coin flip: ${s.players[s.first].name} goes first.`);
    beginTurn(s);
  }
  function collectContracts(s, p) {
    const due = p.contracts || [];
    p.contracts = [];
    const op = s.players[other(p.idx)];
    for (const c of due) {
      if (op.hand.length <= p.hand.length) {
        log(s, `${c.name}'s contract: ${op.name} doesn't owe anything (${op.hand.length} vs ${p.hand.length} cards).`);
        continue;
      }
      const target = [...op.battle].sort((a, b) => power(s, b) - power(s, a))[0];
      if (!target) {
        log(s, `${c.name}'s contract comes due, but ${op.name} has no Units.`);
        continue;
      }
      log(s, `The bill comes due! ${c.name} collects ${nm(target)}.`);
      const id = target.id, only = op.battle.length === 1;
      destroyUnit(s, target);
      if (!op.battle.includes(target)) emit(s, "contractCollected", { player: p.idx, victim: id, only });
    }
  }
  function beginTurn(s) {
    s.turn++;
    const p = s.players[s.active];
    s.phase = "start";
    log(s, `\u2014 Turn ${s.turn}: ${p.name} \u2014`);
    for (const u of p.battle) {
      u.tapped = false;
      u.sick = false;
      u.fast = false;
    }
    for (const r of p.mana) r.tapped = false;
    for (const g of p.gear) g.tapped = false;
    p.legend.tapped = false;
    collectContracts(s, p);
    for (const src of [p.legend, ...p.gear, ...p.battle]) fire(s, p.idx, src, "turnStart");
    if (s.winner != null) return;
    s.phase = "draw";
    drawCard(s, p.idx);
    if (s.winner != null) return;
    s.phase = "mana";
    const n = p.idx !== s.first && p.turnsTaken === 0 ? RULES.CHANNEL_SECOND_PLAYER_FIRST_TURN : RULES.CHANNEL_PER_TURN;
    channel(s, p, n);
    s.phase = "play";
  }
  function doEndPhase(s) {
    if (s.phase === "play") {
      s.phase = "combat";
      return;
    }
    s.phase = "end";
    const ap = s.players[s.active];
    for (const c of [...ap.battle, ...ap.gear]) if (hasKeyword(s, c, "Vigilance") && c.tapped) {
      c.tapped = false;
      log(s, `${nm(c)} untaps (Vigilance).`);
    }
    ap.doubleNext = false;
    ap.artTurn = null;
    for (const L2 of ap.lawPending || []) {
      const u = ap.battle.find((x) => x.uid === L2.uid);
      if (L2.turn === s.turn && L2.index === ap.plays && u) {
        u.mods.push({ power: L2.amount }, { keyword: L2.keyword });
        log(s, `The Law: ${nm(u)} gets +${L2.amount} Might and ${L2.keyword}.`);
      } else if (L2.turn === s.turn) log(s, "The Law fizzles (another card was played after it).");
    }
    ap.lawPending = [];
    for (const p of s.players) {
      for (const u of [...p.battle]) {
        if (u.temp) {
          p.battle.splice(p.battle.indexOf(u), 1);
          log(s, `The copy of ${nm(u)} dies at end of turn.`);
        } else if (u.banishEot) {
          p.battle.splice(p.battle.indexOf(u), 1);
          log(s, `${nm(u)} is banished.`);
          emit(s, "banish", { player: p.idx, id: u.id });
        }
      }
      for (const g of [...p.gear]) if (g.banishEot) {
        p.gear.splice(p.gear.indexOf(g), 1);
        log(s, `${nm(g)} is banished.`);
        emit(s, "banish", { player: p.idx, id: g.id });
      }
    }
    for (const p of s.players) for (const u of p.battle) {
      u.mods = u.mods.filter((m) => !(m.until === "eot" || m.untilTurn != null && m.untilTurn <= s.turn));
    }
    s.players[s.active].turnsTaken++;
    s.active = other(s.active);
    beginTurn(s);
  }
  function drawCard(s, pi) {
    const p = s.players[pi];
    if (p.deck.length) {
      toHand(s, p, p.deck.shift());
      return;
    }
    if (p.shields.length) {
      toHand(s, p, p.shields.shift());
      log(s, `${p.name}'s deck is empty \u2014 a shield is taken into hand instead.`);
    } else setWinner(s, other(pi), `${p.name} could not draw.`);
  }
  function removeFromSource(p, uid) {
    let i = p.hand.findIndex((c) => c.uid === uid);
    if (i >= 0) return p.hand.splice(i, 1)[0];
    if (p.championSlot?.uid === uid) {
      const c = p.championSlot;
      p.championSlot = null;
      return c;
    }
    if (p.signatureSlot?.uid === uid) {
      const c = p.signatureSlot;
      p.signatureSlot = null;
      return c;
    }
    return null;
  }
  function doPlay(s, pi, a) {
    const p = s.players[pi];
    const inst = [...p.hand, p.championSlot, p.signatureSlot].find((c) => c && c.uid === a.uid);
    const d = getDef(inst.id);
    const viaArt = artDiscounted(s, pi, d);
    p.plays = (p.playTurn === s.turn ? p.plays || 0 : 0) + 1;
    p.playTurn = s.turn;
    const acc = a.accel ? accelerateFor(p, d) : null;
    if (acc) payCost(s, p, acc.amount, [acc.color], 0);
    payCost(s, p, effectiveCost(s, pi, d), d.colors, d.recycle || 0);
    if (nextDiscountFits(s, p, d)) {
      log(s, `${d.name} costs ${p.nextDiscount.amount} less (${p.nextDiscount.source}).`);
      p.nextDiscount = null;
    }
    if (viaArt) {
      inst.banishEot = true;
      log(s, `${d.name} is played for 1 (The Chronicler) and will be banished at end of turn.`);
    }
    removeFromSource(p, a.uid);
    const k = kindOf(d);
    if (k === "spell" && s.pending && s.pending.kind === "priority") {
      s.stack.push({ inst, controller: pi, target: a.target ?? null, modes: a.modes ?? null });
      notePlay(s, pi, inst.id, "play");
      log(s, `${p.name} casts ${d.name}${a.target ? " \u2192 " + nm(findInst(s, a.target).inst) : ""} (on the stack).`);
      fireAll(s, pi, "spellCast");
      s.pending.player = other(pi);
      s.pending.passes = 0;
      return;
    }
    putIntoPlay(s, pi, inst, a.target, a.modes, a.replace);
    if (acc && p.battle.includes(inst)) {
      inst.sick = false;
      log(s, `${d.name} enters ready (Accelerate).`);
      emit(s, "accelerate", { player: pi, id: inst.id, via: "legend" });
    }
  }
  function resolveModes(s, pi, d, modes) {
    if (d.opponentChooses && d.modes?.length) {
      const i = Math.floor(rand(s) * d.modes.length);
      log(s, `${s.players[other(pi)].name} chooses "${d.modes[i].name}" for ${d.name}.`);
      return [i];
    }
    if (modes && d.modes) log(s, `${d.name}: ${modes.map((i) => d.modes[i].name).join(" + ")}.`);
    return modes;
  }
  function runTwiceIfDoubled(s, pi, src, effects, target) {
    const p = s.players[pi];
    const times = p.doubleNext ? 2 : 1;
    if (p.doubleNext) {
      p.doubleNext = false;
      log(s, "Hellyeah! It triggers twice.");
    }
    for (let i = 0; i < times; i++) runEffects(s, pi, src, effects, target);
  }
  function notePlay(s, pi, id, via) {
    s.plays = [...s.plays || [], { player: pi, id, via, turn: s.turn, n: s.playCount = (s.playCount || 0) + 1 }].slice(-12);
    emit(s, "play", { player: pi, id, via });
    checkTribeCombo(s, pi, id);
  }
  function checkTribeCombo(s, pi, id) {
    const p = s.players[pi];
    if (p.comboTurn !== s.turn) {
      p.comboTurn = s.turn;
      p.comboTribes = [];
      p.comboDone = false;
    }
    for (const t2 of getDef(id).tribes || []) if (!p.comboTribes.includes(t2.toLowerCase())) p.comboTribes.push(t2.toLowerCase());
    if (p.comboDone || !p.legend) return;
    const effs = (getDef(p.legend.id).effects || []).filter((e) => e.on === "tribeCombo");
    for (const e of effs) {
      if (!(e.tribes || []).every((t2) => p.comboTribes.includes(t2.toLowerCase()))) continue;
      p.comboDone = true;
      log(s, `${nm(p.legend)}: ${e.tribes.join(" + ")} played this turn.`);
      runEffects(s, pi, p.legend, [{ ...e, on: "play" }]);
    }
  }
  function putIntoPlay(s, pi, inst, target, modes = null, replace = null) {
    const p = s.players[pi];
    const d = getDef(inst.id);
    notePlay(s, pi, inst.id, inst.viaTrigger ? "shieldTrigger" : "play");
    delete inst.viaTrigger;
    const k = kindOf(d);
    modes = resolveModes(s, pi, d, modes);
    inst.tapped = false;
    inst.mods = [];
    if (k === "unit" && fieldFull(p)) {
      noRoom(s, p, d.name);
      p.graveyard.push(inst);
      return;
    }
    if (k === "unit") {
      inst.sick = true;
      const h = clockHour();
      inst.fast = (d.keywords || []).includes("Nostalgia Line") && h >= 16 && h < 22;
      if ((d.keywords || []).includes("Slow Start")) inst.tapped = true;
      p.battle.push(inst);
      log(s, `${p.name} plays ${d.name}${inst.fast ? " (Nostalgia Line active!)" : ""}.`);
      runEffects(s, pi, inst, playEffects(d, modes), target);
      for (const src of [p.legend, ...p.gear, ...p.battle]) if (src !== inst) fire(s, pi, src, "unitPlayed", inst);
    } else if (k === "gear") {
      if (p.gear.length >= RULES.GEAR_SLOTS) {
        const i = Math.max(0, p.gear.findIndex((g) => g.uid === replace));
        const [old] = p.gear.splice(i, 1);
        p.graveyard.push(old);
        log(s, `${nm(old)} is replaced and goes to the Graveyard.`);
        emit(s, "gearReplace", { player: pi, oldId: old.id, newId: inst.id });
      }
      p.gear.push(inst);
      log(s, `${p.name} equips ${d.name}.`);
      runEffects(s, pi, inst, playEffects(d, modes), target);
    } else {
      if (deferAsThunk(s, pi, inst, target, modes)) return;
      log(s, `${p.name} casts ${d.name}${target && findInst(s, target) ? " \u2192 " + nm(findInst(s, target).inst) : ""}.`);
      fireAll(s, pi, "spellCast");
      runTwiceIfDoubled(s, pi, inst, playEffects(d, modes), target);
      finishSpell(s, p, inst, modes);
    }
  }
  var MAX_THUNKS = 3;
  function deferAsThunk(s, pi, inst, target, modes) {
    const p = s.players[pi];
    if (p.forcing || !p.legend) return false;
    const d = getDef(inst.id);
    if ((d.keywords || []).includes("Reaction")) return false;
    if (!(getDef(p.legend.id).effects || []).some((e) => e.on === "static" && e.do === "lazyEvaluation")) return false;
    p.thunks = p.thunks || [];
    if (p.thunks.length >= MAX_THUNKS) return false;
    p.thunks.push({ inst, target: target ?? null, modes: modes ?? null });
    log(s, `${d.name} becomes a Thunk under ${nm(p.legend)} (${p.thunks.length}/${MAX_THUNKS}) \u2014 Lazy Evaluation.`);
    return true;
  }
  function forceThunks(s, pi) {
    const p = s.players[pi];
    const list = p.thunks || [];
    p.thunks = [];
    log(s, `${p.name} forces ${list.length} Thunk${list.length === 1 ? "" : "s"}!`);
    p.forcing = true;
    try {
      for (const t2 of list) {
        if (s.winner != null) break;
        const d = getDef(t2.inst.id);
        const modes = resolveModes(s, pi, d, t2.modes);
        log(s, `${d.name} resolves (forced).`);
        fireAll(s, pi, "spellCast");
        runTwiceIfDoubled(s, pi, t2.inst, playEffects(d, modes), t2.target);
        finishSpell(s, p, t2.inst, modes);
      }
    } finally {
      p.forcing = false;
    }
    emit(s, "force", { player: pi, count: list.length });
    if (list.length === MAX_THUNKS) {
      log(s, "Memoization: exactly 3 Thunks forced.");
      drawCard(s, pi);
    }
  }
  function finishSpell(s, p, inst, modes) {
    const d = getDef(inst.id);
    const after = (modes || []).map((i) => d.modes?.[i]?.afterCast).find(Boolean) || d.afterCast;
    if (inst.banishEot) {
      delete inst.banishEot;
      emit(s, "banish", { player: p.idx, id: inst.id });
      return;
    }
    if (after === "deckTop") p.deck.unshift(inst);
    else if (after === "banish") {
    } else p.graveyard.push(inst);
  }
  function effectsOn(d, trigger) {
    return (d.effects || []).filter((e) => (e.on || "play") === trigger);
  }
  function fire(s, pi, src, trigger, subject) {
    const d = getDef(src.id);
    let effs = effectsOn(d, trigger).filter((e) => !SINGLE_TARGETS.has(e.target));
    effs = effs.filter((e) => !(e.ifSubjectMighty && !(subject && isMighty(s, subject))));
    if (effs.some((e) => e.tapSource)) {
      if (src.tapped) return;
      src.tapped = true;
    }
    if (!effs.length) return;
    runEffects(s, pi, src, effs, null, subject);
    consumeUse(s, pi, src);
  }
  function fireAll(s, pi, trigger) {
    const p = s.players[pi];
    for (const src of [p.legend, ...p.gear, ...p.battle]) fire(s, pi, src, trigger);
  }
  function consumeUse(s, pi, src) {
    if (src.uses == null) return;
    const p = s.players[pi];
    if (!p.gear.includes(src)) return;
    src.uses--;
    if (src.uses <= 0) {
      p.gear.splice(p.gear.indexOf(src), 1);
      p.graveyard.push(src);
      log(s, `${nm(src)} is used up.`);
    }
  }
  function doActivate(s, pi, a) {
    const p = s.players[pi];
    const g = p.gear.find((x) => x.uid === a.uid) || p.battle.find((x) => x.uid === a.uid) || (p.legend.uid === a.uid ? p.legend : null);
    const d = getDef(g.id);
    payCost(s, p, d.activateCost || 0, null);
    if (d.activateNoTap) g.activatedTurn = s.turn;
    else g.tapped = true;
    log(s, `${p.name} activates ${d.name}.`);
    const promo = (d.effects || []).find((e) => e.on === "activate" && e.do === "promote");
    if (promo) {
      doPromote(s, pi, d, promo, a);
      consumeUse(s, pi, g);
      return;
    }
    if ((d.effects || []).some((e) => e.on === "activate" && e.do === "sideChannel")) {
      doHack(s, pi, d, a);
      return;
    }
    runTwiceIfDoubled(s, pi, g, effectsOn(d, "activate"), a.target);
    consumeUse(s, pi, g);
  }
  function runEffects(s, pi, source, effects, targetUid, subject) {
    for (const e of effects) {
      if (s.winner != null) return;
      applyEffect(s, pi, source, e, targetUid, subject);
    }
  }
  function applyEffect(s, pi, source, e, targetUid, subject) {
    const me = s.players[pi], op = s.players[other(pi)];
    const n = e.amount ?? 1;
    if (e.ifInPlay && !me.battle.some((u) => getDef(u.id).name.toLowerCase().includes(e.ifInPlay.toLowerCase()))) return;
    let targets = resolveTargets(s, pi, source, e, targetUid, subject).filter((u) => matchFilter(u, e.filter));
    const okPower = (u) => (e.maxPower == null || power(s, u) <= e.maxPower) && (e.minPower == null || power(s, u) >= e.minPower);
    if (e.limit) targets = targets.filter(okPower).sort((a, b) => power(s, b) - power(s, a)).slice(0, e.limit);
    const until = (u) => e.duration === "permanent" ? {} : e.duration === "nextTurn" ? { untilTurn: s.turn + 2 } : { until: "eot" };
    switch (e.do) {
      case "draw":
        for (let i = 0; i < n; i++) drawCard(s, e.who === "opponent" ? op.idx : pi);
        break;
      case "destroy":
        if (e.target === "enemyGear") {
          for (const g of targets) destroyGear(s, g);
          break;
        }
        for (const u of targets) if (okPower(u)) destroyUnit(s, u);
        break;
      case "buff":
        for (const u of targets) if (okPower(u)) u.mods.push({ power: n, ...until(u) });
        break;
      case "grantKeyword":
        for (const u of targets) u.mods.push({ keyword: e.keyword, ...until(u) });
        break;
      case "contract":
        drawCard(s, op.idx);
        if (s.winner === pi) {
          emit(s, "dealWin", { player: pi });
          break;
        }
        log(s, `${op.name} accepts ${getDef(source.id).name}'s gift and draws a card. The bill comes due next turn\u2026`);
        (me.contracts || (me.contracts = [])).push({ name: getDef(source.id).name });
        emit(s, "deal", { player: pi });
        break;
      case "cantLose":
        me.cantLoseTurn = s.turn;
        log(s, `${me.name} can't lose the game this turn.`);
        break;
      case "ready":
        for (const u of targets) if (okPower(u)) {
          u.tapped = false;
          u.sick = false;
        }
        break;
      case "morph":
        for (const u of targets) {
          u.morph = e.power ?? 1;
          u.mods = u.mods.filter((m) => !m.power);
          log(s, `${nm(u)} turns into a Sheep (${u.morph} Might).`);
        }
        break;
      case "sacrificeSelf":
        if (source && me.gear.includes(source)) destroyGear(s, source);
        else if (source && me.battle.includes(source)) destroyUnit(s, source);
        break;
      case "breakOwnShield":
        for (let i = 0; i < n && me.shields.length; i++) toHand(s, me, me.shields.shift());
        log(s, `${me.name} breaks their own shield.`);
        break;
      case "lockShields":
        me.shieldLockUntil = s.turn + 2;
        log(s, `${me.name}'s shields are unbreakable until their next turn.`);
        break;
      case "sealTriggers":
        op.triggersSealedUntil = s.turn + 2;
        log(s, `${op.name}'s Shield Triggers are sealed until ${me.name}'s next turn.`);
        break;
      case "doubleNext":
        me.doubleNext = true;
        break;
      case "counter": {
        for (let i = s.stack.length - 1; i >= 0; i--) {
          const it = s.stack[i];
          const cd = getDef(it.inst.id);
          if (it.controller === pi || cd.cost > (e.maxCost ?? 99) || cd.uncounterable) continue;
          s.stack.splice(i, 1);
          s.players[it.controller].graveyard.push(it.inst);
          log(s, `${cd.name} is countered.`);
          break;
        }
        break;
      }
      case "splitDestroy": {
        let budget = n;
        for (const u of [...op.battle].sort((a, b) => power(s, b) - power(s, a))) {
          const pw = Math.max(0, power(s, u));
          if (pw <= budget) {
            budget -= pw;
            destroyUnit(s, u);
          }
        }
        break;
      }
      case "summonNamed": {
        const zones = e.from || ["hand", "deck", "graveyard"];
        let found = null, zone = null;
        for (const z of zones) {
          found = me[z].find((c) => getDef(c.id).name.toLowerCase().includes(e.name.toLowerCase()));
          if (found) {
            zone = z;
            break;
          }
        }
        if (!found) {
          log(s, `No ${e.name} to summon.`);
          break;
        }
        me[zone].splice(me[zone].indexOf(found), 1);
        putIntoPlay(s, pi, found, null);
        if (e.ready) {
          found.sick = false;
          found.tapped = false;
        }
        break;
      }
      case "tap":
        for (const u of targets) if (okPower(u)) u.tapped = true;
        break;
      case "untap":
        for (const u of targets) u.tapped = false;
        break;
      case "bounce":
        for (const u of targets) if (okPower(u)) {
          const owner = s.players[u.owner];
          owner.battle.splice(owner.battle.indexOf(u), 1);
          resetInst(u);
          if (!getDef(u.id).token) toHand(s, owner, u);
          log(s, `${nm(u)} returns to ${owner.name}'s hand.`);
        }
        break;
      case "breakShield":
        breakShields(s, op.idx, n);
        break;
      case "addShield":
        for (let i = 0; i < n && me.deck.length; i++) me.shields.push(me.deck.shift());
        log(s, `${me.name} adds ${n} shield${n > 1 ? "s" : ""}.`);
        break;
      case "shieldify":
        s.queue.push({ kind: "shieldify", player: pi, remaining: n });
        break;
      case "channel":
        channel(s, me, n, !!e.tapped);
        break;
      case "forceThunks":
        forceThunks(s, pi);
        break;
      case "discard":
        for (let i = 0; i < n && op.hand.length; i++) {
          const c = op.hand.splice(Math.floor(rand(s) * op.hand.length), 1)[0];
          op.graveyard.push(c);
          log(s, `${op.name} discards ${nm(c)}.`);
        }
        break;
      case "recover": {
        const i = me.graveyard.map((c) => kindOf(getDef(c.id))).lastIndexOf("unit");
        if (i >= 0) {
          const c = me.graveyard.splice(i, 1)[0];
          if (toHand(s, me, c)) log(s, `${me.name} recovers ${nm(c)}.`);
        }
        break;
      }
      case "tutor": {
        const kind = e.kind || "unit";
        const ok = (c2) => kindOf(getDef(c2.id)) === kind && (!e.name || getDef(c2.id).name.toLowerCase().includes(e.name.toLowerCase()));
        const zone = (e.from || ["deck"]).find((z) => me[z].some(ok));
        if (!zone) {
          log(s, `${me.name} searches but finds nothing.`);
          break;
        }
        const pool = me[zone].filter(ok).sort((a, b) => getDef(b.id).cost - getDef(a.id).cost);
        const c = pool[0];
        me[zone].splice(me[zone].indexOf(c), 1);
        toHand(s, me, c);
        shuffle(s, me.deck);
        log(s, `${me.name} searches their deck and takes ${nm(c)}.`);
        break;
      }
      case "token":
        for (let i = 0; i < n; i++) {
          if (fieldFull(me)) {
            noRoom(s, me, "the token");
            break;
          }
          const t2 = mk(s, e.tokenId, pi);
          t2.sick = true;
          me.battle.push(t2);
          log(s, `${me.name} creates ${nm(t2)}.`);
          const accel = me.battle.find((u) => [e.tokenId, nm(t2)].includes(getDef(u.id).tokenAccelerate));
          if (accel && canAfford(me, 1, getDef(accel.id).colors)) {
            payCost(s, me, 1, getDef(accel.id).colors, 0);
            t2.sick = false;
            log(s, `${nm(t2)} enters ready (Accelerate).`);
            emit(s, "accelerate", { player: pi, id: t2.id });
          }
        }
        break;
      case "copyUnit":
        for (const u of targets) if (okPower(u)) {
          if (fieldFull(me)) {
            noRoom(s, me, "the copy");
            break;
          }
          const c = mk(s, u.id, pi);
          c.temp = true;
          c.fast = true;
          c.sick = true;
          me.battle.push(c);
          log(s, `${me.name} copies ${nm(u)}; the copy has Haste and dies at end of turn.`);
        }
        break;
      case "drawKeepTribe": {
        const seen = me.deck.splice(0, n);
        me.reveal = [...me.reveal || [], ...seen];
        log(s, `${me.name} reveals ${seen.map(nm).join(", ") || "nothing"}.`);
        const choosable = seen.filter((c) => hasTribe(getDef(c.id), e.tribe)).map((c) => c.uid);
        s.queue.push({
          kind: "pick",
          player: pi,
          mode: "keep",
          tribe: e.tribe,
          uids: seen.map((c) => c.uid),
          choosable,
          min: 0,
          max: choosable.length,
          title: `Keep ${e.tribe} cards`,
          source: source?.id
        });
        break;
      }
      case "recoverTribe": {
        const pool = me.graveyard.filter((c) => (e.tribes || []).some((t2) => hasTribe(getDef(c.id), t2)));
        if (!pool.length) {
          log(s, "Nothing to return.");
          break;
        }
        s.queue.push({
          kind: "pick",
          player: pi,
          mode: "recover",
          uids: pool.map((c) => c.uid),
          choosable: pool.map((c) => c.uid),
          min: 1,
          max: 1,
          title: `Return a ${(e.tribes || []).join(" or ")} card to your hand`,
          source: source?.id
        });
        break;
      }
      case "lastPlayBuff":
        for (const u of targets) {
          me.lawPending = [...me.lawPending || [], { uid: u.uid, turn: s.turn, index: me.plays || 0, amount: n, keyword: e.keyword }];
          log(s, `The Law targets ${nm(u)} \u2014 it applies if nothing else is played this turn.`);
        }
        break;
      case "artDiscount":
        me.artTurn = s.turn;
        log(s, `${me.name}'s other Art cards cost 1 this turn.`);
        break;
      case "nextDiscount":
        me.nextDiscount = { color: e.color, tribes: e.tribes, amount: n, source: getDef(source.id).name, ...e.thisTurn ? { turn: s.turn } : {} };
        log(s, `${me.name}'s next ${e.tribes ? e.tribes.join(" or ") : e.color} card costs ${n} less${e.thisTurn ? " this turn" : ""}.`);
        break;
    }
  }
  function resetInst(u) {
    u.tapped = false;
    u.sick = false;
    u.mods = [];
    u.fast = false;
    delete u.morph;
    delete u.escaped;
  }
  function destroyUnit(s, u) {
    const owner = s.players[u.owner];
    const i = owner.battle.indexOf(u);
    if (i < 0) return;
    if (hasKeyword(s, u, "Indestructible")) {
      log(s, `${nm(u)} is Indestructible!`);
      return;
    }
    if (getDef(u.id).escapeOnce && !u.escaped) {
      u.escaped = true;
      u.mods.push({ power: 1 });
      log(s, `${nm(u)} escapes from hell and gains +1 Might!`);
      emit(s, "escape", { player: owner.idx, id: u.id });
      return;
    }
    owner.battle.splice(i, 1);
    resetInst(u);
    const d = getDef(u.id);
    if (!d.token && !u.temp) owner.graveyard.push(u);
    log(s, `${d.name} is destroyed.`);
    emit(s, "destroy", { player: owner.idx, id: u.id });
    for (const src of [...owner.battle, ...owner.gear]) {
      const effs = effectsOn(getDef(src.id), "allyDied").filter((e) => !e.ifName || e.ifName === d.name);
      if (effs.length) {
        log(s, `${nm(src)} triggers.`);
        runEffects(s, owner.idx, src, effs);
      }
    }
    runEffects(s, owner.idx, u, effectsOn(d, "destroyed").filter((e) => !SINGLE_TARGETS.has(e.target)));
  }
  function destroyGear(s, g) {
    const owner = s.players[g.owner];
    const i = owner.gear.indexOf(g);
    if (i < 0) return;
    owner.gear.splice(i, 1);
    owner.graveyard.push(g);
    log(s, `${nm(g)} is destroyed.`);
  }
  function breakShields(s, defIdx, n) {
    const p = s.players[defIdx];
    if (p.shieldLockUntil > s.turn) {
      log(s, `${p.name}'s shields are unbreakable!`);
      return;
    }
    for (let i = 0; i < n && p.shields.length; i++) {
      const sh = p.shields.shift();
      const inHand = toHand(s, p, sh);
      const d = getDef(sh.id);
      log(s, `${p.name}'s shield breaks (${p.shields.length} left).`);
      if (p.triggersSealedUntil > s.turn) continue;
      if (inHand && (d.keywords || []).includes("Shield Trigger")) s.queue.push({ kind: "shieldTrigger", player: defIdx, uid: sh.uid });
    }
  }
  function doShieldTrigger(s, pi, a) {
    const q = s.queue.shift();
    if (a.use) {
      const p = s.players[pi];
      const inst = p.hand.find((c) => c.uid === q.uid);
      if (inst) {
        p.hand.splice(p.hand.indexOf(inst), 1);
        log(s, `Shield Trigger! ${p.name} plays ${nm(inst)} for free.`);
        inst.viaTrigger = true;
        putIntoPlay(s, pi, inst, a.target, a.modes);
      }
    }
    nextFromQueue(s);
  }
  function doPick(s, pi, a) {
    const q = s.queue.shift();
    const p = s.players[pi];
    const picked = new Set(a.uids);
    if (q.mode === "keep") {
      const seen = q.uids.map((uid) => p.reveal.find((c) => c.uid === uid)).filter(Boolean);
      p.reveal = p.reveal.filter((c) => !seen.includes(c));
      const keep = seen.filter((c) => picked.has(c.uid));
      for (const c of keep) toHand(s, p, c);
      p.deck.push(...seen.filter((c) => !picked.has(c.uid)));
      shuffle(s, p.deck);
      log(s, `${p.name} keeps ${keep.length ? keep.map(nm).join(", ") : "nothing"} and shuffles the rest back.`);
    } else if (q.mode === "recover") {
      for (const uid of a.uids) {
        const c = p.graveyard.find((x) => x.uid === uid);
        if (!c) continue;
        p.graveyard.splice(p.graveyard.indexOf(c), 1);
        toHand(s, p, c);
        log(s, `${p.name} returns ${nm(c)} from the Graveyard to hand.`);
      }
    }
    nextFromQueue(s);
  }
  function doShieldify(s, pi, a) {
    const q = s.queue[0];
    const p = s.players[pi];
    const i = p.hand.findIndex((c) => c.uid === a.uid);
    const card = p.hand.splice(i, 1)[0];
    p.shields.push(card);
    log(s, `${p.name} puts a card from hand into their Shield Zone.`);
    emit(s, "shieldify", { player: pi, id: card.id });
    q.remaining--;
    if (q.remaining <= 0 || !p.hand.length) {
      s.queue.shift();
      nextFromQueue(s);
    }
  }
  function doAttack(s, pi, a) {
    const me = s.players[pi], op = s.players[other(pi)];
    const att = me.battle.find((u) => u.uid === a.uid);
    att.tapped = true;
    const tName = a.target.kind === "unit" ? nm(op.battle.find((u) => u.uid === a.target.uid)) : a.target.kind === "shield" ? "a shield" : `${op.name} directly`;
    log(s, `${nm(att)} attacks ${tName}!`);
    s.combat = { attacker: att.uid, attackerOwner: pi, target: { ...a.target }, blockedBy: null };
    fire(s, pi, att, "attack");
    for (const u of [...op.battle]) fire(s, op.idx, u, "enemyAttack");
    if (s.winner != null) return;
    s.pending = blockers(s, op.idx).length ? { kind: "block", player: op.idx } : { kind: "priority", player: op.idx, passes: 0 };
  }
  function doBlock(s, pi, a) {
    if (a.type === "block") {
      const b = s.players[pi].battle.find((u) => u.uid === a.uid);
      b.tapped = true;
      s.combat.target = { kind: "unit", uid: b.uid };
      s.combat.blockedBy = b.uid;
      log(s, `${nm(b)} defends!`);
    }
    s.pending = { kind: "priority", player: pi, passes: 0 };
  }
  function doPass(s, pd) {
    pd.passes++;
    if (pd.passes < 2) {
      pd.player = other(pd.player);
      return;
    }
    if (s.stack.length) {
      const it = s.stack.pop();
      const d = getDef(it.inst.id);
      if (deferAsThunk(s, it.controller, it.inst, it.target, it.modes)) {
        pd.passes = 0;
        pd.player = s.combat ? other(s.combat.attackerOwner) : other(s.active);
        return;
      }
      log(s, `${d.name} resolves.`);
      const modes = resolveModes(s, it.controller, d, it.modes);
      runTwiceIfDoubled(s, it.controller, it.inst, playEffects(d, modes), it.target);
      finishSpell(s, s.players[it.controller], it.inst, modes);
      pd.passes = 0;
      pd.player = s.combat ? other(s.combat.attackerOwner) : other(s.active);
      return;
    }
    s.pending = null;
    resolveCombat(s);
  }
  function resolveCombat(s) {
    const c = s.combat;
    s.combat = null;
    if (!c) return;
    const A = s.players[c.attackerOwner], D = s.players[other(c.attackerOwner)];
    const att = A.battle.find((u) => u.uid === c.attacker);
    if (!att) {
      log(s, "The attack fizzles.");
      return;
    }
    if (c.target.kind === "unit") {
      const def = D.battle.find((u) => u.uid === c.target.uid);
      if (!def) {
        log(s, "The attack fizzles (target gone).");
        return;
      }
      const ap = power(s, att) + (getDef(att.id).attackBonus || 0);
      const dp = power(s, def) + (getDef(def.id).defendBonus || 0);
      log(s, `Fight: ${nm(att)} (${ap}) vs ${nm(def)} (${dp}).`);
      const kill = /* @__PURE__ */ new Set();
      if (ap >= dp) kill.add(def);
      if (dp >= ap) kill.add(att);
      if (ap > dp && hasKeyword(s, def, "Deathtouch")) kill.add(att);
      if (dp > ap && hasKeyword(s, att, "Deathtouch")) kill.add(def);
      for (const u of kill) {
        const roll = getDef(u.id).surviveRoll;
        if (roll) {
          const d6 = 1 + Math.floor(rand(s) * 6);
          log(s, `${nm(u)} rolls a D6: ${d6}${d6 >= roll ? " \u2014 survives!" : "."}`);
          if (d6 >= roll) emit(s, "survive", { player: u.owner, id: u.id });
          if (d6 >= roll) continue;
        }
        const killer = u === att ? def : att;
        const wasOn = s.players[u.owner].battle.includes(u);
        destroyUnit(s, u);
        if (wasOn && !s.players[u.owner].battle.includes(u)) emit(s, "kill", { victim: u.id, victimOwner: u.owner, killer: killer.id, killerOwner: killer.owner });
      }
      return;
    }
    if (c.target.kind === "player" && D.shields.length === 0) {
      emit(s, "finalBlow", { player: A.idx, id: att.id, copy: !!att.temp, token: !!getDef(att.id).token });
      setWinner(s, A.idx, `${nm(att)} lands the direct attack.`);
      return;
    }
    if (D.shields.length) breakShields(s, D.idx, hasKeyword(s, att, "Breaker") ? 2 : 1);
  }

  // js/engine/ai.js
  var WIN = 1e4;
  function score(s, pi) {
    if (s.winner === pi) return WIN;
    if (s.winner === other(pi)) return -WIN;
    return side(s, pi) - side(s, other(pi));
  }
  function side(s, pi) {
    const p = s.players[pi], op = s.players[other(pi)];
    let v = 0;
    v += p.shields.length * 4 + (p.shields.length === 0 ? -6 : 0);
    v += p.hand.length * 1.2;
    v += p.mana.length * 0.4;
    v += p.gear.reduce((a, g) => a + 2 + (g.uses ?? 2) * 0.3, 0);
    if (p.championSlot) v += 1.5;
    if (p.signatureSlot) v += 1.5;
    const oppBest = Math.max(0, ...op.battle.map((u) => power(s, u, { ignoreTemp: true })));
    for (const u of p.battle) {
      const pw = Math.max(0, power(s, u, { ignoreTemp: true }));
      v += 1 + pw * 1.1;
      if (hasKeyword(s, u, "Defensive") && !u.tapped) v += 0.8;
      if (u.tapped && oppBest >= pw) v -= pw * (s.active === pi ? 0.6 : 0.9);
    }
    return v;
  }
  function quickResponse(s, pi) {
    const acts = legalActions(s, pi);
    const pd = s.pending;
    if (!pd) return { type: "endPhase" };
    if (pd.kind === "block") return heuristicBlock(s, pi, acts);
    if (pd.kind === "priority") return { type: "pass" };
    if (pd.kind === "shieldTrigger") return acts.find((a) => a.use) || acts[0];
    if (pd.kind === "shieldify" || pd.kind === "exploitSwap") return cheapestHand(s, pi, acts);
    if (pd.kind === "pick") return bestPick(s, pd, acts);
    if (pd.kind === "mulligan") return { type: "mulligan", uids: [] };
    return acts[0];
  }
  function heuristicBlock(s, pi, acts) {
    const c = s.combat;
    const att = s.players[c.attackerOwner].battle.find((u) => u.uid === c.attacker);
    const ap = att ? power(s, att) : 0;
    const me = s.players[pi];
    const options = acts.filter((a) => a.type === "block").map((a) => ({ a, u: me.battle.find((u) => u.uid === a.uid) }));
    if (!options.length) return { type: "noBlock" };
    options.sort((x, y) => power(s, x.u) - power(s, y.u));
    const lethal = c.target.kind === "player" && me.shields.length === 0;
    const winner = options.find((o) => power(s, o.u) > ap);
    if (winner) return winner.a;
    if (lethal) return options[options.length - 1].a;
    const trade = options.find((o) => power(s, o.u) === ap);
    if (trade && me.shields.length <= 2) return trade.a;
    return { type: "noBlock" };
  }
  function bestPick(s, pd, acts) {
    if (pd.mode === "keep") return acts.reduce((a, b) => b.uids.length > a.uids.length ? b : a);
    const cost = (uid) => {
      for (const p of s.players) {
        const c = p.graveyard.find((x) => x.uid === uid);
        if (c) return getDef(c.id).cost;
      }
      return 0;
    };
    return acts.reduce((a, b) => cost(b.uids[0]) > cost(a.uids[0]) ? b : a);
  }
  function cheapestHand(s, pi, acts) {
    const p = s.players[pi];
    let best = acts[0], bv = Infinity;
    for (const a of acts) {
      const c = p.hand.find((x) => x.uid === a.uid);
      const d = getDef(c.id);
      const v = (d.keywords.includes("Shield Trigger") ? -5 : 0) + d.cost;
      if (v < bv) {
        bv = v;
        best = a;
      }
    }
    return best;
  }
  function simulate(s, pi, a) {
    const c = structuredClone(s);
    try {
      if (a) step(c, a);
      for (let g = 0; g < 40 && c.winner == null && c.pending; g++) {
        const who = whoActs(c);
        if (who === pi && c.pending.kind === "priority") {
          step(c, { type: "pass" });
          continue;
        }
        step(c, quickResponse(c, who));
      }
    } catch (e) {
      return null;
    }
    return c;
  }
  function cardValuePenalty(s, pi, a) {
    if (a.type !== "play") return 0;
    const p = s.players[pi];
    const inst = [...p.hand, p.championSlot, p.signatureSlot].find((c) => c && c.uid === a.uid);
    if (!inst) return 0;
    const d = getDef(inst.id);
    if (kindOf(d) === "spell") return 0.3;
    return 0;
  }
  function chooseAction(s, pi) {
    const acts = legalActions(s, pi);
    if (!acts.length) return null;
    const pd = s.pending;
    if (pd && pd.kind === "mulligan") {
      const hand = s.players[pi].hand.map((c) => ({ uid: c.uid, cost: getDef(c.id).cost })).sort((a, b) => b.cost - a.cost);
      return { type: "mulligan", uids: hand.filter((h) => h.cost >= 5).slice(0, 2).map((h) => h.uid) };
    }
    if (pd && (pd.kind === "shieldify" || pd.kind === "exploitSwap")) return cheapestHand(s, pi, acts);
    if (pd && pd.kind === "pick") return bestPick(s, pd, acts);
    const baseline = pd ? pd.kind === "priority" ? { type: "pass" } : pd.kind === "block" ? { type: "noBlock" } : acts[0] : null;
    const baseState = baseline ? simulate(s, pi, baseline) : s;
    let bestA = baseline || { type: "endPhase" };
    let bestV = baseState ? score(baseState, pi) : -Infinity;
    if (!pd && !acts.some((a) => a.type === "endPhase")) {
      bestA = acts[0];
      bestV = -Infinity;
    }
    const margin = pd ? 0.2 : 0.35;
    for (const a of acts) {
      if (a === baseline || a.type === "endPhase" || a.type === "pass" || a.type === "noBlock") continue;
      if (a.type === "shieldTrigger" && !a.use) continue;
      const ns = simulate(s, pi, a);
      if (!ns) continue;
      const v = score(ns, pi) - cardValuePenalty(s, pi, a);
      if (v > bestV + margin) {
        bestV = v;
        bestA = a;
      }
    }
    if (pd && pd.kind === "shieldTrigger" && bestA.use === false) {
      const use = acts.find((a) => a.use);
      if (use) {
        const ns = simulate(s, pi, use);
        if (ns && score(ns, pi) >= score(baseState, pi) - 0.5) return use;
      }
    }
    return bestA;
  }

  // js/ui/play.js
  var HUMAN = 0;
  var AI = 1;
  var ICON = {
    skull: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.6 1.1 4.6 2.9 5.9V19c0 .8.7 1.5 1.5 1.5H9v-2h1.5v2h3v-2H15v2h1.1c.8 0 1.5-.7 1.5-1.5v-2.9c1.8-1.3 2.9-3.3 2.9-5.9C20.5 5.6 17 2 12 2zM8.6 13.6a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zm6.8 0a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM12 14.2l1.3 2.3h-2.6z"/></svg>',
    hammer: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.5 7.3 9.8 1l3.6 3.6-1.5 1.5 1.2 1.2 1.5-1.5 2.5 2.5-4.2 4.2-2.5-2.5 1.4-1.4-1.2-1.2-1.5 1.5zM12.6 13.1l2.8-2.8 7.4 7.4a2 2 0 0 1-2.8 2.8z"/></svg>'
  };
  var AI_DELAY = 750;
  var G = null;
  function stopGame() {
    if (G?.timer) clearTimeout(G.timer);
    document.body.classList.remove("in-game");
    G = null;
  }
  var pick = { me: null, ai: "random" };
  function renderSetup(app2) {
    const decks = playableDecks();
    if (!decks.length) {
      app2.innerHTML = `<div class="page"><h2>No legal decks</h2><p>Build one in <a href="#/decks">Decks</a>.</p></div>`;
      return;
    }
    if (!decks.some((d) => d.id === pick.me)) pick.me = decks[0].id;
    if (pick.ai !== "random" && !decks.some((d) => d.id === pick.ai)) pick.ai = "random";
    const hour = (/* @__PURE__ */ new Date()).getHours();
    const soon = comingSoonDecks();
    const thumb = (d) => d ? cardHtml(getDef(d.legend), { size: "xs" }) : cardBackHtml({ size: "xs" });
    const meta = (d) => {
      if (!d) return "Surprise me";
      const L2 = getDef(d.legend);
      const v = validateDeck(d);
      return `${L2.colors.join(" / ")} \xB7 avg cost ${v.stats.avgCost.toFixed(1)} \xB7 ${d.premade ? "premade" : "custom"}`;
    };
    const option = (who, d, locked = false) => {
      const id = d ? d.id : "random";
      return `<div class="dd-opt ${pick[who] === id ? "on" : ""} ${locked ? "locked" : ""}" ${locked ? "" : `data-who="${who}" data-id="${id}"`}>
      ${thumb(d)}<div class="dd-text"><b>${esc(d ? deckName(d) : "Random deck")}</b><div class="muted">${locked ? getDef(d.legend).colors.join(" / ") : meta(d)}</div></div>
      ${locked ? '<span class="soon-tag">COMING SOON</span>' : ""}</div>`;
    };
    const dropdown = (who, label) => {
      const cur = pick[who] === "random" ? null : findDeck(pick[who]);
      return `<div class="dd" data-dd="${who}">
      <div class="dd-label">${label}</div>
      <button class="dd-btn" type="button">${thumb(cur)}<div class="dd-text"><b>${esc(cur ? deckName(cur) : "Random deck")}</b><div class="muted">${meta(cur)}</div></div><span class="dd-caret">\u25BE</span></button>
      <div class="dd-list" hidden>
        ${who === "ai" ? option(who, null) : ""}
        ${decks.map((d) => option(who, d)).join("")}
        ${soon.length ? `<div class="locked-head">Coming soon</div>${soon.map((d) => option(who, d, true)).join("")}` : ""}
      </div>
    </div>`;
    };
    app2.innerHTML = `<div class="page setup-page">
    <div class="row setup-top">
      <h2 style="margin:0">Play against AI</h2><span class="spacer"></span>
      <span class="muted">Nostalgia Line is ${hour >= 16 && hour < 22 ? '<b style="color:var(--good)">active</b>' : "inactive"} (16.00 \u2013 22.00)</span>
      <button class="primary" id="start" style="font-size:22px;padding:10px 44px">Start</button>
    </div>
    <div class="versus">
      ${dropdown("me", "Your deck")}
      <div class="vs">VS</div>
      ${dropdown("ai", "Opponent (AI) deck")}
    </div>
    <div class="row di-langrow"><span class="spacer"></span>${langToggleHtml()}</div>
    <div class="versus deck-infos">
      ${deckInfoHtml(findDeck(pick.me), pick.ai === "random" ? null : findDeck(pick.ai), "me")}
      <div></div>
      ${deckInfoHtml(pick.ai === "random" ? null : findDeck(pick.ai), findDeck(pick.me), "ai")}
    </div>
  </div>`;
    bindLangToggle(app2, () => renderSetup(app2));
    app2.querySelectorAll("[data-di-cid]").forEach((el) => el.onclick = (e) => {
      e.stopPropagation();
      showCardModal(getDef(el.dataset.diCid));
    });
    const closeAll = () => app2.querySelectorAll(".dd-list").forEach((l) => l.hidden = true);
    app2.querySelectorAll(".dd").forEach((dd) => {
      dd.querySelector(".dd-btn").onclick = (e) => {
        e.stopPropagation();
        const list = dd.querySelector(".dd-list");
        const open2 = list.hidden;
        closeAll();
        list.hidden = !open2;
        if (open2) list.querySelector(".dd-opt.on")?.scrollIntoView({ block: "nearest" });
      };
    });
    app2.querySelectorAll(".dd-opt[data-id]").forEach((el) => el.onclick = (e) => {
      e.stopPropagation();
      pick[el.dataset.who] = el.dataset.id;
      renderSetup(app2);
    });
    app2.onclick = (e) => {
      if (!e.target.closest(".dd")) closeAll();
    };
    app2.querySelector("#start").onclick = () => {
      const me = findDeck(pick.me);
      const ai = pick.ai === "random" ? decks[Math.floor(Math.random() * decks.length)] : findDeck(pick.ai);
      startGame(app2, me, ai);
    };
  }
  function startGame(app2, me, ai) {
    stopGame();
    const s = createGame({ decks: [me, ai], names: ["Player", "AI"], ai: [false, true], seed: Date.now() });
    G = { s, app: app2, decks: [me, ai], timer: null, ui: { sel: null, mull: /* @__PURE__ */ new Set() } };
    app2.onclick = onClick;
    app2.onmouseover = onHover;
    app2.oncontextmenu = (e) => {
      const el = e.target.closest("[data-cid]");
      if (el && G) {
        e.preventDefault();
        showCardModal(getDef(el.dataset.cid));
      }
    };
    render();
  }
  var PHASES = [["start", "Start"], ["draw", "Draw"], ["mana", "Mana"], ["play", "Play"], ["combat", "Combat"], ["end", "End"]];
  function render() {
    if (!G) return;
    const { s, app: app2, ui } = G;
    const legal = whoActs(s) === HUMAN && s.winner == null ? legalActions(s, HUMAN) : [];
    const hl = highlights(s, legal, ui);
    const me = s.players[HUMAN], op = s.players[AI];
    const prev = app2.querySelector(".log");
    const keepScroll = prev ? prev.scrollHeight - prev.scrollTop - prev.clientHeight < 30 : true;
    const oppPlays = (s.plays || []).filter((x) => x.player === AI).slice(-4).reverse();
    const ppKey = oppPlays.map((x) => x.n).join(",");
    const oldPanel = app2.querySelector(".played-panel");
    const keepPanel = oldPanel && oldPanel.dataset.key === ppKey ? oldPanel : null;
    const played = `<aside class="played-panel" data-key="${ppKey}"><div class="pp-title">AI played</div>
    ${oppPlays.map((x, i) => `<div class="pp-card ${i === 0 ? "newest" : ""} ${i === 0 && x.n !== G.ppAnimated ? "enter" : ""} ${x.via === "shieldTrigger" ? "via-trigger" : ""}" data-cid="${x.id}">
      ${x.via === "shieldTrigger" ? '<div class="pp-tag">SHIELD TRIGGER</div>' : ""}${cardHtml(getDef(x.id), { size: "md" })}
      <div class="pp-turn">Turn ${x.turn}</div></div>`).join("") || '<p class="muted">Nothing yet.</p>'}</aside>`;
    document.body.classList.add("in-game");
    app2.innerHTML = `<div class="game ${ui.showLog ? "show-log" : ""}">
    ${played}
    <section class="table">
      <div class="hand-row opp">${op.hand.map(() => cardBackHtml({ size: "sm" })).join("")}</div>
      ${playerRow(s, op, false, hl)}
      ${battleRow(s, op, hl)}
      ${midbar(s, legal, ui)}
      ${battleRow(s, me, hl)}
      ${playerRow(s, me, true, hl)}
      <div class="hand-row mine" style="--n:${me.hand.length}">${me.hand.map((c, i) => `<div class="hand-slot" style="${fanStyle(i, me.hand.length)}">${unitCard(s, c, hl, { inHand: true })}</div>`).join("") || '<span class="muted">Empty hand</span>'}</div>
    </section>
    <aside class="side-panel">
      <div class="preview" id="preview"><span class="muted" style="align-self:center">Hover a card to inspect it \xB7 right-click for details</span></div>
      <div class="log">${s.log.map((l) => `<div class="${l.startsWith("\u2014") ? "turn" : ""}">${esc(l)}</div>`).join("")}</div>
    </aside>
    <button class="mob-log-btn" data-btn="mob-log" title="Game log and the AI's plays" aria-label="Game log">${ui.showLog ? "\u2715" : "\u{1F4DC}"}</button>
  </div>
  ${triggerOverlay(s, legal, ui)}
  ${pickOverlay(s, legal, ui)}
  ${winnerOverlay(s)}`;
    if (keepPanel) {
      keepPanel.querySelectorAll(".pp-card.enter").forEach((e) => e.classList.remove("enter"));
      app2.querySelector(".played-panel").replaceWith(keepPanel);
    }
    if (oppPlays[0]) G.ppAnimated = oppPlays[0].n;
    const log2 = app2.querySelector(".log");
    if (keepScroll) log2.scrollTop = log2.scrollHeight;
    animateArrivals(s, app2);
    placeCracks(app2);
    if (G.logLen == null) G.logLen = s.logTotal || 0;
    const n = Math.min((s.logTotal || 0) - G.logLen, s.log.length);
    const fresh = n > 0 ? s.log.slice(-n) : [];
    G.logLen = s.logTotal || 0;
    fresh.slice(-4).forEach((l, i) => setTimeout(() => soundForLog(l, s.players[HUMAN].name), i * 90));
    for (const l of fresh) {
      const mine = l.startsWith(s.players[HUMAN].name + "'s");
      let m;
      if (m = l.match(/hand is full \((\d+)\): (.+) goes to the Graveyard/)) gameToast(mine ? `Your hand is full (${m[1]}): ${m[2]} went to the Graveyard.` : `The AI's hand is full: ${m[2]} went to its Graveyard.`);
      else if ((m = l.match(/Battlefield is full \((\d+) Units\): (.+) can't enter/)) && mine) gameToast(`Your Battlefield is full (${m[1]} Units): ${m[2]} can't enter.`);
    }
    const ach = checkAchievements(s, HUMAN, G.evSeen || 0, new Set(Object.keys(unlockedMap())));
    G.evSeen = s.evCount || 0;
    if (ach.length) unlock(ach);
    let breaks = 0;
    for (const l of fresh) {
      const b = l.match(/^(.+?)'s shield breaks/);
      if (b) {
        const who = s.players.find((p) => p.name === b[1]);
        if (who) setTimeout(() => shieldShatter(app2, who.idx), 60 + breaks++ * 260);
      }
      const t2 = l.match(/^Shield Trigger! (.+?) plays (.+?) for free\./);
      if (t2) {
        const who = s.players.find((p) => p.name === t2[1]);
        if (who) setTimeout(() => shieldTriggerFx(app2, who.idx, t2[2]), 200 + breaks * 260);
      }
    }
    if (whoActs(s) === HUMAN && s.pending?.kind === "priority" && legal.length === 1 && legal[0].type === "pass" && !G.autoPass) {
      G.autoPass = setTimeout(() => {
        G.autoPass = null;
        if (G && s.pending?.kind === "priority" && whoActs(s) === HUMAN) act({ type: "pass" });
      }, 450);
    }
    for (const l of fresh) {
      const m = l.match(/^(.+?) (casts|equips) (.+?)(?: →| \(on the stack\)|\.)/);
      if (!m) continue;
      const who = s.players.find((p) => p.name === m[1]);
      const def = who && allCards().find((c) => c.name === m[3]);
      if (!def || (def.cost || 0) < 10) continue;
      const zone = app2.querySelectorAll(".battle")[who.idx === HUMAN ? 1 : 0];
      if (zone) setTimeout(() => {
        const z = zone.getBoundingClientRect(), w = Math.min(z.height * 0.7, 90);
        lightning({ rect: { left: z.left + z.width / 2 - w / 2, top: z.top + z.height / 2 - w * 0.7, width: w, height: w * 1.4 } }, def.colors);
        sfx.lightning();
      }, 120);
    }
    scheduleAI();
  }
  function highlights(s, legal, ui) {
    const h = { playable: /* @__PURE__ */ new Set(), attackers: /* @__PURE__ */ new Set(), targets: /* @__PURE__ */ new Set(), zoneTargets: /* @__PURE__ */ new Set(), selected: ui.sel?.uid, mull: ui.mull };
    const pd = s.pending;
    if (ui.sel) {
      for (const a of ui.sel.options) {
        if (a.type === "attack") {
          if (a.target.kind === "unit") h.targets.add(a.target.uid);
          else h.zoneTargets.add(a.target.kind);
        } else if (a.target) h.targets.add(a.target);
        if (a.replace) h.targets.add(a.replace);
      }
      return h;
    }
    if (pd?.kind === "block") legal.filter((a) => a.type === "block").forEach((a) => h.targets.add(a.uid));
    else if (pd?.kind === "shieldify" || pd?.kind === "exploitSwap") legal.forEach((a) => h.targets.add(a.uid));
    else if (pd?.kind !== "mulligan") {
      for (const a of legal) {
        if (a.type === "play" || a.type === "activate") h.playable.add(a.uid);
        if (a.type === "activate") (h.taps || (h.taps = /* @__PURE__ */ new Set())).add(a.uid);
        if (a.type === "attack") h.attackers.add(a.uid);
      }
    }
    if (s.combat) {
      h.attacking = s.combat.attacker;
      h.defending = s.combat.target.uid;
    }
    return h;
  }
  function fanStyle(i, n) {
    const mid = (n - 1) / 2;
    const step2 = Math.min(7, 44 / Math.max(n, 1));
    const off = i - mid;
    const k = Math.min(4.5, 26 / n);
    return `--fr:${(off * step2).toFixed(2)}deg;--fy:${(off * off * k - mid * mid * k).toFixed(1)}px;--fz:${i + 1}`;
  }
  function unitCard(s, inst, hl, opts = {}) {
    const d = getDef(inst.id);
    const onBoard = !opts.inHand && kindOf(d) === "unit" && !opts.slot;
    const cls = [];
    if (hl.playable.has(inst.uid)) cls.push("playable");
    if (hl.attackers.has(inst.uid)) cls.push("can-attack");
    if (hl.targets.has(inst.uid)) cls.push("targetable");
    if (hl.selected === inst.uid) cls.push("selected");
    if (hl.mull?.has(inst.uid)) cls.push("mull-sel");
    if (hl.attacking === inst.uid || hl.defending === inst.uid) cls.push("attacking");
    if (onBoard && hasKeyword(s, inst, "Indestructible")) cls.push("indestructible");
    const pw = onBoard ? power(s, inst) : void 0;
    const cost = opts.inHand && inst.owner === HUMAN ? effectiveCost(s, inst.owner, d) : void 0;
    const icons = [];
    if (onBoard) {
      if (hasKeyword(s, inst, "Deathtouch")) icons.push(`<i class="ui-ico ico-death" title="Deathtouch">${ICON.skull}</i>`);
      if (hasKeyword(s, inst, "Party Breaker")) icons.push(`<i class="ui-ico ico-party" title="Party Breaker: can attack untapped Units">${ICON.hammer}</i>`);
      if (!canAttackNow(s, inst) && !inst.tapped && s.active === inst.owner) icons.push('<i class="ui-ico ico-sick" title="Summoning sickness">zZz</i>');
      if (hasKeyword(s, inst, "Defensive")) cls.push("is-def");
    }
    const iconCol = icons.length ? `<div class="ui-icons">${icons.join("")}</div>` : "";
    const tapHint = hl.taps?.has(inst.uid) ? '<div class="tap-hint" title="Tap ability ready">\u21BB TAP</div>' : "";
    const uses = inst.uses != null && !opts.inHand ? `<div class="badge-uses">${inst.uses} left</div>` : "";
    return cardHtml(d, {
      size: "sm",
      mini: !(opts.inHand && !opts.slot),
      uid: inst.uid,
      tapped: inst.tapped && !opts.inHand,
      power: pw,
      cost,
      classes: cls.join(" "),
      badges: iconCol + tapHint + uses + (opts.seizure ? '<div class="badge-seizure" title="Seizure: all Units were banished; [T] to Shieldify 1">SEIZURE</div>' : "") + (opts.thunks ? `<div class="badge-thunks" title="${esc(opts.thunks.map((t2) => getDef(t2.inst.id).name).join(", "))} \u2014 [T] Force resolves them">${opts.thunks.length}/3 THUNK${opts.thunks.length > 1 ? "S" : ""}</div>` : "")
    });
  }
  function playerRow(s, p, mine, hl) {
    const zone = (label, inner, attrs = "", empty = "") => `<div class="zone ${!inner && empty ? "empty-slot" : ""}" ${attrs} data-empty="${empty}"><span class="lbl">${label}</span>${inner}</div>`;
    const runeArt = deckRuneArt(G.decks[p.idx]);
    const runeBg = (c) => runeArt[c] && hasDef(runeArt[c]) && getDef(runeArt[c]).image ? `url('${getDef(runeArt[c]).image}') ${COLORS[c]?.hex}` : COLORS[c]?.hex;
    const runes = p.mana.map((r) => `<span class="rune ${r.tapped ? "tapped" : ""} ${runeArt[r.color] ? "art" : ""}" style="background:${runeBg(r.color)}" title="${r.color}${r.tapped ? " (tapped)" : ""}"></span>`).join("");
    const free = p.mana.filter((r) => !r.tapped).length;
    const runeDef = (c) => {
      if (runeArt[c] && hasDef(runeArt[c])) return getDef(runeArt[c]);
      const tpl = `RUN-${c}-${String(getDef(p.legend.id).set || "OGN").toLowerCase()}`;
      return hasDef(tpl) ? getDef(tpl) : allCards().find((x) => x.type === "rune" && x.colors[0] === c && !x.fullArtRune);
    };
    const runeColors = [.../* @__PURE__ */ new Set([...Object.keys(G.decks[p.idx].runes || {}), ...p.mana.map((r) => r.color)])];
    const runeShow = runeColors.map((c) => {
      const d = runeDef(c);
      const tot = p.mana.filter((r) => r.color === c).length, fr = p.mana.filter((r) => r.color === c && !r.tapped).length;
      return `<div class="rune-show ${tot ? "" : "none"}" title="${esc(c)}: ${fr} untapped / ${tot} in the Mana Zone">${d ? cardHtml(d, { size: "sm", mini: true }) : ""}<span class="rs-count"><b>${fr}</b>/${tot}</span></div>`;
    }).join("");
    const shieldsTarget = !mine && hl.zoneTargets.has("shield");
    const directTarget = !mine && hl.zoneTargets.has("player");
    const shields = p.shields.length ? `<div class="shields">${p.shields.map((sh) => sh.faceUp ? cardHtml(getDef(sh.id), { size: "sm", mini: true, uid: sh.uid, classes: `shield-faceup ${hl.targets.has(sh.uid) ? "targetable" : ""}` }) : cardBackHtml({ size: "sm", attrs: `data-uid="${sh.uid}"`, classes: hl.targets.has(sh.uid) ? "targetable" : "" })).join("")}</div><div class="stack-pile"><span class="count" style="position:static">${p.shields.length}</span></div>` : '<span class="muted" style="padding:0 8px">No shields!</span>';
    const gy = p.graveyard[p.graveyard.length - 1];
    return `<div class="zone-row">
    <div class="pinfo player-target zone-target ${s.active === p.idx ? "active" : ""} ${directTarget ? "targetable" : ""}" ${!mine ? 'data-zone="player"' : ""}>
      <span class="pname">${mine ? "You" : "AI"}${s.active === p.idx ? " \u25C6" : ""}</span>
      <span class="muted pdeck">${esc(p.deckName)}</span>${!mine ? `<span class="hand-count">Hand <b>${p.hand.length}</b></span>` : ""}
      <span class="prunes">Runes <b>${free}</b>/${p.mana.length}<span class="pmana"> \xB7 Mana deck ${p.manaDeck.length}</span></span>
      <div class="runes">${runes}</div>
    </div>
    ${zone("Runes", `<div class="rune-showcase">${runeShow}</div>`, 'data-runes="1"')}
    ${zone("Legend", unitCard(s, p.legend, hl, { slot: true, seizure: p.seizure, thunks: (p.thunks || []).length ? p.thunks : null }))}
    ${zone("Champion", p.championSlot ? unitCard(s, p.championSlot, hl, { slot: true, inHand: true }) : "", "", "played")}
    ${zone("Signature", p.signatureSlot ? unitCard(s, p.signatureSlot, hl, { slot: true, inHand: true }) : "", "", "played")}
    ${zone(`Gear ${p.gear.length}/${RULES.GEAR_SLOTS}`, p.gear.map((g) => unitCard(s, g, hl, { slot: true })).join(""), "", "empty")}
    ${zone("Shields", shields, `data-zone="${mine ? "" : "shield"}" data-shields="${p.idx}"`, "").replace('class="zone', `class="zone zone-target ${shieldsTarget ? "targetable" : ""}`)}
    ${zone("Deck", `${p.deck.length ? cardBackHtml({ size: "sm" }) : ""}<div class="stack-pile"><span class="count ${p.deck.length <= 1 ? "low" : ""}" style="position:static" title="${p.deck.length <= 1 ? "Almost out of cards!" : "Cards in deck"}">${p.deck.length}</span></div>`)}
    ${zone("Graveyard", `<div class="stack-pile" data-grave="${p.idx}" style="cursor:pointer">${gy ? cardHtml(getDef(gy.id), { size: "sm", mini: true }) : `<div style="width:var(--cw)"></div>`}<span class="count">${p.graveyard.length}</span></div>`)}
  </div>`;
  }
  function battleRow(s, p, hl) {
    const n = p.battle.length;
    return `<div class="battle ${n > 7 ? "many" : ""}" style="--n:${Math.max(n, 1)}">${p.battle.map((u) => unitCard(s, u, hl)).join("") || `<span class="empty">${p.idx === HUMAN ? "Your" : "AI's"} Battle Zone</span>`}</div>`;
  }
  function midbar(s, legal, ui) {
    const pd = s.pending;
    const human = whoActs(s) === HUMAN && s.winner == null;
    const phases = PHASES.map(([k, l]) => `<span class="phase ${s.phase === k ? "on" : ""}">${l}</span>`).join("");
    let prompt2 = "", buttons = "";
    const btn = (id, label, cls = "") => `<button class="${cls}" data-btn="${id}">${label}</button>`;
    const stack = s.stack.length ? `<div class="stackview"><span class="muted">Stack:</span>${s.stack.map((it) => cardHtml(getDef(it.inst.id), { size: "xs", mini: true })).join("")}</div>` : "";
    const combat = s.combat ? (() => {
      const A = findInst(s, s.combat.attacker)?.inst;
      const t2 = s.combat.target;
      const tname = t2.kind === "unit" ? getDef(findInst(s, t2.uid)?.inst.id ?? "").name : t2.kind === "shield" ? "a shield" : "the player";
      return A ? `<b>${esc(getDef(A.id).name)}</b> (${power(s, A)}) \u2192 ${esc(tname)}. ` : "";
    })() : "";
    if (s.winner != null) prompt2 = "Game over.";
    else if (!human) prompt2 = `<span class="who">AI</span> is thinking\u2026`;
    else if (ui.sel) {
      const d = getDef(findInst(s, ui.sel.uid)?.inst.id ?? ui.sel.cid);
      if (ui.sel.kind === "attack") {
        prompt2 = `Choose what <b>${esc(d.name)}</b> attacks: the glowing shields, a tapped enemy unit${ui.sel.options.some((a) => a.target.kind === "player") ? ", or the opponent directly" : ""}.`;
        const sh = ui.sel.options.find((a) => a.target.kind === "shield");
        const pl = ui.sel.options.find((a) => a.target.kind === "player");
        if (sh) buttons += btn("atk-shield", "Attack shields", "primary");
        if (pl) buttons += btn("atk-player", "Direct attack!", "primary");
      } else if (ui.sel.kind === "accel") {
        prompt2 = `<b>${esc(d.name)}</b> has <b>Accelerate</b>: pay 1 more Fury rune to have it enter ready?`;
        buttons += btn("acc-no", "Play normally", "primary") + btn("acc-yes", "Accelerate (+1, enters ready)", "primary");
      } else if (ui.sel.kind === "mode") {
        prompt2 = `<b>${esc(d.name)}</b> \u2014 choose ${d.chooseModes > 1 ? d.chooseModes : "one"}:`;
        const seen = /* @__PURE__ */ new Set();
        for (const a of ui.sel.options) {
          const key = (a.modes || []).join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          buttons += `<button class="primary" data-mode="${key}">${esc(a.modes.map((i) => d.modes[i].name).join(" + "))}</button>`;
        }
      } else if (ui.sel.options.some((a) => a.replace)) {
        prompt2 = `Both Gear slots are full: click the Gear that <b>${esc(d.name)}</b> replaces (it goes to the Graveyard).`;
      } else prompt2 = `Choose a target for <b>${esc(d.name)}</b>.`;
      if (ui.sel.kind !== "mode" && ui.sel.kind !== "accel" && ui.sel.options.some((a) => !a.target && !a.replace && a.type !== "attack")) buttons += btn("no-target", "Play without target");
      buttons += btn("cancel", "Cancel", "ghost");
    } else if (pd?.kind === "mulligan") {
      prompt2 = `Mulligan: click up to ${RULES.MULLIGAN_MAX} cards to put on the bottom of your deck.`;
      buttons = btn("mull", ui.mull.size ? `Mulligan ${ui.mull.size}` : "Keep hand", "primary");
    } else if (pd?.kind === "block") {
      prompt2 = `${combat}Tap a glowing <b>Defensive</b> unit to redirect the attack, or let it through.`;
      buttons = btn("noBlock", "No block", "primary");
    } else if (pd?.kind === "priority") {
      prompt2 = `${combat}${s.stack.length ? "Respond with a <b>Reaction</b>?" : "You may cast <b>Action</b> / <b>Reaction</b> spells."}`;
      buttons = btn("pass", s.stack.length ? "Pass (resolve)" : "Pass", "primary");
    } else if (pd?.kind === "shieldify") {
      prompt2 = `<b>Shieldify</b>: choose a card from your hand to put into your Shield Zone (${pd.remaining} left).`;
    } else if (pd?.kind === "exploitSwap") {
      prompt2 = `<b>Exploit</b>: choose a card from your hand to plant face down in the opponent's Shield Zone.`;
    } else if (pd?.kind === "shieldTrigger") {
      prompt2 = "Shield Trigger!";
    } else if (pd?.kind === "pick") {
      prompt2 = "Make your choice.";
    } else if (s.phase === "play") {
      prompt2 = "Play phase \u2014 click a glowing card to play it (at least 1 rune must match its color).";
      buttons = btn("end", "To Combat \u2192", "primary");
    } else if (s.phase === "combat") {
      const canEnd = legal.some((a) => a.type === "endPhase");
      prompt2 = canEnd ? "Combat \u2014 click a ready unit (orange) to attack." : "A <b>Furious</b> unit must attack this turn \u2014 click it.";
      if (canEnd) buttons = btn("end", "End turn", "primary");
    }
    return `<div class="midbar"><div class="phases">${phases}</div><span class="muted">Turn ${s.turn}</span>
    <div class="prompt">${prompt2}</div>${stack}<div class="row">${buttons}</div></div>`;
  }
  function triggerOverlay(s, legal, ui) {
    const pd = s.pending;
    if (!pd || pd.kind !== "shieldTrigger" || pd.player !== HUMAN || ui.sel || s.winner != null) return "";
    const f = findInst(s, pd.uid);
    if (!f) return "";
    const canUse = legal.some((a) => a.use);
    return `<div class="overlay"><div class="box">
    <h2>Shield Trigger!</h2>
    <p>Your broken shield was <b>${esc(getDef(f.inst.id).name)}</b>. Play it now for free?</p>
    <div style="display:flex;justify-content:center;margin:12px 0">${cardHtml(getDef(f.inst.id), { size: "md" })}</div>
    <div class="row" style="justify-content:center">
      ${canUse ? '<button class="primary" data-btn="trig-use">Use it</button>' : '<span class="muted">No legal target.</span>'}
      <button data-btn="trig-skip">Keep in hand</button></div></div></div>`;
  }
  function pickOverlay(s, legal, ui) {
    const pd = s.pending;
    if (!pd || pd.kind !== "pick" || pd.player !== HUMAN || s.winner != null) return "";
    const me = s.players[HUMAN];
    if (!ui.pick || ui.pick.key !== pd.uids.join()) {
      ui.pick = { key: pd.uids.join(), sel: new Set(pd.min === 1 && pd.choosable.length === 1 ? pd.choosable : []) };
    }
    const zoneCards = pd.mode === "keep" ? me.reveal : me.graveyard;
    const cards = pd.uids.map((uid) => zoneCards.find((c) => c.uid === uid)).filter(Boolean);
    const ok = ui.pick.sel.size >= pd.min && ui.pick.sel.size <= pd.max;
    const src = pd.source ? getDef(pd.source).name : "";
    const hint = pd.mode === "keep" ? pd.choosable.length ? `Click the <b>${esc(pd.tribe)}</b> cards you want to keep. The rest are shuffled back into your deck.` : `No ${esc(pd.tribe)} card among them; all go back into your deck.` : "Choose the card to return to your hand.";
    return `<div class="overlay"><div class="box pick-box">
    <h2>${esc(src || pd.title)}</h2><p>${hint}</p>
    <div class="pick-row">${cards.map((c) => {
      const can = pd.choosable.includes(c.uid);
      return `<div class="pick-card ${can ? "can" : "cannot"} ${ui.pick.sel.has(c.uid) ? "on" : ""}" ${can ? `data-pick="${c.uid}"` : ""}>${cardHtml(getDef(c.id), { size: "md" })}</div>`;
    }).join("")}</div>
    <div class="row" style="justify-content:center;margin-top:12px">
      <button class="primary" data-btn="pick-ok" ${ok ? "" : "disabled"}>${pd.mode === "keep" ? `Keep ${ui.pick.sel.size} card${ui.pick.sel.size === 1 ? "" : "s"}` : "Confirm choice"}</button></div>
  </div></div>`;
  }
  function gameToast(text) {
    document.querySelectorAll(".game-toast").forEach((t2) => {
      if (t2.textContent === text) t2.remove();
    });
    const el = document.createElement("div");
    el.className = "game-toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("out"), 2600);
    setTimeout(() => el.remove(), 3100);
  }
  function shieldShatter(app2, pi) {
    const zone = app2.querySelector(`[data-shields="${pi}"]`);
    if (!zone) return;
    const r = zone.getBoundingClientRect();
    const fx = document.createElement("div");
    fx.className = "shatter-fx";
    fx.style.left = r.left + r.width * 0.45 + "px";
    fx.style.top = r.top + r.height / 2 + "px";
    let shards = "";
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 120;
      const w = 6 + Math.random() * 14, h = 8 + Math.random() * 20;
      shards += `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d - 30).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;clip-path:polygon(${[0, 1, 2].map(() => `${(Math.random() * 100).toFixed(0)}% ${(Math.random() * 100).toFixed(0)}%`).join(",")})"></i>`;
    }
    fx.innerHTML = `<div class="sh-flash"></div><div class="sh-crack"></div>${shards}<div class="sh-text">SHIELD BROKEN</div>`;
    document.body.appendChild(fx);
    zone.classList.add("shield-hit");
    setTimeout(() => zone.classList.remove("shield-hit"), 600);
    const table = app2.querySelector(".table");
    table?.classList.add("quake");
    setTimeout(() => table?.classList.remove("quake"), 420);
    setTimeout(() => fx.remove(), 1300);
  }
  function shieldTriggerFx(app2, pi, name) {
    const zone = app2.querySelector(`[data-shields="${pi}"]`);
    if (!zone) return;
    const r = zone.getBoundingClientRect();
    const fx = document.createElement("div");
    fx.className = "trigger-fx";
    fx.style.left = r.left + r.width * 0.45 + "px";
    fx.style.top = r.top + r.height / 2 + "px";
    fx.innerHTML = `<div class="tr-ring"></div><div class="tr-ring r2"></div><div class="tr-text">SHIELD TRIGGER!<small>${esc(name)}</small></div>`;
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 1800);
  }
  function winnerOverlay(s) {
    if (s.winner == null) return "";
    const title = s.winner === HUMAN ? "Victory!" : s.winner === -1 ? "Draw" : "Defeat";
    return `<div class="overlay"><div class="box">
    <h2>${title}</h2><p>${esc(s.winReason)}</p><p class="muted">${s.turn} turns played.</p>
    <div class="row" style="justify-content:center">
      <button class="primary" data-btn="rematch">Rematch</button>
      <button data-btn="newgame">Choose decks</button>
      <button class="ghost" data-btn="menu">Main menu</button></div></div></div>`;
  }
  function animateArrivals(s, app2) {
    const now = new Set(s.players.flatMap((p) => p.battle.map((u) => u.uid)));
    if (!G.seen) {
      G.seen = now;
      return;
    }
    const fresh = [...now].filter((uid) => !G.seen.has(uid));
    G.seen = now;
    if (!fresh.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const uid of fresh) {
      const el = app2.querySelector(`.battle [data-uid="${uid}"]`);
      if (!el) continue;
      const inst = findInst(s, uid)?.inst;
      const d = getDef(inst.id);
      const foil = isFoil(d);
      const mighty = power(s, inst) >= 5;
      const titanic = (d.cost || 0) >= 10;
      el.classList.add(foil ? "arrive-foil" : "arrive");
      const land = foil ? 620 : 280;
      if (foil) sfx.foilLand(0.55);
      else if (!mighty) sfx.play();
      if (mighty && !foil) sfx.play();
      if (foil) setTimeout(() => shockwave(el), land - 60);
      if (titanic) setTimeout(() => {
        lightning(el, d.colors);
        sfx.lightning();
      }, Math.max(0, land - 140));
      if (mighty) setTimeout(() => {
        crackField(el, app2);
        sfx.crack();
      }, land - 40);
    }
  }
  if (typeof window !== "undefined") window.RajongoiDebug = { get state() {
    return G?.s;
  }, render: () => G && render() };
  if (typeof window !== "undefined") window.RajongoiFX = {
    crack: (el) => crackField(el, G ? G.app : document),
    land: (el) => shockwave(el),
    bolt: (el, colors, opts) => {
      lightning(el, colors, opts);
      if (!opts) sfx.lightning();
    },
    // demo(cardId): drop a card onto your battle zone with the real arrival effects
    demo: (id) => {
      const d = getDef(id);
      const zone = document.querySelectorAll(".battle")[1];
      zone.querySelectorAll(":scope > .card, :scope > .empty").forEach((n) => n.remove());
      zone.insertAdjacentHTML("beforeend", cardHtml(d, { size: "sm", mini: true, uid: "demo-" + id }));
      const el = zone.querySelector(":scope > .card:last-child");
      const foil = isFoil(d), pw = d.power || 0, land = foil ? 620 : 280;
      el.classList.add(foil ? "arrive-foil" : "arrive");
      if (foil) {
        sfx.foilLand(0.55);
        setTimeout(() => shockwave(el), land - 60);
      }
      if ((d.cost || 0) >= 10) setTimeout(() => {
        lightning(el, d.colors);
        sfx.lightning();
      }, Math.max(0, land - 140));
      if (pw >= 5) setTimeout(() => {
        crackField(el, G.app);
        sfx.crack();
      }, land - 40);
    },
    cracks: () => (G?.cracks || []).map((k) => k.uid)
  };
  function layoutRect(el) {
    const parent = el.offsetParent;
    if (!parent) return el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const left = pr.left + parent.clientLeft + el.offsetLeft, top = pr.top + parent.clientTop + el.offsetTop;
    return { left, top, width: el.offsetWidth, height: el.offsetHeight };
  }
  function shockwave(el) {
    const r = layoutRect(el);
    const fx = document.createElement("div");
    fx.className = "land-fx";
    fx.style.left = r.left + r.width / 2 + "px";
    fx.style.top = r.top + r.height / 2 + "px";
    fx.style.setProperty("--w", r.width + "px");
    let sparks = "";
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * 2 * i / 18 + Math.random() * 0.3;
      const dist = r.width * (0.9 + Math.random() * 0.9);
      sparks += `<i style="--x:${(Math.cos(a) * dist).toFixed(0)}px;--y:${(Math.sin(a) * dist * 0.6).toFixed(0)}px;animation-delay:${(Math.random() * 60).toFixed(0)}ms"></i>`;
    }
    fx.innerHTML = `<div class="ring"></div><div class="ring r2"></div>${sparks}`;
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 1200);
  }
  function lightning(el, colors, opts = {}) {
    const r = el.rect || layoutRect(el);
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement("canvas");
    cv.className = "bolt-canvas";
    cv.width = W * dpr;
    cv.height = H * dpr;
    document.body.appendChild(cv);
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const tx2 = r.left + r.width / 2, ty = r.top + r.height * 0.32;
    const hexes = (colors && colors.length ? colors : ["Mind"]).map((c) => COLORS[c]?.hex || "#6be3ff");
    const rgb = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return [n >> 16 & 255, n >> 8 & 255, n & 255];
    };
    function fractal(x0, y0, x1, y1, disp, depth) {
      let pts = [[x0, y0], [x1, y1]];
      for (let d = 0; d < depth; d++) {
        const next = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          const len = Math.hypot(bx - ax, by - ay);
          const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
          const off = (Math.random() - 0.5) * disp;
          next.push([(ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off], pts[i + 1]);
        }
        pts = next;
        disp *= 0.55;
      }
      return pts;
    }
    function makeBolt(sx, ex, ey) {
      const main = fractal(sx, -30, ex, ey, Math.max(140, ey * 0.32), 7);
      const segs = [];
      const add = (pts, width, alpha, t0, t1, level) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const t2 = t0 + (t1 - t0) * (i / (pts.length - 1));
          segs.push({ a: pts[i], b: pts[i + 1], w: width, al: alpha, t: t2 });
          if (level < 2 && Math.random() < (level ? 0.03 : 0.045) && i > 4 && i < pts.length - 8) {
            const [bx, by] = pts[i];
            const ang = Math.PI / 2 + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.65);
            const L2 = (ey - by) * (0.25 + Math.random() * 0.35) / (level + 1);
            const br = fractal(bx, by, bx + Math.cos(ang) * L2, by + Math.sin(ang) * L2, L2 * 0.45, 5);
            add(br, width * 0.55, alpha * 0.6, t2, Math.min(1, t2 + 0.25), level + 1);
          }
        }
      };
      add(main, 1, 1, 0, 1, 0);
      return segs;
    }
    let bolts = [];
    const spawn = () => {
      bolts = hexes.map((hex, i) => ({
        col: rgb(hex),
        segs: makeBolt(tx2 + (Math.random() - 0.5) * W * 0.25 + (hexes.length > 1 ? (i ? 1 : -1) * 60 : 0), tx2 + (hexes.length > 1 ? (i ? 1 : -1) * 6 : 0), ty)
      }));
    };
    spawn();
    const sparks = [];
    const burst2 = (n) => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * (0.05 + Math.random() * 0.9);
        const v = 2 + Math.random() * 7;
        const c = bolts[i % bolts.length].col;
        sparks.push({ x: tx2, y: ty + r.height * 0.15, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c });
      }
    };
    const LEADER = 150, END = 1150;
    const flicker = (t2) => {
      if (t2 < LEADER) return 0.35;
      const k = t2 - LEADER;
      const keys = [[0, 1], [95, 1], [125, 0.25], [150, 1], [230, 0.9], [260, 0.3], [290, 0.85], [420, 0.55], [END - LEADER, 0]];
      for (let i = 0; i < keys.length - 1; i++) {
        const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
        if (k >= t0 && k <= t1) return v0 + (v1 - v0) * ((k - t0) / (t1 - t0));
      }
      return 0;
    };
    const start = performance.now();
    let struck = false, restruck = false;
    function drawBolt(bolt, progress, intensity) {
      const [cr, cg, cb] = bolt.col;
      const groups = /* @__PURE__ */ new Map();
      for (const s of bolt.segs) {
        if (s.t > progress) continue;
        let p = groups.get(s.w);
        if (!p) {
          p = { path: new Path2D(), al: s.al };
          groups.set(s.w, p);
        }
        p.path.moveTo(s.a[0], s.a[1]);
        p.path.lineTo(s.b[0], s.b[1]);
      }
      const light = `${Math.min(255, cr + 90)},${Math.min(255, cg + 90)},${Math.min(255, cb + 90)}`;
      const passes = [
        { w: 54, a: 0.1, c: `${cr},${cg},${cb}`, blur: 0 },
        { w: 24, a: 0.3, c: `${cr},${cg},${cb}`, blur: 28 },
        { w: 9, a: 0.95, c: `${cr},${cg},${cb}`, blur: 10 },
        { w: 4, a: 0.9, c: light, blur: 0 },
        { w: 2.2, a: 1, c: "255,255,255", blur: 0 }
      ];
      for (const [w, grp] of groups) {
        for (const p of passes) {
          g.shadowBlur = p.blur;
          g.shadowColor = `rgb(${cr},${cg},${cb})`;
          g.strokeStyle = `rgba(${p.c},${p.a * grp.al * intensity})`;
          g.lineWidth = p.w * w;
          g.stroke(grp.path);
        }
      }
      g.shadowBlur = 0;
    }
    function frame(now) {
      const t2 = now - start;
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      g.lineJoin = "round";
      const inten = flicker(t2);
      if (!struck && t2 >= LEADER) {
        struck = true;
        burst2(42);
      }
      if (!restruck && t2 >= LEADER + 125) {
        restruck = true;
        spawn();
        burst2(18);
      }
      const progress = Math.min(1, t2 / LEADER);
      if (t2 >= LEADER) {
        const [cr, cg, cb] = bolts[0].col;
        g.fillStyle = `rgba(${cr},${cg},${cb},${0.3 * inten})`;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(255,255,255,${0.12 * inten})`;
        g.fillRect(0, 0, W, H);
      }
      for (const bolt of bolts) drawBolt(bolt, progress, t2 < LEADER ? 0.55 : inten);
      if (t2 >= LEADER) {
        const [cr, cg, cb] = bolts[bolts.length - 1].col;
        const rad = r.width * (1.6 + inten);
        const gr = g.createRadialGradient(tx2, ty + r.height * 0.2, 0, tx2, ty + r.height * 0.2, rad);
        gr.addColorStop(0, `rgba(255,255,255,${0.75 * inten})`);
        gr.addColorStop(0.25, `rgba(${cr},${cg},${cb},${0.55 * inten})`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(tx2, ty + r.height * 0.2, rad, rad * 0.55, 0, 0, Math.PI * 2);
        g.fill();
      }
      for (const p of sparks) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.32;
        p.vx *= 0.985;
        p.life -= 0.022;
        if (p.life <= 0) continue;
        g.strokeStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${p.life})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        g.stroke();
        g.fillStyle = `rgba(255,255,255,${p.life})`;
        g.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      if (opts.freezeAt != null) return;
      if (t2 < END || sparks.some((p) => p.life > 0)) requestAnimationFrame(frame);
      else cv.remove();
    }
    if (opts.freezeAt != null) {
      for (let ft = 0; ft <= opts.freezeAt; ft += 16) frame(start + ft);
      setTimeout(() => cv.remove(), opts.hold || 1500);
      return;
    }
    requestAnimationFrame(frame);
  }
  var CRACK_MS = 2600;
  function crackField(el, app2) {
    const w = el.offsetWidth, h = el.offsetHeight;
    const size = w * 3.6;
    const c = size / 2;
    let paths = "";
    const rays = 8 + Math.floor(Math.random() * 3);
    for (let i = 0; i < rays; i++) {
      const a = Math.PI * 2 * i / rays + (Math.random() - 0.5) * 0.5;
      const len = c * (0.55 + Math.random() * 0.45);
      let x = c, y = c, pts = `M${c} ${c}`;
      for (let k = 1; k <= 5; k++) {
        const t2 = len * k / 5;
        x = c + Math.cos(a) * t2 + (Math.random() - 0.5) * size * 0.06;
        y = c + Math.sin(a) * t2 * 0.55 + (Math.random() - 0.5) * size * 0.035;
        pts += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        if (k === 2 || k === 3) {
          const br = a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
          const bl = len * 0.22;
          paths += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + Math.cos(br) * bl).toFixed(1)} ${(y + Math.sin(br) * bl * 0.55).toFixed(1)}" stroke-width="${(size * 8e-3).toFixed(1)}"/>`;
        }
      }
      paths += `<path d="${pts}" stroke-width="${(size * 0.016).toFixed(1)}"/>`;
    }
    const html = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <defs><radialGradient id="cg"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${c}" cy="${c}" rx="${c * 0.85}" ry="${c * 0.42}" fill="url(#cg)"/>
    <g class="glow" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
    <g class="dark" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>
    ${Array.from({ length: 10 }, () => `<b style="--x:${((Math.random() - 0.5) * size * 0.7).toFixed(0)}px;--y:${(-Math.random() * size * 0.3).toFixed(0)}px"></b>`).join("")}`;
    const uid = el.dataset.uid;
    if (G) {
      G.cracks = (G.cracks || []).filter((k) => k.uid !== uid);
      G.cracks.push({ uid, html, size, start: performance.now() });
      placeCracks(app2);
    }
    const table = (app2.querySelector ? app2 : document).querySelector(".table");
    table?.classList.add("quake");
    setTimeout(() => table?.classList.remove("quake"), 450);
    setTimeout(() => G && placeCracks(G.app), CRACK_MS + 50);
  }
  function placeCracks(app2) {
    if (!G || !G.cracks?.length) return;
    const now = performance.now();
    G.cracks = G.cracks.filter((k) => now - k.start < CRACK_MS);
    app2.querySelectorAll(".crack-layer").forEach((l) => l.replaceChildren());
    for (const k of G.cracks) {
      const card = app2.querySelector(`.battle [data-uid="${k.uid}"]`);
      let battle = card?.closest(".battle");
      if (card) {
        k.x = card.offsetLeft + card.offsetWidth / 2;
        k.y = card.offsetTop + card.offsetHeight / 2;
        k.side = [...app2.querySelectorAll(".battle")].indexOf(battle);
      } else battle = app2.querySelectorAll(".battle")[k.side ?? -1];
      if (!battle || k.x == null) continue;
      let layer = battle.querySelector(":scope > .crack-layer");
      if (!layer) {
        layer = document.createElement("div");
        layer.className = "crack-layer";
        battle.prepend(layer);
      }
      const fx = document.createElement("div");
      fx.className = "crack-fx";
      fx.style.cssText = `left:${k.x - k.size / 2}px;top:${k.y - k.size / 2}px;width:${k.size}px;height:${k.size}px;--t:${Math.round(now - k.start)}ms`;
      fx.innerHTML = k.html;
      layer.appendChild(fx);
    }
  }
  function act(a) {
    try {
      step(G.s, a);
    } catch (e) {
      toast2(e.message);
    }
    G.ui.sel = null;
    render();
  }
  function toast2(msg) {
    const t2 = document.createElement("div");
    t2.className = "toast";
    t2.textContent = msg;
    document.body.appendChild(t2);
    setTimeout(() => t2.remove(), 2200);
  }
  function onHover(e) {
    if (!G) return;
    const el = e.target.closest("[data-cid]");
    const pv = G.app.querySelector("#preview");
    if (!el || !pv || el.closest("#preview")) return;
    const f = el.dataset.uid ? findInst(G.s, el.dataset.uid) : null;
    const d = getDef(el.dataset.cid);
    const pw = f && f.zone === "battle" ? power(G.s, f.inst) : void 0;
    pv.innerHTML = `<div>${cardHtml(d, { size: "lg", power: pw })}${cardDetailsHtml(d, { power: pw })}</div>`;
  }
  function onClick(e) {
    if (!G) return;
    const { s, ui } = G;
    const b = e.target.closest("[data-btn]");
    if (b) return onButton(b.dataset.btn);
    const mb = e.target.closest("[data-mode]");
    if (mb && ui.sel?.kind === "mode") {
      const opts = ui.sel.options.filter((a) => (a.modes || []).join(",") === mb.dataset.mode);
      if (opts.length === 1 && !opts[0].target) return act(opts[0]);
      ui.sel = { ...ui.sel, kind: ui.sel.after || "play", options: opts };
      return render();
    }
    const pk = e.target.closest("[data-pick]");
    if (pk && ui.pick && s.pending?.kind === "pick") {
      const uid2 = pk.dataset.pick, sel = ui.pick.sel;
      if (sel.has(uid2)) sel.delete(uid2);
      else {
        if (sel.size >= s.pending.max) sel.delete([...sel][0]);
        sel.add(uid2);
      }
      return render();
    }
    const gy = e.target.closest("[data-grave]");
    if (gy) return showGrave(+gy.dataset.grave);
    if (s.winner != null || whoActs(s) !== HUMAN) return;
    const legal = legalActions(s, HUMAN);
    const zoneEl = e.target.closest("[data-zone]");
    const uidEl = e.target.closest("[data-uid]");
    const uid = uidEl?.dataset.uid;
    if (ui.sel) {
      let a = null;
      if (uid) a = ui.sel.options.find((o) => o.type === "attack" ? o.target.uid === uid : o.target === uid || o.replace === uid);
      if (!a && zoneEl?.dataset.zone) a = ui.sel.options.find((o) => o.type === "attack" && o.target.kind === zoneEl.dataset.zone);
      if (a) return act(a);
      ui.sel = null;
      if (!uid) return render();
    }
    if (!uid) return;
    const pd = s.pending;
    if (pd?.kind === "mulligan") {
      if (!s.players[HUMAN].hand.some((c) => c.uid === uid)) return;
      ui.mull.has(uid) ? ui.mull.delete(uid) : ui.mull.size < RULES.MULLIGAN_MAX && ui.mull.add(uid);
      return render();
    }
    if (pd?.kind === "block") {
      const a = legal.find((x) => x.type === "block" && x.uid === uid);
      return a ? act(a) : null;
    }
    if (pd?.kind === "shieldify" || pd?.kind === "exploitSwap") {
      const a = legal.find((x) => x.uid === uid);
      return a ? act(a) : null;
    }
    const plays = legal.filter((a) => (a.type === "play" || a.type === "activate") && a.uid === uid);
    const me = s.players[HUMAN];
    const handCard = me.hand.find((c) => c.uid === uid) || [me.championSlot, me.signatureSlot].find((c) => c && c.uid === uid);
    if (!plays.length && handCard && kindOf(getDef(handCard.id)) === "unit" && me.battle.length >= RULES.MAX_BATTLE) {
      return gameToast(`Your Battlefield is full (${RULES.MAX_BATTLE} Units) \u2014 you can't play more Units.`);
    }
    if (plays.length) {
      if (plays.length === 1 && !plays[0].target) return act(plays[0]);
      if (plays.some((a) => a.accel)) {
        ui.sel = { kind: "accel", uid, options: plays };
        return render();
      }
      const modeKeys = new Set(plays.map((a) => (a.modes || []).join(",")));
      ui.sel = { kind: modeKeys.size > 1 ? "mode" : "play", uid, options: plays };
      return render();
    }
    const attacks = legal.filter((a) => a.type === "attack" && a.uid === uid);
    if (attacks.length) {
      ui.sel = { kind: "attack", uid, options: attacks };
      return render();
    }
  }
  function onButton(id) {
    const { s, ui } = G;
    const legal = whoActs(s) === HUMAN ? legalActions(s, HUMAN) : [];
    switch (id) {
      case "end":
        return act({ type: "endPhase" });
      case "pass":
        return act({ type: "pass" });
      case "noBlock":
        return act({ type: "noBlock" });
      case "mull": {
        const uids = [...ui.mull];
        ui.mull = /* @__PURE__ */ new Set();
        return act({ type: "mulligan", uids });
      }
      case "cancel":
        ui.sel = null;
        return render();
      case "mob-log":
        ui.showLog = !ui.showLog;
        return render();
      case "atk-shield":
        return act(ui.sel.options.find((a) => a.target.kind === "shield"));
      case "atk-player":
        return act(ui.sel.options.find((a) => a.target.kind === "player"));
      case "no-target":
        return act(ui.sel.options.find((a) => !a.target));
      case "acc-yes":
      case "acc-no": {
        const opts = ui.sel.options.filter((a) => !!a.accel === (id === "acc-yes"));
        if (opts.length === 1 && !opts[0].target) return act(opts[0]);
        const modeKeys = new Set(opts.map((a) => (a.modes || []).join(",")));
        ui.sel = { ...ui.sel, kind: modeKeys.size > 1 ? "mode" : "play", options: opts };
        return render();
      }
      case "pick-ok": {
        const uids = [...ui.pick?.sel || []];
        ui.pick = null;
        return act({ type: "pick", uids });
      }
      case "trig-skip":
        return act({ type: "shieldTrigger", use: false });
      case "trig-use": {
        const uses = legal.filter((a) => a.type === "shieldTrigger" && a.use);
        if (uses.length === 1 && !uses[0].target) return act(uses[0]);
        const modeKeys = new Set(uses.map((a) => (a.modes || []).join(",")));
        ui.sel = { kind: modeKeys.size > 1 ? "mode" : "trigger", after: "trigger", uid: s.pending.uid, options: uses };
        return render();
      }
      case "rematch":
        return startGame(G.app, G.decks[0], G.decks[1]);
      case "newgame":
        stopGame();
        location.hash = "#/play";
        return;
      case "menu":
        stopGame();
        location.hash = "#/";
        return;
    }
  }
  function showGrave(pi) {
    const p = G.s.players[pi];
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="modal-box"><h3>${p.idx === HUMAN ? "Your" : "AI's"} Graveyard (${p.graveyard.length})</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${p.graveyard.map((c) => cardHtml(getDef(c.id), { size: "md" })).join("") || '<p class="muted">Empty</p>'}</div>
    <div style="margin-top:12px"><button class="close">Close</button></div></div>`;
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest(".close")) m.remove();
    });
    document.body.appendChild(m);
  }
  function scheduleAI() {
    if (!G || G.timer || G.s.winner != null || whoActs(G.s) !== AI) return;
    const g = G;
    g.timer = setTimeout(() => {
      g.timer = null;
      if (G !== g) return;
      const a = chooseAction(g.s, AI);
      if (a) {
        try {
          step(g.s, a);
        } catch (e) {
          console.error(e);
          step(g.s, legalActions(g.s, AI).at(-1));
        }
      }
      render();
    }, g.s.pending?.kind === "mulligan" ? 250 : AI_DELAY);
  }

  // js/engine/booster.js
  var PACK_RULES = {
    commons: 6,
    uncommons: 5,
    rares: 3,
    epicChance: 1 / 4,
    godChance: 1 / 300,
    // per-slot odds inside a god pack
    god: { common: { uncommon: 0.55, rare: 0.3, epic: 0.15 }, uncommon: { rare: 0.6, epic: 0.4 }, rare: { rare: 0.5, epic: 0.5 } }
  };
  var playable = (c) => ["unit", "spell", "gear"].includes(c.type);
  function boosterSets() {
    const sets = [...new Set(allCards().filter((c) => playable(c) && !c.filler).map((c) => c.set))];
    const order = ["OGN", "DND"];
    const rank = (x) => order.indexOf(x) + 1 || 50;
    return sets.filter((s) => !["BAS", "TKN", "RUN"].includes(s)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  function setPools(set) {
    const cards = allCards().filter((c) => c.set === set && !c.filler && !(c.type === "legend" && c.placeholder));
    const collectible = (c) => playable(c) || ["legend", "champion", "signature"].includes(c.type);
    const of = (r) => cards.filter((c) => collectible(c) && rarityOf(c) === r);
    const fullArtRunes = allCards().filter((c) => c.type === "rune" && c.fullArtRune && String(c.setInfo || "").toUpperCase().startsWith(set));
    return {
      commons: of("common"),
      uncommons: of("uncommon"),
      rares: of("rare"),
      epics: [...of("epic"), ...fullArtRunes],
      legends: cards.filter((c) => c.type === "legend"),
      // part of the Rare pool, listed for the odds text
      runes: allCards().filter((c) => c.type === "rune" && !c.fullArtRune && String(c.setInfo || "").toUpperCase().startsWith(set))
    };
  }
  function openPack(set, rand2 = Math.random) {
    const P = setPools(set);
    const pick2 = (...pools) => {
      const pool = pools.find((p) => p && p.length) || [];
      return pool[Math.floor(rand2() * pool.length)];
    };
    const god = rand2() < PACK_RULES.godChance;
    const fallback = { common: [P.commons, P.uncommons], uncommon: [P.uncommons, P.commons], rare: [P.rares, P.uncommons, P.commons], epic: [P.epics, P.rares, P.uncommons] };
    const slot = (rar) => {
      const def = pick2(...fallback[rar]);
      return { def, slot: rar };
    };
    const upgraded = (odds) => {
      let r = rand2();
      for (const [rar, p] of Object.entries(odds)) if ((r -= p) < 0) return slot(rar);
      return slot(Object.keys(odds).pop());
    };
    const out = [];
    for (let i = 0; i < PACK_RULES.commons; i++) out.push(god ? upgraded(PACK_RULES.god.common) : slot("common"));
    for (let i = 0; i < PACK_RULES.uncommons; i++) out.push(god ? upgraded(PACK_RULES.god.uncommon) : slot("uncommon"));
    out.push({ def: pick2(P.runes, P.commons), slot: "rune" });
    for (let i = 0; i < PACK_RULES.rares - 1; i++) out.push(god ? upgraded(PACK_RULES.god.rare) : slot("rare"));
    out.push(god || rand2() < PACK_RULES.epicChance ? slot("epic") : slot("rare"));
    const res = out.filter((e) => e.def);
    if (god) {
      const rank = (e) => e.slot === "rune" ? -1 : ["common", "uncommon", "rare", "epic"].indexOf(rarityOf(e.def));
      res.sort((a, b) => rank(a) - rank(b));
      res.god = true;
    }
    return res;
  }

  // js/ui/boosters.js
  var SET_INFO = {
    OGN: { name: "OGN 2026-01", sub: "Origins", c1: "#d8433b", c2: "#3b82c8" },
    DND: { name: "DND", sub: "Dungeons & Dragons DLC", c1: "#8e4fc4", c2: "#4b9a4b" }
  };
  var LS_PULLS = "rajongoi.pulls.v1";
  var loadPulls = () => {
    try {
      return JSON.parse(localStorage.getItem(LS_PULLS)) || {};
    } catch {
      return {};
    }
  };
  var savePulls = (p) => {
    try {
      localStorage.setItem(LS_PULLS, JSON.stringify(p));
    } catch {
    }
  };
  var state = { set: null, pack: null, revealed: /* @__PURE__ */ new Set(), opened: 0, busy: false };
  var tier = (e) => rarityOf(e.def);
  function renderBoosters(app2) {
    const sets = boosterSets();
    if (!state.set || !sets.includes(state.set)) state.set = sets[0];
    state.pack = null;
    drawShop(app2, sets);
  }
  function packHtml(set, extra = "") {
    const s = SET_INFO[set] || { name: set, sub: "", c1: "#b07335", c2: "#3a2a1a" };
    return `<div class="booster ${extra}" style="--p1:${s.c1};--p2:${s.c2}">
    <div class="booster-top"><span>RAJONGOI TCG</span></div>
    <div class="booster-body">
      <div class="booster-logo">RAJONGOI<br>TCG</div>
      <div class="booster-set">${esc(s.name)}</div>
      <div class="booster-sub">${esc(s.sub)}</div>
      <div class="booster-count">15 cards</div>
    </div>
    <div class="booster-shine"></div>
  </div>`;
  }
  function drawShop(app2, sets) {
    const P = setPools(state.set);
    app2.innerHTML = `<div class="page booster-page">
    <h2>Booster packs</h2>
    <div class="tabs">${sets.map((s) => `<button class="${s === state.set ? "active" : ""}" data-set="${s}">${esc(SET_INFO[s]?.name || s)}</button>`).join("")}</div>
    <div class="booster-stage">
      <div class="booster-wrap" id="pack" title="Click to open">${packHtml(state.set, "idle")}</div>
      <p class="muted">Click the pack to tear it open.</p>
    </div>
    <div class="booster-odds muted">
      Each pack: ${PACK_RULES.commons} Commons \xB7 ${PACK_RULES.uncommons} Uncommons \xB7 1 Rune of the set \xB7 ${PACK_RULES.rares} Rares (Legends and Champions are Rares) \u2014 the last one is an Epic in ~1 of ${Math.round(1 / PACK_RULES.epicChance)} packs (Signatures, full-art cards, EPIC: The Musical).
      <br>\u2728 <b>God pack</b> in ~1 of ${Math.round(1 / PACK_RULES.godChance)} packs: no Commons and much better Rare / Epic odds in every slot.
      <br>Pool: ${P.commons.length} commons, ${P.uncommons.length} uncommons, ${P.rares.length} rares (incl. ${P.legends.length} legends), ${P.epics.length} epics.
      ${state.opened ? `<br>Packs opened this session: <b>${state.opened}</b>` : ""}
    </div>
  </div>`;
    app2.querySelectorAll("[data-set]").forEach((b) => b.onclick = () => {
      state.set = b.dataset.set;
      drawShop(app2, sets);
    });
    app2.querySelector("#pack").onclick = () => tearOpen(app2, sets);
  }
  function tearOpen(app2, sets) {
    if (state.busy) return;
    state.busy = true;
    const wrap = app2.querySelector("#pack");
    const pack = wrap.querySelector(".booster");
    pack.classList.remove("idle");
    pack.classList.add("shake");
    sfx.packShake();
    setTimeout(() => {
      pack.classList.remove("shake");
      pack.classList.add("torn");
      sfx.packTear();
      burst(wrap, ["#fff", "#ffd36b", SET_INFO[state.set]?.c1 || "#d8433b"], 26);
    }, 520);
    setTimeout(() => {
      state.pack = openPack(state.set);
      state.revealed = /* @__PURE__ */ new Set();
      state.opened++;
      const pulls = loadPulls();
      state.pack.forEach((e) => {
        e.isNew = !pulls[e.def.id];
        pulls[e.def.id] = (pulls[e.def.id] || 0) + 1;
      });
      savePulls(pulls);
      state.busy = false;
      drawReveal(app2, sets);
      state.pack.forEach((_, i) => setTimeout(() => sfx.deal(i), 120 + i * 55));
    }, 1250);
  }
  var swipeMode = () => matchMedia("(max-width: 760px)").matches;
  function drawReveal(app2, sets) {
    const swipe = swipeMode();
    const cards = state.pack.map((e, i) => {
      const t2 = tier(e);
      return `<div class="flip t-${t2}" data-i="${i}" style="--d:${i * 55}ms">
      <div class="flip-inner">
        <div class="flip-face flip-back"><div class="pack-back"><span>RAJONGOI<br>TCG</span></div></div>
        <div class="flip-face flip-front">${cardHtml(e.def, { size: "md" })}${e.isNew ? '<span class="new-badge">NEW</span>' : ""}</div>
      </div>
    </div>`;
    }).join("");
    app2.innerHTML = `<div class="page booster-page ${state.pack.god ? "god-pack" : ""}">
    ${state.pack.god ? '<div class="god-banner">\u2728 GOD PACK! \u2728</div>' : ""}
    <div class="row reveal-head"><h2 style="margin:0">${esc(SET_INFO[state.set]?.name || state.set)} booster</h2><span class="spacer"></span>
      <div class="reveal-actions">
        <button id="all" class="primary">Reveal all</button>
        <button id="again">Open another pack</button>
        <button id="back" class="ghost">Back to packs</button>
      </div></div>
    <p class="muted reveal-hint" style="margin-top:0">${swipe ? "Swipe the cards \u2014 each one flips when it reaches the front. The best card is saved for last." : "Click the cards to flip them. The best card is saved for last."}</p>
    <div class="reveal-grid ${swipe ? "swipe" : ""}">${cards}</div>
  </div>`;
    const flip = (el) => {
      const i = +el.dataset.i;
      if (state.revealed.has(i)) {
        showCardModal(getDef(state.pack[i].def.id));
        return;
      }
      state.revealed.add(i);
      el.classList.add("flipped");
      const t2 = tier(state.pack[i]);
      sfx.flip();
      if (t2 !== "common") setTimeout(() => sfx.reveal(t2), 200);
      if (["rare", "epic", "hit"].includes(t2)) {
        setTimeout(() => {
          burst(el, t2 === "hit" || t2 === "epic" ? ["#ff5fd2", "#6be3ff", "#ffe36b", "#8dff7a"] : ["#ffd36b", "#fff2b8", "#e6ad3c"], t2 === "rare" ? 18 : 34);
          if (t2 !== "rare") app2.querySelector(".booster-page").classList.add("quake");
          setTimeout(() => app2.querySelector(".booster-page")?.classList.remove("quake"), 450);
        }, 260);
      }
      if (state.revealed.size === state.pack.length) {
        app2.querySelector("#all").hidden = true;
        app2.querySelector("#again").classList.add("primary");
      }
    };
    app2.querySelectorAll(".flip").forEach((el) => el.onclick = () => flip(el));
    if (swipe) setupSwipe(app2.querySelector(".reveal-grid"), flip);
    app2.querySelector("#all").onclick = () => {
      const els = [...app2.querySelectorAll(".flip")].filter((el) => !state.revealed.has(+el.dataset.i));
      els.forEach((el, k) => setTimeout(() => flip(el), k * 140));
    };
    app2.querySelector("#again").onclick = () => {
      drawShop(app2, sets);
      setTimeout(() => app2.querySelector("#pack")?.click(), 50);
    };
    app2.querySelector("#back").onclick = () => drawShop(app2, sets);
  }
  function setupSwipe(row, flip) {
    const cards = [...row.querySelectorAll(".flip")];
    let ready = false, raf = 0;
    const update = () => {
      raf = 0;
      const r = row.getBoundingClientRect(), mid = r.left + r.width / 2;
      for (const el of cards) {
        const b = el.getBoundingClientRect();
        const d = Math.max(-1.5, Math.min(1.5, (b.left + b.width / 2 - mid) / b.width));
        el.style.transform = `perspective(900px) rotateY(${(-d * 28).toFixed(1)}deg) scale(${(1 - Math.min(Math.abs(d), 1) * 0.16).toFixed(3)})`;
        el.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
        if (ready && Math.abs(d) < 0.22 && !el.classList.contains("flipped")) flip(el);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    row.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    setTimeout(() => {
      ready = true;
      update();
    }, 900);
  }
  function burst(el, colors, n) {
    const r = el.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "burst";
    layer.style.left = r.left + r.width / 2 + "px";
    layer.style.top = r.top + r.height / 2 + "px";
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      const a = Math.PI * 2 * i / n + Math.random() * 0.4;
      const dist = 90 + Math.random() * 140;
      p.style.setProperty("--x", Math.cos(a) * dist + "px");
      p.style.setProperty("--y", Math.sin(a) * dist + "px");
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 80 + "ms";
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1100);
  }

  // js/ui/rules.js
  var R = RULES;
  var SECTIONS = [
    {
      icon: "\u{1F3C6}",
      hu: { t: "A j\xE1t\xE9k c\xE9lja", b: `<p>T\xF6rd \xE1t az ellenf\xE9l <b>${R.SHIELDS} Shieldj\xE9t</b>, majd t\xE1madd meg \u0151t k\xF6zvetlen\xFCl (<b>Direct Attack</b>). Ha ez siker\xFCl, nyert\xE9l.</p>
      <p>Akkor is vesz\xEDtesz, ha h\xFAznod kellene, de m\xE1r se paklid, se Shieldod nincs.</p>` },
      en: { t: "Goal of the game", b: `<p>Break all <b>${R.SHIELDS} of your opponent's Shields</b>, then hit them with a <b>Direct Attack</b>. If it lands, you win.</p>
      <p>You also lose if you have to draw but have no deck and no Shields left.</p>` }
    },
    {
      icon: "\u{1F0CF}",
      hu: { t: "A pakli", b: `<ul>
      <li><b>${R.DECK_SIZE} lap</b>, mindegyikb\u0151l csak <b>1</b> p\xE9ld\xE1ny.</li>
      <li><b>1 Legend</b>: a passz\xEDv k\xE9pess\xE9ge mindig \xE9l, \xE9s a 2 sz\xEDne hat\xE1rozza meg, milyen lapok mehetnek a pakliba.</li>
      <li><b>${R.MIN_CHAMPIONS}\u2013${R.MAX_CHAMPIONS} Champion</b>, ebb\u0151l legal\xE1bb egynek a neve egyezik a Legend\xE9vel. \u0150 kezd a Champion Slotban.</li>
      <li>Legfeljebb <b>${R.MAX_SIGNATURES} Signature</b> lap. Ezek k\xE9tsz\xEDn\u0171, er\u0151s lapok, \xE9s csak a saj\xE1t Legendj\xFCkkel haszn\xE1lhat\xF3k.</li>
      <li>K\xFCl\xF6n <b>Mana Deck</b>: ${R.RUNE_DECK_SIZE} Rune a Legend k\xE9t sz\xEDn\xE9ben.</li>
      <li>Aj\xE1nlott: \xE1tlagosan kb. 4-es mana k\xF6lts\xE9g, sok olcs\xF3 lap \xE9s n\xE9h\xE1ny dr\xE1ga finisher.</li></ul>` },
      en: { t: "The deck", b: `<ul>
      <li><b>${R.DECK_SIZE} cards</b>, only <b>1 copy</b> of each.</li>
      <li><b>1 Legend</b>: its passive is always on, and its 2 colors decide which cards your deck can use.</li>
      <li><b>${R.MIN_CHAMPIONS}\u2013${R.MAX_CHAMPIONS} Champions</b>, at least one named like your Legend. That one starts in the Champion Slot.</li>
      <li>Up to <b>${R.MAX_SIGNATURES} Signature</b> cards: strong two-color cards that only work with their own Legend.</li>
      <li>A separate <b>Mana Deck</b> of ${R.RUNE_DECK_SIZE} Runes in your Legend's two colors.</li>
      <li>Guideline: average cost around 4, lots of cheap cards and a few expensive finishers.</li></ul>` }
    },
    {
      icon: "\u{1F5FA}\uFE0F",
      hu: { t: "Z\xF3n\xE1k az asztalon", b: `<ul>
      <li><b>Battlefield</b>: itt \xE1llnak a Unitjaid, innen t\xE1madnak. Legfeljebb ${R.MAX_BATTLE} Unitod lehet itt.</li>
      <li><b>Shield Zone</b>: ${R.SHIELDS} leford\xEDtott lap, ezek v\xE9denek.</li>
      <li><b>Deck</b> \xE9s <b>Graveyard</b>: a Graveyardba ker\xFClnek az elpusztult Unitok \xE9s a lej\xE1tszott Spellek.</li>
      <li><b>Mana Zone</b> \xE9s <b>Mana Deck</b>: a Mana Deckb\u0151l h\xFAzott Rune-ok adj\xE1k a man\xE1t.</li>
      <li><b>Legend</b>, <b>Champion Slot</b>, <b>Signature Slot</b>: ezek a lapok az asztalon kezdenek, \xE9s innen kij\xE1tszhat\xF3k.</li>
      <li><b>Gear Slotok</b>: egyszerre legfeljebb ${R.GEAR_SLOTS} Gear lehet lent.</li>
      <li><b>K\xE9z</b>: legfeljebb ${R.MAX_HAND} lap. Ha tele van, az \xFAjonnan kapott lap (h\xFAz\xE1s, bet\xF6rt Shield\u2026) a Graveyardba ker\xFCl.</li></ul>` },
      en: { t: "Zones on the table", b: `<ul>
      <li><b>Battlefield</b>: your Units stand here and attack from here. At most ${R.MAX_BATTLE} Units.</li>
      <li><b>Shield Zone</b>: ${R.SHIELDS} face-down cards that protect you.</li>
      <li><b>Deck</b> and <b>Graveyard</b>: destroyed Units and resolved Spells go to the Graveyard.</li>
      <li><b>Mana Zone</b> and <b>Mana Deck</b>: Runes from the Mana Deck give you mana.</li>
      <li><b>Legend</b>, <b>Champion Slot</b>, <b>Signature Slot</b>: these start on the table and can be played from there.</li>
      <li><b>Gear Slots</b>: at most ${R.GEAR_SLOTS} Gear at a time.</li>
      <li><b>Hand</b>: at most ${R.MAX_HAND} cards. With a full hand, a new card (a draw, a broken Shield\u2026) goes to the Graveyard.</li></ul>` }
    },
    {
      icon: "\u{1F3B2}",
      hu: { t: "Kezd\xE9s", b: `<ol>
      <li>Keverd meg a paklit, \xE9s a fels\u0151 ${R.SHIELDS} lapot tedd le leford\xEDtva: ezek a Shieldjeid.</li>
      <li>H\xFAzz ${R.OPENING_HAND} lapot. Legfeljebb ${R.MULLIGAN_MAX}-t visszatehetsz a pakli alj\xE1ra, \xE9s ugyanannyit \xFAjrah\xFAzol (mulligan).</li>
      <li>P\xE9nzfeldob\xE1ssal d\u0151l el, ki kezd.</li></ol>` },
      en: { t: "Setup", b: `<ol>
      <li>Shuffle and put the top ${R.SHIELDS} cards face down: these are your Shields.</li>
      <li>Draw ${R.OPENING_HAND}. You may put up to ${R.MULLIGAN_MAX} on the bottom of your deck and draw that many again (mulligan).</li>
      <li>A coin flip decides who goes first.</li></ol>` }
    },
    {
      icon: "\u{1F504}",
      hu: { t: "Egy k\xF6r menete", b: `<ol>
      <li><b>Kezd\xE9s</b>: minden lapod fel\xE1ll (untap), \xE9s lefutnak a k\xF6r eleji hat\xE1sok.</li>
      <li><b>H\xFAz\xE1s</b>: h\xFAzol 1 lapot. Ha \xFCres a pakli, egy Shieldot veszel k\xE9zbe helyette.</li>
      <li><b>Mana</b>: ${R.CHANNEL_PER_TURN} Rune-t teszel a Mana Deckb\u0151l a Mana Zone-ba (a m\xE1sodik j\xE1t\xE9kos az els\u0151 k\xF6r\xE9ben ${R.CHANNEL_SECOND_PLAYER_FIRST_TURN}-at).</li>
      <li><b>Kij\xE1tsz\xE1s</b>: Unitokat, Spelleket \xE9s Geart j\xE1tszol ki. Annyi Rune-t ford\xEDtasz le, amennyi a k\xF6lts\xE9g, \xE9s <b>legal\xE1bb 1-nek egyeznie kell a lap sz\xEDn\xE9vel</b>.</li>
      <li><b>Harc</b>: egyes\xE9vel t\xE1madsz (l\xE1sd lent).</li>
      <li><b>V\xE9ge</b>: lej\xE1rnak az \u201Eebben a k\xF6rben\u201D hat\xE1sok.</li></ol>
      <p><b>Recycle N</b>: plusz k\xF6lts\xE9g. N darab, a lap sz\xEDn\xE9vel egyez\u0151 Rune-t visszateszel a Mana Deck alj\xE1ra.</p>` },
      en: { t: "Turn order", b: `<ol>
      <li><b>Start</b>: untap everything and resolve start-of-turn effects.</li>
      <li><b>Draw</b> 1 card. If your deck is empty, take a Shield into your hand instead.</li>
      <li><b>Mana</b>: channel ${R.CHANNEL_PER_TURN} Runes from the Mana Deck (the second player channels ${R.CHANNEL_SECOND_PLAYER_FIRST_TURN} on their first turn).</li>
      <li><b>Play</b> Units, Spells and Gear. Tap Runes equal to the cost; <b>at least 1 must match the card's color</b>.</li>
      <li><b>Combat</b>: attack one at a time (see below).</li>
      <li><b>End</b>: "this turn" effects expire.</li></ol>
      <p><b>Recycle N</b> is an extra cost: put N Runes of the card's color on the bottom of the Mana Deck.</p>` }
    },
    {
      icon: "\u2694\uFE0F",
      hu: { t: "Harc", b: `<p>Egy \xE1ll\xF3 (untapped) Unittal t\xE1madsz, \xE9s ez leford\xEDtja. A kij\xE1tsz\xE1s k\xF6r\xE9ben egy Unit m\xE9g nem t\xE1madhat, kiv\xE9ve ha <b>Haste</b> vagy akt\xEDv <b>Nostalgia Line</b> van rajta. H\xE1rom c\xE9lpont k\xF6z\xFCl v\xE1laszthatsz:</p>
      <ul>
      <li><b>Shield</b>: 1 Shield bet\xF6rik, \xE9s a tulajdonosa k\xE9zbe veszi. Ha az <b>Shield Trigger</b>, azonnal ingyen kij\xE1tszhatja.</li>
      <li><b>Direct Attack</b>: csak ha az ellenf\xE9lnek m\xE1r nincs Shieldje. Ha betal\xE1l, nyert\xE9l.</li>
      <li><b>Leford\xEDtott (tapped) ellens\xE9ges Unit</b>: a nagyobb <b>Might</b> nyer, a vesztes elpusztul. D\xF6ntetlenn\xE9l mindkett\u0151.</li></ul>
      <p>A v\xE9dekez\u0151 egy \xE1ll\xF3 <b>Defensive</b> Unitra ir\xE1ny\xEDthatja \xE1t a t\xE1mad\xE1st. Ezut\xE1n mindketten j\xE1tszhattok <b>Action</b> \xE9s <b>Reaction</b> spelleket. Ezek egy veremre (stack) ker\xFClnek, \xE9s ford\xEDtott sorrendben old\xF3dnak fel (az utols\xF3 els\u0151k\xE9nt). A Reaction ak\xE1r egy m\xE1sik spellre v\xE1laszul is mehet.</p>` },
      en: { t: "Combat", b: `<p>Attack with an untapped Unit (it taps). Units can't attack the turn they're played unless they have <b>Haste</b> or an active <b>Nostalgia Line</b>. Pick a target:</p>
      <ul>
      <li><b>Shield</b>: break 1 Shield; its owner takes it into their hand. If it's a <b>Shield Trigger</b>, they may play it for free right away.</li>
      <li><b>Direct Attack</b>: only when the opponent has no Shields. If it lands, you win.</li>
      <li><b>A tapped enemy Unit</b>: higher <b>Might</b> wins and the loser is destroyed. On a tie, both are.</li></ul>
      <p>The defender may redirect the attack to an untapped <b>Defensive</b> Unit. Then both players may cast <b>Action</b> and <b>Reaction</b> spells onto a stack, which resolves last-in, first-out. A Reaction can even answer another spell.</p>` }
    },
    {
      icon: "\u{1F4DC}",
      hu: { t: "Lap t\xEDpusok", b: `<ul>
      <li><b>Legend</b>: passz\xEDv k\xE9pess\xE9g, v\xE9gig az asztalon marad.</li>
      <li><b>Unit</b>: harcol\xF3 l\xE9ny a Battlefielden, a sz\xE1ma a Might (er\u0151).</li>
      <li><b>Champion</b>: k\xFCl\xF6nleges Unit, egyik\xFCk a Champion Slotb\xF3l indul.</li>
      <li><b>Signature</b>: k\xE9tsz\xEDn\u0171, er\u0151s lap, egy adott Legendhez tartozik.</li>
      <li><b>Spell</b>: egyszeri hat\xE1s, ut\xE1na a Graveyardba ker\xFCl.</li>
      <li><b>Gear</b>: tart\xF3s lap a Gear Slotban, gyakran tap-pel aktiv\xE1lhat\xF3. Ha mindk\xE9t slot foglalt, az \xFAj Gear egy \xE1ltalad v\xE1lasztott r\xE9gi hely\xE9re ker\xFCl. A <i>Saga</i> Gear n\xE9h\xE1ny haszn\xE1lat ut\xE1n lej\xE1r.</li>
      <li><b>Token</b>: lapok \xE1ltal l\xE9trehozott Unit (pl. Miniature).</li>
      <li><b>Rune</b>: mana a Mana Deckb\u0151l.</li></ul>
      <p>A 0 vagy kevesebb Might-\xFA Unit elpusztul.</p>` },
      en: { t: "Card types", b: `<ul>
      <li><b>Legend</b>: a passive ability that stays on the table all game.</li>
      <li><b>Unit</b>: a fighter on the Battlefield; its number is its Might.</li>
      <li><b>Champion</b>: a special Unit; one starts in the Champion Slot.</li>
      <li><b>Signature</b>: a strong two-color card tied to one Legend.</li>
      <li><b>Spell</b>: a one-time effect, then it goes to the Graveyard.</li>
      <li><b>Gear</b>: a lasting card in a Gear Slot, often used by tapping. With both slots full, a new Gear replaces one of your choice. <i>Saga</i> Gear expires after a few uses.</li>
      <li><b>Token</b>: a Unit created by other cards (e.g. Miniature).</li>
      <li><b>Rune</b>: mana from the Mana Deck.</li></ul>
      <p>A Unit with 0 or less Might is destroyed.</p>` }
    }
  ];
  var KW = [
    ["Shield Trigger", "Ha Shieldb\xF3l ker\xFCl a kezedbe, azonnal ingyen kij\xE1tszhatod.", "If you get it from your Shield Zone, you may play it for free right away."],
    ["Shieldify N", "Kij\xE1tsz\xE1skor N lapot teszel a kezedb\u0151l a Shield Zone-ba.", "When played, put N cards from your hand into your Shield Zone."],
    ["Defensive", "Ha egy ellens\xE9ges Unit t\xE1mad, ezt leford\xEDtva magadra ir\xE1ny\xEDthatod a t\xE1mad\xE1st. Am\xEDg a Unit Indestructible, a Defensive nem \xE9l.", "When an enemy Unit attacks, tap this to redirect the attack to it. Inactive while the Unit is Indestructible."],
    ["Deathtouch", "Ha harcban elpusztul, azt a Unitot is elpuszt\xEDtja, amelyik meg\xF6lte.", "If it loses a fight, it also destroys the Unit that killed it."],
    ["Haste", "M\xE1r a kij\xE1tsz\xE1s k\xF6r\xE9ben t\xE1madhat.", "Can attack the turn it is played."],
    ["Nostalgia Line", "Este 16:00 \xE9s 22:00 k\xF6z\xF6tt a kij\xE1tsz\xE1s k\xF6r\xE9ben is t\xE1madhat (a val\xF3s id\u0151 sz\xE1m\xEDt).", "Between 16:00 and 22:00 (real local time) it can attack the turn it is played."],
    ["Breaker", "1 helyett 2 Shieldot t\xF6r.", "Breaks 2 Shields instead of 1."],
    ["Party Breaker", "\xC1ll\xF3 (untapped) Unitokat is megt\xE1madhat.", "Can attack untapped Units."],
    ["Indestructible", "Nem lehet elpuszt\xEDtani.", "Can't be destroyed."],
    ["Unstoppable", "A t\xE1mad\xE1s\xE1t nem lehet \xE1tir\xE1ny\xEDtani.", "Its attacks can't be redirected."],
    ["Vigilance", "A k\xF6r\xF6d v\xE9g\xE9n \xFAjra fel\xE1ll\xEDthatod (untap).", "You may untap it at the end of your turn."],
    ["Slow Start", "Leford\xEDtva (tapped) \xE9rkezik.", "Enters tapped."],
    ["Furious", "Minden k\xF6rben t\xE1madnia kell.", "Must attack every turn."],
    ["Accelerate", "Plusz k\xF6lts\xE9g\xE9rt \xE1llva \xE9rkezik, \xEDgy azonnal t\xE1madhat.", "Pay extra so it enters ready and can attack right away."],
    ["Action", "Harc k\xF6zben is kij\xE1tszhat\xF3, ha a stack \xFCres.", "Can also be played in combat while the stack is empty."],
    ["Reaction", "B\xE1rmikor kij\xE1tszhat\xF3, ak\xE1r egy m\xE1sik spellre v\xE1laszul is.", "Can be played any time, even in response to another spell."]
  ];
  function renderRules(app2) {
    const l = getLang();
    const h = (o) => o[l];
    app2.innerHTML = `<div class="page rules-page">
    <div class="row rules-head"><h2 style="margin:0">${l === "hu" ? "Szab\xE1lyok" : "Rules"}</h2><span class="spacer"></span>${langToggleHtml()}</div>
    <p class="muted rules-intro">${l === "hu" ? "A Rajongoi TCG a Duel Masters egyszer\u0171 alapjaira \xE9p\xFCl (Shieldek, Shield Trigger, Direct Attack), n\xE9h\xE1ny Riftbound-elemmel: Legend, Champion, Signature, Gear \xE9s Rune alap\xFA mana." : "Rajongoi TCG builds on the simple core of Duel Masters (Shields, Shield Trigger, Direct Attack) with a few Riftbound ideas: Legend, Champion, Signature, Gear and Rune-based mana."}</p>
    <div class="rules-grid">
      ${SECTIONS.map((s) => `<section class="rule-card"><h3><span class="rule-ico">${s.icon}</span>${h(s).t}</h3>${h(s).b}</section>`).join("")}
      <section class="rule-card rule-kw"><h3><span class="rule-ico">\u{1F511}</span>${l === "hu" ? "Kulcsszavak" : "Keywords"}</h3>
        <dl>${KW.map(([k, hu, en]) => `<div><dt>${k}</dt><dd>${l === "hu" ? hu : en}</dd></div>`).join("")}</dl></section>
    </div>
  </div>`;
    bindLangToggle(app2, () => renderRules(app2));
  }

  // js/ui/editor.js
  var CARD_ASPECT = 5 / 7;
  var SETS = ["OGN", "DND", "TKN"];
  var TYPES = [["unit", "Unit"], ["champion", "Champion Unit"], ["spell", "Spell"], ["gear", "Gear"], ["signature", "Signature"], ["legend", "Legend"], ["token", "Token Unit"]];
  var RARITIES = ["common", "uncommon", "rare", "epic"];
  var KW_LIST = Object.keys(KEYWORDS).filter((k) => k !== "Shieldify");
  var TRIGGERS = [
    ["play", "When played"],
    ["attack", "When this attacks"],
    ["destroyed", "When this is destroyed"],
    ["turnStart", "At the start of your turn"],
    ["unitPlayed", "Whenever you play a Unit"],
    ["spellCast", "Whenever you cast a Spell"],
    ["activate", "[T] Tap ability"],
    ["static", "Always (static)"]
  ];
  var TARGETS = [
    ["enemyUnit", "target enemy Unit"],
    ["friendlyUnit", "target friendly Unit"],
    ["anyUnit", "target Unit"],
    ["enemyTappedUnit", "target tapped enemy Unit"],
    ["enemyGear", "target enemy Gear"],
    ["allEnemyUnits", "all enemy Units"],
    ["allFriendlyUnits", "all your Units"],
    ["allUnits", "all Units"],
    ["self", "this Unit"]
  ];
  var ACTIONS = {
    draw: { label: "Draw cards", p: ["amount", "who"] },
    destroy: { label: "Destroy", p: ["target", "maxPower"] },
    buff: { label: "+/- Might", p: ["target", "amount", "duration"] },
    grantKeyword: { label: "Give a keyword", p: ["target", "keyword", "duration"] },
    tap: { label: "Tap", p: ["target", "maxPower"] },
    untap: { label: "Ready (untap)", p: ["target"] },
    bounce: { label: "Return to hand", p: ["target", "maxPower"] },
    copyUnit: { label: "Copy a Unit (Haste, dies at end of turn)", p: ["target", "maxPower"] },
    token: { label: "Create a token", p: ["tokenId", "amount"] },
    breakShield: { label: "Break opponent's Shields", p: ["amount"] },
    addShield: { label: "Add Shields from your deck", p: ["amount"] },
    channel: { label: "Channel extra runes", p: ["amount"] },
    discard: { label: "Opponent discards (random)", p: ["amount"] },
    recover: { label: "Unit from Graveyard to hand", p: [] },
    cantLose: { label: "You can't lose this turn", p: [] }
  };
  var DRAFT_LS = "rajongoi.editorDraft.v1";
  var slug = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  var pad3 = (n) => String(n).padStart(3, "0");
  function nextNumber(set) {
    const nums = allCards().filter((c) => c.set === set && /^\d+$/.test(String(c.number))).map((c) => +c.number);
    return pad3((nums.length ? Math.max(...nums) : 0) + 1);
  }
  function blankState() {
    return {
      editing: null,
      set: "OGN",
      number: nextNumber("OGN"),
      name: "",
      subname: "",
      type: "unit",
      sigType: "spell",
      legend: "",
      colors: ["Fury"],
      cost: 2,
      power: 2,
      recycle: 0,
      rarity: "common",
      tribes: "",
      keywords: [],
      shieldify: 0,
      uses: 0,
      activateCost: 0,
      autoText: true,
      text: "",
      flavor: "",
      illustrator: "",
      image: null,
      iw: 0,
      ih: 0,
      zoom: 1,
      cx: 50,
      cy: 50,
      effects: []
    };
  }
  function stateFromDef(d) {
    const st2 = blankState();
    Object.assign(st2, {
      editing: d.id,
      set: d.set || "OGN",
      number: String(d.number || ""),
      name: d.name || "",
      subname: d.subname || "",
      type: d.type,
      sigType: d.sigType || "spell",
      legend: d.legend || "",
      colors: [...d.colors || []],
      cost: d.cost || 0,
      power: d.power || 0,
      recycle: d.recycle || 0,
      rarity: ["epic", "legendary", "showcase"].includes(d.rarity) ? "epic" : d.rarity || "common",
      tribes: (d.tribes || []).join(", "),
      keywords: (d.keywords || []).filter((k) => k !== "Shieldify"),
      shieldify: (d.effects || []).find((e) => e.do === "shieldify")?.amount || 0,
      uses: d.uses || 0,
      activateCost: d.activateCost || 0,
      effects: (d.effects || []).filter((e) => e.do !== "shieldify").map((e) => ({ ...e })),
      flavor: d.flavor || "",
      illustrator: d.illustrator || "",
      image: d.image || null
    });
    const generated = normalize({ ...d, text: "" }).text;
    st2.autoText = !d.text || d.text === generated;
    st2.text = st2.autoText ? "" : d.text;
    if (d.imageCrop?.width) {
      st2.cropFromDef = d.imageCrop;
    }
    return st2;
  }
  function cropOf(st2) {
    if (!st2.iw || !st2.ih) return { x: 0, y: 0, width: 100, height: 100 };
    const r = st2.iw / st2.ih;
    let w, h;
    if (r > CARD_ASPECT) {
      h = 100 / st2.zoom;
      w = h * CARD_ASPECT / r;
    } else {
      w = 100 / st2.zoom;
      h = w * r / CARD_ASPECT;
    }
    return { x: st2.cx - w / 2, y: st2.cy - h / 2, width: w, height: h };
  }
  function zoomFromCrop(st2, c) {
    const r = st2.iw / st2.ih;
    st2.zoom = r > CARD_ASPECT ? 100 / c.height : 100 / c.width;
    const k = cropOf({ ...st2, cx: 0, cy: 0 });
    st2.cx = c.x + k.width / 2;
    st2.cy = c.y + k.height / 2;
  }
  function imgStyle(c) {
    return {
      width: `${(1e4 / c.width).toFixed(2)}%`,
      height: `${(1e4 / c.height).toFixed(2)}%`,
      left: `${(-c.x / c.width * 100).toFixed(2)}%`,
      top: `${(-c.y / c.height * 100).toFixed(2)}%`
    };
  }
  function cardId(st2) {
    if (st2.type === "legend") return `${st2.set}-L-${slug(st2.subname || st2.name) || "new"}`;
    return `${st2.type === "token" ? "TKN" : st2.set}-${pad3(st2.number || "0")}`;
  }
  function buildDef(st2) {
    const id = cardId(st2);
    const set = st2.type === "token" ? "TKN" : st2.set;
    const effects = st2.effects.map((e) => {
      const o = { ...e };
      if (o.do === "token") o.tokenName = hasDef(o.tokenId) ? getDef(o.tokenId).name : "token";
      for (const k of Object.keys(o)) if (o[k] === "" || o[k] == null) delete o[k];
      return o;
    });
    if (st2.shieldify > 0) effects.unshift({ on: "play", do: "shieldify", amount: +st2.shieldify });
    const keywords = [...st2.keywords, ...st2.shieldify > 0 ? ["Shieldify"] : []];
    const def = {
      id,
      set,
      number: st2.type === "legend" ? id.split("-").slice(1).join("-") : pad3(st2.number || "0"),
      name: st2.name.trim() || "Untitled card",
      type: st2.type,
      colors: [...st2.colors],
      cost: +st2.cost || 0,
      power: +st2.power || 0,
      recycle: +st2.recycle || 0,
      rarity: st2.rarity,
      keywords,
      effects,
      tribes: st2.tribes.split(",").map((t2) => t2.trim()).filter(Boolean),
      text: st2.autoText ? "" : st2.text,
      flavor: st2.flavor,
      illustrator: st2.illustrator,
      setInfo: st2.type === "legend" ? `${set} Legend` : `${set} ${pad3(st2.number || "0")}/300`,
      source: "editor",
      custom: true
    };
    if (st2.subname.trim()) def.subname = st2.subname.trim();
    if (st2.type === "signature") {
      def.sigType = st2.sigType;
      if (st2.legend) def.legend = st2.legend;
    }
    if (st2.type === "legend") {
      def.owners = [st2.subname.trim() || st2.name.trim()];
      def.rarity = "rare";
    }
    if (st2.type === "token") def.token = true;
    if (+st2.uses > 0) def.uses = +st2.uses;
    if (effects.some((e) => e.on === "activate") && +st2.activateCost > 0) def.activateCost = +st2.activateCost;
    if (st2.image) {
      def.image = st2.image;
      def.imageCrop = cropOf(st2);
    }
    if (st2.rarity === "epic" && !["legend", "rune"].includes(st2.type)) def.fullArt = true;
    return def;
  }
  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  }
  async function fileToDataUrl(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImage(url);
      const k = Math.min(1, 1e3 / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(im.naturalWidth * k);
      cv.height = Math.round(im.naturalHeight * k);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      return { src: cv.toDataURL("image/jpeg", 0.86), iw: cv.width, ih: cv.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  var RC_TYPES = { 1: "legend", 2: "champion", 3: "unit", 4: "spell", 5: "gear", 6: "rune", 7: "token" };
  var RC_COLORS = { 1: "Fury", 2: "Calm", 3: "Mind", 4: "Body", 5: "Chaos", 6: "Order" };
  var RC_RARITY = { 1: "common", 2: "common", 3: "common", 4: "uncommon", 5: "rare", 6: "epic", 7: "epic" };
  var dec = (v, m) => v != null && /^\d+$/.test(String(v)) ? m[+v] : v;
  async function stateFromRiftcardmaker(j) {
    const st2 = blankState();
    const info = String(j.setInfo || "").trim().match(/^([A-Za-z]+)[\s-]*(\d+)/);
    let set = info ? info[1].toUpperCase() : "OGN";
    if (set === "TOKEN") set = "TKN";
    let type = String(dec(j.type, RC_TYPES) || "unit").toLowerCase();
    if (type.includes("champion")) type = "champion";
    if (set === "TKN") type = "token";
    if (type === "rune") throw new Error("Runes are not supported in the editor.");
    const colors = [dec(j.color, RC_COLORS), dec(j.secondColor, RC_COLORS)].map((c) => String(c || "").trim()).filter((c) => c && c.toLowerCase() !== "neutral").map((c) => c[0].toUpperCase() + c.slice(1).toLowerCase()).filter((c) => COLORS[c]);
    const kws = [];
    let shieldify = 0;
    for (const m of String(j.description || "").matchAll(/\{([^#}]+)#[^}]*\}/g)) {
      const raw = m[1].trim(), num2 = raw.match(/^(.*?)\s+(\d+)$/);
      if (raw === "Double Breaker") kws.push("Breaker");
      else if (num2 && num2[1] === "Shieldify") shieldify = +num2[2];
      else if (KEYWORDS[raw]) kws.push(raw);
    }
    Object.assign(st2, {
      set: SETS.includes(set) ? set : "OGN",
      number: info ? pad3(info[2]) : st2.number,
      type,
      colors: colors.length ? colors : ["Fury"],
      name: (j.name || "").trim(),
      subname: (j.subname || "").trim(),
      cost: j.energy ?? 0,
      power: j.might ?? 0,
      recycle: j.power > 0 ? j.power : 0,
      rarity: dec(j.rarity, RC_RARITY) || "common",
      tribes: (j.tribes || j.tags || []).map((t2) => t2.text || t2).filter(Boolean).join(", "),
      keywords: [...new Set(kws)],
      shieldify,
      text: j.description || "",
      autoText: !j.description,
      flavor: j.flavorText || "",
      illustrator: j.illustrator || ""
    });
    const layers = (j.images || []).filter((im) => /^data:image\//.test(im.src || "")).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (layers.length === 1) {
      const im = await loadImage(layers[0].src);
      Object.assign(st2, { image: layers[0].src, iw: im.naturalWidth, ih: im.naturalHeight });
      if (layers[0].croppedArea) zoomFromCrop(st2, layers[0].croppedArea);
    } else if (layers.length > 1) {
      const W = 900, H = Math.round(W / CARD_ASPECT);
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const g = cv.getContext("2d");
      g.fillStyle = "#000";
      g.fillRect(0, 0, W, H);
      for (const L2 of layers) {
        const im = await loadImage(L2.src);
        const c = L2.croppedArea || { x: 0, y: 0, width: 100, height: 100 };
        const sx = W / (im.naturalWidth * c.width / 100), sy = H / (im.naturalHeight * c.height / 100);
        g.globalAlpha = L2.opacity ?? 1;
        g.drawImage(im, -c.x / 100 * im.naturalWidth * sx, -c.y / 100 * im.naturalHeight * sy, im.naturalWidth * sx, im.naturalHeight * sy);
      }
      Object.assign(st2, { image: cv.toDataURL("image/jpeg", 0.86), iw: W, ih: H, zoom: 1, cx: 50, cy: 50 });
    }
    return st2;
  }
  var st = null;
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_LS, JSON.stringify(st));
    } catch {
    }
  }
  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_LS));
    } catch {
      return null;
    }
  }
  function download(name, obj) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
  }
  var bundle = (cards) => ({ format: "rajongoi-cards", version: 1, exported: (/* @__PURE__ */ new Date()).toISOString(), cards });
  function flash(app2, msg, bad = false) {
    const el = app2.querySelector("#ed-msg");
    if (!el) return;
    el.textContent = msg;
    el.className = "ed-msg " + (bad ? "bad" : "good");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => el.textContent = "", 5e3);
  }
  var opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
  var num = (k, label, min = 0, max = 20) => `<label class="ed-f"><span>${label}</span><input type="number" data-k="${k}" min="${min}" max="${max}" value="${esc(st[k])}"></label>`;
  function effectRow(e, i) {
    if (!ACTIONS[e.do]) {
      let txt = "";
      try {
        txt = describeEffect(e, buildDef(st)) || e.do;
      } catch {
        txt = e.do;
      }
      return `<div class="ed-eff ed-eff-special"><div class="ed-eff-row"><span class="ed-special">Special</span>
      <span>${esc((TRIGGERS.find((t2) => t2[0] === (e.on || "play")) || [, e.on])[1])}: <code>${esc(e.do)}</code></span>
      <button class="ghost ed-x" data-del-eff="${i}" title="Remove">\u2715</button></div>
      <div class="ed-eff-text muted">${markup(txt)} <i>(existing game logic \u2014 kept as it is)</i></div></div>`;
    }
    const a = ACTIONS[e.do];
    const tokens = allCards().filter((c) => c.type === "token" || c.token);
    const params = a.p.map((p) => {
      if (p === "target") return `<select data-e="${i}" data-ek="target">${TARGETS.map(([v, l]) => opt(v, l, e.target)).join("")}</select>`;
      if (p === "amount") return `<label class="ed-inline">\xD7<input type="number" data-e="${i}" data-ek="amount" value="${esc(e.amount ?? 1)}" min="-10" max="10"></label>`;
      if (p === "maxPower") return `<label class="ed-inline">max Might<input type="number" data-e="${i}" data-ek="maxPower" value="${esc(e.maxPower ?? "")}" min="0" max="20" placeholder="any"></label>`;
      if (p === "duration") return `<select data-e="${i}" data-ek="duration">${opt("turn", "this turn", e.duration || "turn")}${opt("permanent", "permanently", e.duration)}</select>`;
      if (p === "keyword") return `<select data-e="${i}" data-ek="keyword">${KW_LIST.map((k) => opt(k, k, e.keyword)).join("")}</select>`;
      if (p === "who") return `<select data-e="${i}" data-ek="who">${opt("", "you", e.who || "")}${opt("opponent", "your opponent", e.who)}</select>`;
      if (p === "tokenId") return `<select data-e="${i}" data-ek="tokenId">${tokens.map((t2) => opt(t2.id, `${t2.name} (${t2.power} Might)`, e.tokenId)).join("")}</select>`;
      return "";
    }).join("");
    let preview = "";
    try {
      preview = describeEffect(e, buildDef(st));
    } catch {
    }
    return `<div class="ed-eff">
    <div class="ed-eff-row">
      <select data-e="${i}" data-ek="on">${TRIGGERS.map(([v, l]) => opt(v, l, e.on || "play")).join("")}</select>
      <select data-e="${i}" data-ek="do">${Object.entries(ACTIONS).map(([v, x]) => opt(v, x.label, e.do)).join("")}</select>
      ${params}
      <button class="ghost ed-x" data-del-eff="${i}" title="Remove">\u2715</button>
    </div>
    <div class="ed-eff-text muted">${markup(preview)}</div></div>`;
  }
  function formHtml() {
    const legends = allCards().filter((c) => c.type === "legend").sort((a, b) => a.name.localeCompare(b.name));
    const unit = ["unit", "champion", "token"].includes(st.type) || st.type === "signature" && st.sigType === "unit";
    const hasActivate = st.effects.some((e) => e.on === "activate");
    const def = buildDef(st);
    const exists = hasDef(def.id) && !isCustomCard(def.id) && st.editing !== def.id;
    const decks = customDecks();
    return `
  <section class="ed-sec"><h3>Basics</h3>
    <div class="ed-grid">
      <label class="ed-f ed-wide"><span>Name</span><input data-k="name" value="${esc(st.name)}" placeholder="Card name" maxlength="60"></label>
      <label class="ed-f"><span>Subname / owner</span><input data-k="subname" value="${esc(st.subname)}" placeholder="e.g. Lui"></label>
      <label class="ed-f"><span>Type</span><select data-k="type">${TYPES.map(([v, l]) => opt(v, l, st.type)).join("")}</select></label>
      ${st.type === "signature" ? `<label class="ed-f"><span>Signature kind</span><select data-k="sigType">${opt("spell", "Spell", st.sigType)}${opt("unit", "Unit", st.sigType)}${opt("gear", "Gear", st.sigType)}</select></label>
        <label class="ed-f"><span>Belongs to Legend</span><select data-k="legend">${opt("", "\u2014 choose \u2014", st.legend)}${legends.map((l) => opt(l.id, `${l.name}${l.owners?.[0] ? " (" + l.owners[0] + ")" : ""}`, st.legend)).join("")}</select></label>` : ""}
      ${st.type !== "token" ? `<label class="ed-f"><span>Set</span><select data-k="set">${SETS.filter((x) => x !== "TKN").map((x) => opt(x, x, st.set)).join("")}</select></label>` : ""}
      ${st.type !== "legend" ? `<label class="ed-f"><span>Number</span><input data-k="number" value="${esc(st.number)}" inputmode="numeric" maxlength="3"></label>` : ""}
      <label class="ed-f"><span>Rarity</span><select data-k="rarity">${RARITIES.map((r) => opt(r, r[0].toUpperCase() + r.slice(1), st.rarity)).join("")}</select></label>
    </div>
    <div class="ed-id">Card id: <code>${esc(def.id)}</code>${exists ? ` <span class="warn">\u26A0 replaces the existing card \u201C${esc(getDef(def.id).name)}\u201D in this browser</span>` : ""}
      ${st.type === "champion" ? '<div class="muted">A Champion belongs to a Legend through its name or subname (e.g. subname \u201CLui\u201D).</div>' : ""}</div>
  </section>

  <section class="ed-sec"><h3>Colors &amp; stats</h3>
    <div class="ed-colors">${Object.keys(COLORS).map((c) => `<button type="button" class="ed-color ${st.colors.includes(c) ? "on" : ""}" data-color="${c}" style="--c:${COLORS[c].hex}">${c}</button>`).join("")}
      <span class="muted">max. 2</span></div>
    <div class="ed-grid">
      ${st.type !== "legend" && st.type !== "token" ? num("cost", "Mana cost", 0, 15) : ""}
      ${unit ? num("power", "Might", 0, 20) : ""}
      ${st.type !== "legend" && st.type !== "token" ? num("recycle", "Recycle", 0, 6) : ""}
      <label class="ed-f ed-wide"><span>Tags (comma separated)</span><input data-k="tribes" value="${esc(st.tribes)}" placeholder="e.g. Art, Movie"></label>
    </div>
  </section>

  <section class="ed-sec"><h3>Artwork</h3>
    <div class="ed-art">
      <label class="ed-drop" id="ed-drop"><input type="file" id="ed-file" accept="image/*" hidden>
        <b>${st.image ? "Change picture" : "Upload picture"}</b><span class="muted">click or drop an image here</span></label>
      ${st.image ? `<label class="ed-f ed-wide"><span>Zoom</span><input type="range" id="ed-zoom" min="0.4" max="4" step="0.01" value="${st.zoom}"></label>
        <div class="row"><button type="button" class="ghost" id="ed-center">Center</button><button type="button" class="ghost" id="ed-noimg">Remove picture</button>
        <span class="muted">Drag the picture on the preview to move it, scroll to zoom.</span></div>` : ""}
    </div>
  </section>

  <section class="ed-sec"><h3>Keywords</h3>
    <div class="ed-kws">${KW_LIST.map((k) => `<button type="button" class="ed-kw ${st.keywords.includes(k) ? "on" : ""}" data-kw="${esc(k)}" style="--c:${KEYWORDS[k].hex}" title="${esc(KEYWORDS[k].reminder)}">${esc(k)}</button>`).join("")}</div>
    <div class="ed-grid">${num("shieldify", "Shieldify N (0 = none)", 0, 3)}${st.type === "gear" ? num("uses", "Saga: expires after N uses (0 = never)", 0, 9) : ""}</div>
  </section>

  <section class="ed-sec"><h3>Abilities <span class="muted">(these actually work in the game)</span></h3>
    ${st.effects.map(effectRow).join("") || '<p class="muted">No abilities yet \u2014 vanilla card, or keywords only.</p>'}
    <div class="row"><button type="button" class="ghost" id="ed-add-eff">+ Add ability</button>
      ${hasActivate ? num("activateCost", "Extra mana for [T] abilities", 0, 9) : ""}</div>
  </section>

  <section class="ed-sec"><h3>Card text</h3>
    <label class="ed-check"><input type="checkbox" data-k="autoText" ${st.autoText ? "checked" : ""}> Write the text automatically from keywords and abilities</label>
    ${st.autoText ? `<div class="ed-autotext muted">${esc(normalize(def).text) || "\u2014"}</div><button type="button" class="ghost" id="ed-edit-text">Edit this text by hand</button>` : `<div class="ed-tools">${["[T]", "[M]", "[1]", "[2]", "[U]", "__(reminder)__"].map((t2) => `<button type="button" class="ghost" data-ins="${esc(t2)}">${esc(t2)}</button>`).join("")}
          <select id="ed-ins-kw"><option value="">+ keyword badge\u2026</option>${Object.keys(KEYWORDS).map((k) => `<option>${esc(k)}</option>`).join("")}</select></div>
        <textarea data-k="text" rows="6" placeholder="Rules text. {Keyword#HEX} = colored badge, __text__ = italic, [T] tap, [M] might, [2] mana">${esc(st.text)}</textarea>
        <div class="muted ed-hint">The text is only what is printed \u2014 the game logic comes from Keywords and Abilities above.</div>`}
    <div class="ed-grid">
      <label class="ed-f ed-wide"><span>Flavor text</span><input data-k="flavor" value="${esc(st.flavor)}" maxlength="140"></label>
      <label class="ed-f"><span>Illustrator</span><input data-k="illustrator" value="${esc(st.illustrator)}"></label>
    </div>
  </section>

  <section class="ed-sec ed-actions">
    <div class="row"><button class="primary" id="ed-save">\u{1F4BE} Save card</button><button class="ghost" id="ed-new">New card</button>
      <button class="ghost" id="ed-export">\u2B07 Download card file</button><span id="ed-msg" class="ed-msg"></span></div>
    ${isCustomCard(def.id) ? `<div class="row ed-deckrow"><span>Add to deck:</span>
      ${decks.length ? `<select id="ed-deck">${decks.map((d) => opt(d.id, d.name, "")).join("")}</select><button class="ghost" id="ed-add-deck">Add</button>` : `<span class="muted">No own deck yet \u2014 in <a href="#/decks">Decks</a> make a copy of a deck (e.g. Lui's) first.</span>`}</div>` : ""}
  </section>`;
  }
  function listHtml() {
    const mine = customCards().slice().sort((a, b) => a.id.localeCompare(b.id));
    return `<div class="ed-list-head"><b>My cards</b> <span class="muted">${mine.length}</span><span class="spacer"></span>
      <label class="ghost ed-btn-sm">Import<input type="file" id="ed-import" accept=".json,application/json" multiple hidden></label>
      ${mine.length ? '<button class="ghost ed-btn-sm" id="ed-export-all">Export all</button>' : ""}</div>
    ${mine.length ? `<div class="ed-list">${mine.map((c) => `<div class="ed-item ${st.editing === c.id ? "on" : ""}" data-edit="${esc(c.id)}">
        ${cardHtml(getDef(c.id), { size: "xs" })}<div><b>${esc(c.name)}</b><div class="muted">${esc(c.id)}</div></div>
        <button class="ghost ed-x" data-del="${esc(c.id)}" title="Delete">\u2715</button></div>`).join("")}</div>` : '<p class="muted">Saved cards show up here. They are stored in this browser and can be used in your decks right away.</p>'}`;
  }
  function drawPreview(app2) {
    const box = app2.querySelector("#ed-preview");
    if (!box) return;
    let def;
    try {
      def = normalize(buildDef(st));
    } catch {
      return;
    }
    box.innerHTML = cardHtml(def, { size: "lg", classes: st.image ? "ed-pannable" : "" });
    const auto = app2.querySelector(".ed-autotext");
    if (auto) auto.textContent = def.text || "\u2014";
  }
  function draw(app2) {
    const y = app2.querySelector(".ed-form")?.scrollTop || 0;
    app2.querySelector(".ed-form").innerHTML = formHtml();
    app2.querySelector(".ed-side").innerHTML = listHtml();
    app2.querySelector(".ed-form").scrollTop = y;
    drawPreview(app2);
    saveDraft();
  }
  async function setImageFromFile(app2, file) {
    if (!file || !file.type.startsWith("image/")) return flash(app2, "That is not an image file.", true);
    const { src, iw, ih } = await fileToDataUrl(file);
    Object.assign(st, { image: src, iw, ih, zoom: 1, cx: 50, cy: 50 });
    draw(app2);
  }
  async function ensureImageSize() {
    if (st.image && (!st.iw || !st.ih)) {
      try {
        const im = await loadImage(st.image);
        st.iw = im.naturalWidth;
        st.ih = im.naturalHeight;
      } catch {
        st.image = null;
      }
    }
    if (st.cropFromDef && st.iw) {
      zoomFromCrop(st, st.cropFromDef);
      delete st.cropFromDef;
    }
  }
  async function importFiles(app2, files) {
    let n = 0, last = null;
    for (const f of files) {
      let j;
      try {
        j = JSON.parse(await f.text());
      } catch {
        flash(app2, `${f.name}: not a JSON file.`, true);
        continue;
      }
      try {
        if (j.format === "rajongoi-cards") {
          for (const c of j.cards || []) {
            await saveCustomCard(c);
            n++;
            last = c;
          }
        } else if (j.card && j.format === "rajongoi-card") {
          await saveCustomCard(j.card);
          n++;
          last = j.card;
        } else {
          st = await stateFromRiftcardmaker(j);
          const id = cardId(st);
          if (hasDef(id)) {
            const old = getDef(id);
            st.editing = id;
            if (!st.effects.length) st.effects = (old.effects || []).filter((e) => e.do !== "shieldify").map((e) => ({ ...e }));
            st.keywords = [.../* @__PURE__ */ new Set([...st.keywords, ...(old.keywords || []).filter((k) => k !== "Shieldify")])];
            if (old.type === "signature") {
              st.type = "signature";
              st.sigType = old.sigType || "spell";
              st.legend = old.legend || "";
            }
            if (old.activateCost) st.activateCost = old.activateCost;
            if (old.uses) st.uses = old.uses;
          }
          draw(app2);
          flash(app2, `Loaded \u201C${st.name}\u201D from riftcardmaker \u2014 add abilities if needed, then Save.`);
          continue;
        }
      } catch (e) {
        flash(app2, `${f.name}: ${e.message}`, true);
      }
    }
    if (n) {
      if (last) {
        st = stateFromDef(getDef(last.id));
        await ensureImageSize();
      }
      draw(app2);
      flash(app2, `Imported ${n} card${n > 1 ? "s" : ""}.`);
    }
  }
  async function renderEditor(app2, arg) {
    if (arg && hasDef(arg)) st = stateFromDef(getDef(arg));
    else if (!st) st = loadDraft() || blankState();
    await ensureImageSize();
    app2.innerHTML = `<div class="page editor-page">
    <div class="row"><h2 style="margin:0">Card Editor</h2><span class="spacer"></span>
      <span class="muted">Riftcardmaker JSON files can be imported too (My cards \u2192 Import).</span></div>
    <div class="ed-layout">
      <div class="ed-form"></div>
      <div class="ed-preview-col"><div id="ed-preview" class="ed-preview"></div>
        <p class="muted ed-prev-hint">Live preview \u2014 exactly as the card looks in the game.</p></div>
      <aside class="ed-side"></aside>
    </div></div>`;
    draw(app2);
    const form = app2.querySelector(".ed-form");
    const set = (k, v) => {
      if (k === "type" && v === "token") st.set = "TKN";
      if (k === "type" && st.type === "token" && v !== "token") st.set = "OGN";
      if (k === "set" || k === "type" && v === "token") st.number = st.editing ? st.number : nextNumber(k === "set" ? v : "TKN");
      st[k] = v;
    };
    const structural = /* @__PURE__ */ new Set(["type", "sigType", "autoText", "set"]);
    form.addEventListener("input", (e) => {
      const t2 = e.target;
      if (t2.dataset.k) {
        const v = t2.type === "checkbox" ? t2.checked : t2.type === "number" ? t2.value === "" ? 0 : +t2.value : t2.value;
        set(t2.dataset.k, v);
        if (structural.has(t2.dataset.k) || t2.dataset.k === "shieldify" || t2.dataset.k === "number" || t2.dataset.k === "name" || t2.dataset.k === "subname") {
          if (t2.tagName === "SELECT" || t2.type === "checkbox") return draw(app2);
          const idEl = app2.querySelector(".ed-id code");
          if (idEl) idEl.textContent = buildDef(st).id;
        }
        drawPreview(app2);
        saveDraft();
      } else if (t2.dataset.e != null) {
        const e2 = st.effects[+t2.dataset.e];
        const k = t2.dataset.ek;
        e2[k] = t2.type === "number" ? t2.value === "" ? "" : +t2.value : t2.value;
        if (k === "do") {
          const p = ACTIONS[e2.do].p;
          for (const x of ["target", "amount", "maxPower", "duration", "keyword", "who", "tokenId"]) if (!p.includes(x)) delete e2[x];
          if (p.includes("target") && !e2.target) e2.target = e2.do === "buff" || e2.do === "untap" ? "friendlyUnit" : "enemyUnit";
          if (p.includes("amount") && e2.amount == null) e2.amount = 1;
          if (p.includes("keyword") && !e2.keyword) e2.keyword = "Haste";
          if (p.includes("tokenId") && !e2.tokenId) e2.tokenId = allCards().find((c) => c.type === "token")?.id;
          if (p.includes("duration") && !e2.duration) e2.duration = "turn";
        }
        if (t2.tagName === "SELECT") return draw(app2);
        const row = t2.closest(".ed-eff")?.querySelector(".ed-eff-text");
        if (row) {
          try {
            row.innerHTML = markup(describeEffect(e2, buildDef(st)));
          } catch {
          }
        }
        drawPreview(app2);
        saveDraft();
      } else if (t2.id === "ed-zoom") {
        st.zoom = +t2.value;
        drawPreview(app2);
        saveDraft();
      }
    });
    form.addEventListener("change", (e) => {
      if (e.target.id === "ed-file") return setImageFromFile(app2, e.target.files[0]);
      if (e.target.id === "ed-ins-kw" && e.target.value) {
        const k = e.target.value;
        insertText(app2, `{${k}#${KEYWORDS[k].hex.replace("#", "")}}`);
        e.target.value = "";
      }
    });
    form.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.color) {
        const c = b.dataset.color;
        st.colors = st.colors.includes(c) ? st.colors.filter((x) => x !== c) : [...st.colors, c].slice(-2);
        return draw(app2);
      }
      if (b.dataset.kw) {
        const k = b.dataset.kw;
        st.keywords = st.keywords.includes(k) ? st.keywords.filter((x) => x !== k) : [...st.keywords, k];
        return draw(app2);
      }
      if (b.dataset.delEff != null) {
        st.effects.splice(+b.dataset.delEff, 1);
        return draw(app2);
      }
      if (b.dataset.ins) return insertText(app2, b.dataset.ins);
      switch (b.id) {
        case "ed-add-eff":
          st.effects.push({ on: st.type === "gear" ? "activate" : "play", do: "draw", amount: 1 });
          return draw(app2);
        case "ed-center":
          Object.assign(st, { zoom: 1, cx: 50, cy: 50 });
          return draw(app2);
        case "ed-noimg":
          st.image = null;
          st.iw = st.ih = 0;
          return draw(app2);
        case "ed-edit-text":
          st.text = normalize(buildDef(st)).text;
          st.autoText = false;
          return draw(app2);
        case "ed-new":
          st = blankState();
          return draw(app2);
        case "ed-export": {
          const d = buildDef(st);
          return download(`${d.id}.rajongoi-card.json`, bundle([d]));
        }
        case "ed-save":
          return save3(app2);
        case "ed-add-deck": {
          const id = buildDef(st).id, decks = customDecks(), d = decks.find((x) => x.id === app2.querySelector("#ed-deck").value);
          if (!d) return;
          if (d.cards[id]) return flash(app2, `Already in \u201C${d.name}\u201D.`);
          d.cards[id] = 1;
          saveCustomDecks(decks);
          const L2 = hasDef(d.legend) ? getDef(d.legend) : null;
          const off = L2 && getDef(id).colors.some((c) => !L2.colors.includes(c));
          return flash(app2, `Added to \u201C${d.name}\u201D.${off ? " \u26A0 Its color is outside that Legend\u2019s colors, so the deck is not legal with it." : ""}`, off);
        }
      }
    });
    const page = app2.querySelector(".editor-page");
    page.addEventListener("dragover", (e) => {
      e.preventDefault();
      app2.querySelector("#ed-drop")?.classList.add("over");
    });
    page.addEventListener("dragleave", () => app2.querySelector("#ed-drop")?.classList.remove("over"));
    page.addEventListener("drop", (e) => {
      e.preventDefault();
      app2.querySelector("#ed-drop")?.classList.remove("over");
      const files = [...e.dataTransfer?.files || []];
      const img = files.find((f) => f.type.startsWith("image/"));
      const json = files.filter((f) => /json/.test(f.type) || f.name.endsWith(".json"));
      if (img) setImageFromFile(app2, img);
      if (json.length) importFiles(app2, json);
    });
    const side2 = app2.querySelector(".ed-side");
    side2.addEventListener("click", async (e) => {
      const del = e.target.closest("[data-del]");
      if (del) {
        e.stopPropagation();
        const id = del.dataset.del;
        if (!confirm(`Delete \u201C${getDef(id).name}\u201D from this browser?`)) return;
        await deleteCustomCard(id);
        if (st.editing === id) st.editing = null;
        return draw(app2);
      }
      const it = e.target.closest("[data-edit]");
      if (it) {
        st = stateFromDef(getDef(it.dataset.edit));
        await ensureImageSize();
        return draw(app2);
      }
      if (e.target.id === "ed-export-all") download(`rajongoi-cards-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, bundle(customCards()));
    });
    side2.addEventListener("change", (e) => {
      if (e.target.id === "ed-import") importFiles(app2, [...e.target.files]);
    });
    const prev = app2.querySelector("#ed-preview");
    let drag = null;
    prev.addEventListener("pointerdown", (e) => {
      if (!st.image) return;
      const card = prev.querySelector(".card");
      drag = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy, w: card.offsetWidth, h: card.offsetHeight };
      prev.setPointerCapture(e.pointerId);
      prev.classList.add("dragging");
    });
    prev.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const c = cropOf(st);
      st.cx = drag.cx - (e.clientX - drag.x) / drag.w * c.width;
      st.cy = drag.cy - (e.clientY - drag.y) / drag.h * c.height;
      const img = prev.querySelector(".card-img");
      if (img) Object.assign(img.style, imgStyle(cropOf(st)));
    });
    const end = () => {
      if (drag) {
        drag = null;
        prev.classList.remove("dragging");
        saveDraft();
      }
    };
    prev.addEventListener("pointerup", end);
    prev.addEventListener("pointercancel", end);
    prev.addEventListener("wheel", (e) => {
      if (!st.image) return;
      e.preventDefault();
      st.zoom = Math.min(4, Math.max(0.4, st.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
      const z = app2.querySelector("#ed-zoom");
      if (z) z.value = st.zoom;
      const img = prev.querySelector(".card-img");
      if (img) Object.assign(img.style, imgStyle(cropOf(st)));
      saveDraft();
    }, { passive: false });
  }
  function insertText(app2, s) {
    const ta = app2.querySelector("textarea[data-k=text]");
    if (!ta) return;
    const a = ta.selectionStart, b = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + s + ta.value.slice(b);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = a + s.length;
    st.text = ta.value;
    drawPreview(app2);
    saveDraft();
  }
  async function save3(app2) {
    const def = buildDef(st);
    if (!st.name.trim()) return flash(app2, "Give the card a name first.", true);
    if (!st.colors.length && st.type !== "token") return flash(app2, "Pick at least one color.", true);
    if (st.type === "legend" && st.colors.length !== 2) return flash(app2, "A Legend needs exactly 2 colors.", true);
    if (st.type === "signature" && !st.legend) return flash(app2, "Choose which Legend this Signature belongs to.", true);
    if (hasDef(def.id) && !isCustomCard(def.id) && st.editing !== def.id && !confirm(`${def.id} is already \u201C${getDef(def.id).name}\u201D. Replace it in this browser?`)) return;
    if (st.editing && st.editing !== def.id && isCustomCard(st.editing)) await deleteCustomCard(st.editing);
    def.updatedAt = Date.now();
    try {
      await saveCustomCard(def);
    } catch (e) {
      return flash(app2, `Could not save (${e.message || "storage full?"}).`, true);
    }
    st.editing = def.id;
    draw(app2);
    flash(app2, `Saved ${def.id}. It is now in the Collection and the deck builder.`);
  }

  // js/app.js
  var app = document.getElementById("app");
  function renderHome() {
    const pool = allCards().filter((c) => c.image && c.type !== "rune");
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const showcase = pool.slice(0, 5);
    const fan = showcase.map((d, i) => {
      const off = Math.abs(i - (showcase.length - 1) / 2);
      return cardHtml(d, { size: "md", classes: "fan-card", style: `transform:translateY(${Math.round(off * off * 9)}px)` });
    }).join("");
    const seeds = Array.from({ length: 22 }, (_, i) => `<i style="left:${i * 37 % 100}%;animation-delay:${i * 0.73 % 9}s;animation-duration:${9 + i % 5 * 2}s;--s:${0.6 + i % 4 * 0.25}"></i>`).join("");
    const achDone = unlockedMap();
    const achTotal = ACHIEVEMENTS.filter((a) => !a.unobtainable).length;
    const achGot = ACHIEVEMENTS.filter((a) => achDone[a.id]).length;
    app.innerHTML = `<div class="home-bg" aria-hidden="true">
    <div class="rays"></div><div class="rays rays-2"></div>
    <div class="hero-glow"></div>
    <img class="hero" src="img/mascot.svg" alt="">
    <div class="seeds">${seeds}</div>
    <div class="vignette"></div>
  </div>
  <section class="home"><div>
    <h1>RAJONGOI TCG</h1>
    <div class="tag">Shields, runes &amp; legends \u2014 a fan-made duel card game</div>
    <div class="menu">
      <button class="primary" onclick="location.hash='#/play'">Play against AI</button>
      <button onclick="location.hash='#/boosters'">Open boosters</button>
      <button onclick="location.hash='#/collection'">Collection</button>
      <button class="ghost" onclick="location.hash='#/decks'">Decks</button>
      <button class="ach-home" onclick="location.hash='#/achievements'">\u{1F3C6} Achievements <span class="ach-home-count">${achGot} / ${achTotal}</span></button>
    </div>
    <div class="fan">${fan}</div>
    <p class="muted" style="margin-top:20px">${allCards().length} cards loaded</p>
  </div></section>`;
  }
  var firstRoute = true;
  function route() {
    if (!firstRoute) sfx.nav();
    firstRoute = false;
    stopGame();
    document.querySelectorAll(".modal").forEach((m) => m.remove());
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const [page, arg] = parts;
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (page === "deck" ? "decks" : page)));
    window.scrollTo(0, 0);
    switch (page) {
      case "play":
        return renderSetup(app);
      case "collection":
        return renderCollection(app, arg || "OGN");
      case "decks":
        return renderDecks(app, arg);
      case "deck":
        return renderBuilder(app, arg || "new");
      case "boosters":
        return renderBoosters(app);
      case "achievements":
        return renderAchievements(app);
      case "rules":
        return renderRules(app);
      case "editor":
        return renderEditor(app, arg);
      default:
        return renderHome();
    }
  }
  installAutoFit();
  var muteBtn = document.getElementById("mute");
  var paintMute = () => {
    muteBtn.textContent = isMuted() ? "\u{1F507}" : "\u{1F50A}";
  };
  paintMute();
  muteBtn.onclick = (e) => {
    e.stopPropagation();
    setMuted(!isMuted());
    paintMute();
    sfx.toggle();
  };
  var CONTROLS = "button, .chip, .dd-opt, .deck-pick, .tabs button, nav a, .logo, select";
  document.addEventListener("click", (e) => {
    const t2 = e.target.closest(CONTROLS);
    if (t2 && t2 !== muteBtn && !t2.disabled) sfx.click();
  }, true);
  var hoverEl = null;
  document.addEventListener("mouseover", (e) => {
    const t2 = e.target.closest(CONTROLS + ", .grid .card, .hand-row.mine .card, .flip");
    if (t2 && t2 !== hoverEl) {
      hoverEl = t2;
      if (t2.matches(".hand-row.mine .card")) sfx.swish(0.5);
      else sfx.hover();
    }
    if (!t2) hoverEl = null;
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {
    });
  }
  function preloadThumbs() {
    const srcs = [...new Set(allCards().filter((c) => c.image).map((c) => thumbOf(c.image)))];
    let i = 0;
    const next = () => {
      for (let k = 0; k < 6 && i < srcs.length; k++, i++) {
        const im = new Image();
        im.decoding = "async";
        im.src = srcs[i];
      }
      if (i < srcs.length) {
        if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 400 });
        else setTimeout(next, 120);
      }
    };
    next();
  }
  loadData().then(() => {
    setTimeout(preloadThumbs, 600);
    window.addEventListener("hashchange", route);
    route();
  }).catch((err) => {
    app.innerHTML = `<div class="page"><h2>Could not load card data</h2><p class="muted">${err}</p>
  <p>Serve the folder over HTTP (e.g. <code>python3 -m http.server</code>) \u2014 opening index.html as a file won't work.</p></div>`;
  });
})();
