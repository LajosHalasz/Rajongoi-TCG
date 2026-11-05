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
      if (db && ["signature", "champion"].includes(db.type) && ["unit", "spell", "gear"].includes(c.type)) {
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
  function artPool() {
    return allCards().filter((c) => c.image);
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
    if (def.type === "signature" && !def.sigType) def.sigType = "spell";
    def.recycle = def.recycle || 0;
    def.text = def.text && def.text.trim() ? def.text : describe(def);
    if (def.provisionalEffect) def.text = `{Provisional#7A7A7A}__(placeholder effect until this card is designed)__
${def.text}`;
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
    const names = [legend.name, ...legend.championNames || []].map(baseName);
    return names.includes(baseName(champ.name));
  }
  function signatureMatchesLegend(sig, legend) {
    if (!sig || !legend) return false;
    if (sig.legend) return sig.legend === legend.id;
    return (sig.tribes || []).some((t) => baseName(t) === baseName(legend.name));
  }
  function keywordMarkup(kw, n) {
    const k = KEYWORDS[kw];
    if (!k) return `{${kw}#555555}`;
    const label = n != null ? `${kw} ${n}` : kw;
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
    activate: (d) => `[T]${d.activateCost ? ` + [${d.activateCost}]` : ""}: `
  };
  function describeEffect(e, def) {
    const t = TARGET_TEXT[e.target] || "target Unit";
    const n = e.amount ?? 1;
    const f = e.filter || {};
    const pw = (e.maxPower != null ? ` with [M]${e.maxPower} or less` : "") + (f.notType ? ` (not ${f.notType === "champion" ? "a Champion" : f.notType})` : "") + (f.color ? ` (${f.color} only)` : "") + (f.notColor ? ` (non-${f.notColor})` : "");
    const dur = e.duration === "permanent" ? "" : " this turn";
    switch (e.do) {
      case "draw":
        return e.who === "opponent" ? `Your opponent draws ${n}.` : `Draw ${n}.`;
      case "destroy":
        return `Destroy ${t}${pw}.`;
      case "buff": {
        if (e.on === "static") {
          const who = `Your ${f.color ? f.color + " " : ""}Units${f.keyword ? " with " + f.keyword : ""}`;
          return `${who} have ${n >= 0 ? "+" : ""}${n} [M].`;
        }
        return n >= 0 ? `Give ${t} +${n} [M]${dur}.` : `Reduce ${t}'s [M]Might by [${-n}]${dur === " this turn" ? " until the end of this turn" : ""}.`;
      }
      case "tap":
        return `Tap [T] ${t}${pw}.`;
      case "untap":
        return `Ready ${t}.`;
      case "bounce":
        return `Return ${t}${pw} to its owner's hand.`;
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
      case "grantKeyword":
        return `Give ${t} ${e.keyword}${dur}.`;
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
    for (const kw of def.keywords || []) {
      if (kw === "Shieldify") continue;
      lines.push(keywordMarkup(kw));
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
    const defs = ids.map(getDef);
    const count = (f) => defs.filter(f).length;
    const curve = {};
    for (const d of defs) curve[Math.min(d.cost, 10)] = (curve[Math.min(d.cost, 10)] || 0) + 1;
    const totalCost = defs.reduce((a, d) => a + (d.cost || 0), 0);
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
    const st = deckStats(deck);
    for (const id of Object.keys(deck.cards || {})) if (!hasDef(id)) errors.push(`Unknown card ${id}.`);
    if (st.total !== RULES.DECK_SIZE) errors.push(`Deck must have exactly ${RULES.DECK_SIZE} cards (has ${st.total}).`);
    for (const [id, n] of Object.entries(deck.cards || {})) if (n > RULES.MAX_COPIES && hasDef(id)) errors.push(`Only ${RULES.MAX_COPIES} copy allowed: ${getDef(id).name}.`);
    const ids = Object.keys(deck.cards || {}).filter(hasDef);
    const defs = ids.map(getDef);
    for (const d of defs) {
      if (d.type === "legend" || d.type === "token" || d.type === "rune") errors.push(`${d.name} can't be in the main deck.`);
      if (d.type === "signature") {
        if (!signatureMatchesLegend(d, legend)) errors.push(`${d.name} is a Signature card of another Legend.`);
      } else if (d.colors.some((c) => !legend.colors.includes(c))) {
        errors.push(`${d.name} is outside your Legend's colors (${legend.colors.join("/")}).`);
      }
    }
    if (st.champions < RULES.MIN_CHAMPIONS || st.champions > RULES.MAX_CHAMPIONS)
      errors.push(`Deck needs ${RULES.MIN_CHAMPIONS}-${RULES.MAX_CHAMPIONS} Champion Units (has ${st.champions}).`);
    if (!defs.some((d) => d.type === "champion" && championMatchesLegend(d, legend)))
      errors.push(`At least one Champion must share the Legend's name (${legend.name.split(",")[0]}).`);
    if (st.signatures > RULES.MAX_SIGNATURES) errors.push(`Max ${RULES.MAX_SIGNATURES} Signature cards.`);
    if (!deck.champion || !ids.includes(deck.champion)) errors.push("Choose the Champion that starts in the Champion Slot.");
    else if (!championMatchesLegend(getDef(deck.champion), legend)) errors.push("The Champion Slot card must share the Legend's name.");
    if (st.signatures > 0 && (!deck.signature || !ids.includes(deck.signature))) errors.push("Choose the Signature card that starts in the Signature Slot.");
    if (st.runes !== RULES.RUNE_DECK_SIZE) errors.push(`Mana Deck must have ${RULES.RUNE_DECK_SIZE} runes (has ${st.runes}).`);
    for (const c of Object.keys(deck.runes || {})) if (deck.runes[c] > 0 && !legend.colors.includes(c)) errors.push(`${c} runes don't match your Legend.`);
    const range = (k, label) => {
      const [lo, hi] = GUIDE[k];
      if (st[k] < lo || st[k] > hi) warnings.push(`Guide: ${lo}-${hi} ${label} (has ${st[k]}).`);
    };
    range("units", "Units");
    range("spells", "Spells");
    range("gears", "Gears");
    if (Math.abs(st.avgCost - GUIDE.avgCost) > 0.6) warnings.push(`Guide: average cost ~${GUIDE.avgCost} (is ${st.avgCost.toFixed(1)}).`);
    return { errors, warnings, stats: st };
  }

  // js/data.js
  var LS_KEY = "riftmasters.decks.v1";
  var premade = [];
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
    const [placeholders, imported, overrides, decks] = pre ? [pre.cards, pre.imported, pre.effects, pre.decks] : await Promise.all([
      getJson("data/cards.json", []),
      getJson("data/imported.json", []),
      getJson("data/effects.json", {}),
      getJson("data/decks.json", [])
    ]);
    setCardDb(mergeSources(placeholders, imported), overrides);
    premade = decks;
    return allCards();
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
    return allDecks().filter((d) => !validateDeck(d).errors.length);
  }
  function findDeck(id) {
    return allDecks().find((d) => d.id === id);
  }

  // js/ui/card.js
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var ICONS = {
    T: '<span class="ico ico-tap" title="Tap">\u21B7</span>',
    M: '<span class="ico ico-might" title="Might">\u26E8</span>',
    R: `<span class="ico ico-rune" title="Rune of this card's color">\u25C6</span>`
  };
  function markup(text) {
    let h = esc(text);
    h = h.replace(
      /\{([^#}]+)#([0-9a-fA-F]{6})(?:#([0-9a-fA-F]{6}))?\}/g,
      (_, label, bg, fg) => `<span class="kw" style="background:#${bg};color:#${fg || "fff"}">${label.trim()}</span>`
    );
    h = h.replace(/__(.+?)__/gs, "<i>$1</i>");
    h = h.replace(/\[([A-Za-z])#([0-9a-fA-F]{6})\]/g, (_, k, c) => `<span class="ico" style="background:#${c}">${k.toUpperCase()}</span>`);
    h = h.replace(/\[([TMR])\]/g, (_, k) => ICONS[k]);
    h = h.replace(/\[P\]/g, '<span class="ico" title="Power rune">P</span>');
    h = h.replace(/\[\+(\d+)M\]/g, "+$1 " + ICONS.M);
    h = h.replace(/\[(\d+\+?)\]/g, '<span class="ico ico-num">$1</span>');
    return h.split("\n").map((l) => l.trim() ? `<p>${l}</p>` : "").join("");
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  var GLYPH = { unit: "\u2694", champion: "\u2605", spell: "\u2726", gear: "\u2699", legend: "\u265B", signature: "\u272A", token: "\u265F" };
  function colorHex(def) {
    return def.colors.length ? COLORS[def.colors[0]]?.hex || "#777" : "#6d6e6b";
  }
  function artHtml(def) {
    if (def.image) {
      let pos = "center";
      if (def.imageCrop) {
        const cx = def.imageCrop.x + def.imageCrop.width / 2;
        pos = `${Math.max(0, Math.min(100, cx)).toFixed(0)}% center`;
      }
      return `<img class="art-img" src="${esc(def.image)}" alt="" loading="lazy" style="object-position:${pos}">`;
    }
    const c1 = colorHex(def);
    const c2 = def.colors[1] ? COLORS[def.colors[1]].hex : "#1d1a16";
    const pool = artPool();
    if (pool.length) {
      const same = pool.filter((c) => c.colors.some((x) => def.colors.includes(x)));
      const src = same.length ? same : pool;
      const h = hash(def.id);
      const pick2 = src[h % src.length];
      const zoom = 1.25 + (h >> 4) % 50 / 100;
      const px = (h >> 8) % 100, py = (h >> 12) % 100;
      return `<div class="art-ph borrowed" style="--c1:${c1};--c2:${c2}">
      <img class="art-img" src="${esc(pick2.image)}" alt="" loading="lazy" style="object-position:${px}% ${py}%;transform:scale(${zoom.toFixed(2)})${h & 1 ? " scaleX(-1)" : ""}">
      <span class="ph-label">placeholder art</span></div>`;
    }
    const initials = def.name.replace(/[^A-Za-zÀ-ž ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return `<div class="art-ph" style="--c1:${c1};--c2:${c2}">
    <span class="ph-glyph">${GLYPH[def.type] || "\u2726"}</span>
    <span class="ph-initials">${esc(initials)}</span>
    <span class="ph-label">artwork coming soon</span>
  </div>`;
  }
  function typeLabel(def) {
    if (def.type === "signature") return `Signature ${def.sigType === "unit" ? "Unit" : def.sigType === "gear" ? "Gear" : "Spell"}`;
    if (def.type === "token") return "Token Unit";
    return TYPE_INFO[def.type]?.label || def.type;
  }
  function cardHtml(def, opts = {}) {
    const k = kindOf(def);
    const showMight = k === "unit";
    const might = opts.power ?? def.power;
    const mightCls = opts.power != null && opts.power !== def.power ? opts.power > def.power ? "up" : "down" : "";
    const typeHex = TYPE_INFO[def.type]?.hex || "#555";
    const cls = ["card", `size-${opts.size || "md"}`, opts.mini ? "mini" : "", opts.tapped ? "tapped" : "", opts.classes || ""].join(" ");
    const data = `data-cid="${esc(def.id)}"${opts.uid ? ` data-uid="${esc(opts.uid)}"` : ""}`;
    const tribes = (def.tribes || []).slice(0, 2).map((t) => `<span class="tribe">${esc(t)}</span>`).join("");
    const domains = def.colors.map((c) => `<span class="domain" style="background:${COLORS[c]?.hex}" title="${c}"></span>`).join("");
    const badges = opts.badges || "";
    const prov = def.provisional || [];
    return `<div class="${cls}" ${data} style="--domain:${colorHex(def)};--type:${typeHex}">
    <div class="art">${artHtml(def)}</div>
    <div class="frame"></div>
    ${def.type === "legend" || def.type === "rune" ? "" : `<div class="cost ${prov.includes("cost") ? "prov" : ""}" title="${prov.includes("cost") ? "Provisional cost" : "Cost"}"><span>${opts.cost ?? def.cost}</span></div>`}
    ${def.recycle ? `<div class="recycle" title="Recycle ${def.recycle} rune(s) of this color"><i>\u21BB</i>${def.recycle}</div>` : ""}
    ${showMight ? `<div class="might ${mightCls} ${prov.includes("might") ? "prov" : ""}"><span class="might-ico">\u26E8</span><span class="might-val">${might}</span></div>` : ""}
    ${def.wip || def.placeholder ? `<div class="wip-tag">${def.filler ? "FILLER" : def.placeholder ? "PLACEHOLDER" : "WIP"}</div>` : ""}
    <div class="typeline"><span class="domains">${domains}</span><span class="type-badge">${esc(typeLabel(def))}</span>${tribes}</div>
    <div class="namebar"><span style="${nameSize(def.name, opts.mini)}">${esc(def.name)}</span>${def.subname && !opts.mini ? `<small>${esc(def.subname)}</small>` : ""}</div>
    <div class="textbox">${def.text ? markup(def.text) : `<p class="wip-text">Design in progress${def.purpose ? ` \u2014 ${esc(def.purpose)}` : ""}.</p>`}${def.flavor ? `<div class="flavor">${esc(def.flavor)}</div>` : ""}</div>
    <div class="footer"><span>${esc(def.setInfo || def.id)}</span><span>${esc(def.illustrator || (def.owners || []).join(" / "))}</span></div>
    ${badges}
  </div>`;
  }
  function nameSize(name, mini) {
    if (mini) return "";
    const n = name.length;
    return n > 20 ? `font-size:${Math.max(3.6, 6.2 * 20 / n).toFixed(2)}cqw` : "";
  }
  function cardBackHtml(opts = {}) {
    return `<div class="card card-back size-${opts.size || "sm"} ${opts.classes || ""}" ${opts.attrs || ""}><div class="back-inner"><span>RIFT<br>MASTERS</span></div>${opts.label ? `<div class="back-label">${opts.label}</div>` : ""}</div>`;
  }

  // js/ui/collection.js
  var SET_NAMES = { OGN: "OGN 2026-01", DND: "DND \u2014 DLC", BAS: "Fillers", TKN: "Tokens", RUN: "Runes" };
  var TYPE_ORDER = ["legend", "champion", "unit", "spell", "gear", "signature", "token", "rune"];
  var sortCards = (a, b) => a.set.localeCompare(b.set) || String(a.number).localeCompare(String(b.number));
  function showCardModal(def) {
    const m = document.createElement("div");
    m.className = "modal";
    const kws = (def.keywords || []).join(", ") || "\u2014";
    m.innerHTML = `<div class="modal-box"><div class="modal-card">
    ${cardHtml(def, { size: "lg" })}
    <dl class="info">
      <dt>Name</dt><dd><b>${esc(def.name)}</b></dd>
      <dt>Type</dt><dd>${esc(TYPE_INFO[def.type]?.label || def.type)}${def.sigType ? " (" + def.sigType + ")" : ""}</dd>
      <dt>Colors</dt><dd>${def.colors.join(" / ") || "Neutral"}</dd>
      <dt>Cost / Might / Recycle</dt><dd>${def.cost} / ${kindOf(def) === "unit" ? def.power : "\u2014"} / ${def.recycle || 0}${def.provisional ? ` <span class="muted">(provisional: ${def.provisional.join(", ")})</span>` : ""}</dd>
      ${def.owners?.length ? `<dt>Deck of</dt><dd>${esc(def.owners.join(" / "))}</dd>` : ""}
      ${def.purpose ? `<dt>Purpose</dt><dd>${esc(def.purpose)}</dd>` : ""}
      <dt>Status</dt><dd>${def.image ? "Finished (with artwork)" : def.filler ? "Filler card (completes short decks)" : def.placeholder ? "Placeholder" : def.wip ? "Work in progress (FLAG)" : "Designed"}${def.provisionalEffect ? " \xB7 provisional effect" : ""}</dd>
      <dt>Keywords</dt><dd>${esc(kws)}</dd>
      <dt>Card id</dt><dd><code>${esc(def.id)}</code></dd>
      <dt>Game logic</dt><dd><code style="font-size:12px;white-space:pre-wrap">${esc(JSON.stringify(def.effects || []))}</code></dd>
      <dd style="margin-top:14px"><button class="close">Close</button></dd>
    </dl></div></div>`;
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest(".close")) m.remove();
    });
    document.body.appendChild(m);
  }
  var filt = { types: /* @__PURE__ */ new Set(), colors: /* @__PURE__ */ new Set(), owner: "", status: "", q: "" };
  function renderCollection(app2, set) {
    const cards = allCards();
    const ORDER = ["OGN", "DND", "TKN", "RUN", "BAS"];
    const rank = (x) => ORDER.indexOf(x) + 1 || 50;
    const sets = [...new Set(cards.map((c) => c.set))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    if (!sets.includes(set)) set = sets[0];
    const inSet = cards.filter((c) => c.set === set).sort(sortCards);
    const types = TYPE_ORDER.filter((t) => inSet.some((c) => c.type === t));
    const owners = [...new Set(inSet.flatMap((c) => c.owners || []))].sort((a, b) => a.localeCompare(b));
    if (filt.owner && !owners.includes(filt.owner)) filt.owner = "";
    const status = (c) => c.image ? "art" : c.wip || c.placeholder ? "wip" : "designed";
    const draw = () => {
      const shown = inSet.filter((c) => (!filt.types.size || filt.types.has(c.type)) && (!filt.colors.size || c.colors.some((x) => filt.colors.has(x))) && (!filt.owner || (c.owners || []).includes(filt.owner)) && (!filt.status || status(c) === filt.status) && (!filt.q || (c.name + " " + c.text).toLowerCase().includes(filt.q.toLowerCase())));
      const nArt = inSet.filter((c) => status(c) === "art").length;
      const nWip = inSet.filter((c) => status(c) === "wip").length;
      app2.innerHTML = `<div class="page">
      <div class="tabs">${sets.map((s) => `<button class="${s === set ? "active" : ""}" data-set="${s}">${esc(SET_NAMES[s] || s)} <span class="muted">(${cards.filter((c) => c.set === s).length})</span></button>`).join("")}</div>
      <div class="filters">
        ${types.map((t) => `<span class="chip ${filt.types.has(t) ? "on" : ""}" data-type="${t}"><span class="dot" style="background:${TYPE_INFO[t]?.hex || "#777"}"></span>${TYPE_INFO[t]?.label || "Token"}</span>`).join("")}
        <span style="width:10px"></span>
        ${Object.entries(COLORS).map(([k, v]) => `<span class="chip ${filt.colors.has(k) ? "on" : ""}" data-color="${k}"><span class="dot" style="background:${v.hex}"></span>${k}</span>`).join("")}
        ${owners.length ? `<select id="owner"><option value="">Every deck</option>${owners.map((o) => `<option ${o === filt.owner ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : ""}
        <select id="status"><option value="">Any status</option>
          <option value="art" ${filt.status === "art" ? "selected" : ""}>With artwork</option>
          <option value="designed" ${filt.status === "designed" ? "selected" : ""}>Designed (FLAG off)</option>
          <option value="wip" ${filt.status === "wip" ? "selected" : ""}>Work in progress</option></select>
        <input type="search" placeholder="Search\u2026" value="${esc(filt.q)}" id="q">
        <span class="muted">${shown.length} shown \xB7 ${nArt} with art \xB7 ${nWip} WIP</span>
      </div>
      <div class="grid">${shown.map((c) => cardHtml(c, { size: "md" })).join("") || '<p class="muted">No cards match.</p>'}</div>
    </div>`;
      app2.querySelectorAll("[data-set]").forEach((b) => b.onclick = () => location.hash = "#/collection/" + b.dataset.set);
      app2.querySelectorAll("[data-type]").forEach((b) => b.onclick = () => {
        toggle(filt.types, b.dataset.type);
        draw();
      });
      app2.querySelectorAll("[data-color]").forEach((b) => b.onclick = () => {
        toggle(filt.colors, b.dataset.color);
        draw();
      });
      if (app2.querySelector("#owner")) app2.querySelector("#owner").onchange = (e) => {
        filt.owner = e.target.value;
        draw();
      };
      app2.querySelector("#status").onchange = (e) => {
        filt.status = e.target.value;
        draw();
      };
      const q = app2.querySelector("#q");
      q.oninput = () => {
        filt.q = q.value;
        draw();
        const nq = app2.querySelector("#q");
        nq.focus();
        nq.setSelectionRange(nq.value.length, nq.value.length);
      };
      app2.querySelectorAll(".grid .card").forEach((el) => el.onclick = () => showCardModal(getDef(el.dataset.cid)));
    };
    draw();
  }
  var toggle = (set, v) => set.has(v) ? set.delete(v) : set.add(v);
  function renderDecks(app2) {
    const decks = allDecks();
    const tile = (d) => {
      const v = validateDeck(d);
      const legend = hasDef(d.legend) ? getDef(d.legend) : null;
      return `<div class="deck-tile">
      ${legend ? cardHtml(legend, { size: "xs" }) : ""}
      <div style="flex:1;min-width:0">
        <h3>${esc(d.name)}</h3>
        <div class="meta">${legend ? esc(legend.colors.join(" / ")) : "No legend"} \xB7 ${v.stats.total} cards \xB7 avg ${v.stats.avgCost.toFixed(1)}</div>
        <div class="meta">${d.premade ? "Premade" : "Custom"} \xB7 ${v.errors.length ? `<span class="msg err">${v.errors.length} problem(s)</span>` : '<span class="msg ok">Legal</span>'}</div>
        <div class="row" style="margin-top:8px">
          ${d.premade ? `<button data-copy="${d.id}">Copy &amp; edit</button>` : `<button data-edit="${d.id}">Edit</button><button class="danger" data-del="${d.id}">Delete</button>`}
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
  function renderBuilder(app2, arg) {
    let draft;
    if (arg === "new") draft = { id: "custom-" + Date.now(), name: "New deck", legend: null, champion: null, signature: null, cards: {}, runes: {} };
    else if (arg.startsWith("copy:")) {
      const src = findDeck(arg.slice(5));
      draft = structuredClone(src);
      draft.id = "custom-" + Date.now();
      draft.name = src.name + " (copy)";
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
      const L = getDef(draft.legend);
      return allCards().filter((c) => {
        if (c.type === "legend" || c.type === "token" || c.type === "rune") return false;
        if (c.type === "signature") return signatureMatchesLegend(c, L);
        return c.colors.every((x) => L.colors.includes(x));
      }).sort((a, b) => a.cost - b.cost || sortCards(a, b));
    };
    const setLegend = (id) => {
      draft.legend = id || null;
      if (!id) return;
      const L = getDef(id);
      const ok = new Set(pool().map((c) => c.id));
      for (const k of Object.keys(draft.cards)) if (!ok.has(k)) delete draft.cards[k];
      const half = RULES.RUNE_DECK_SIZE / 2;
      draft.runes = L.colors.length > 1 ? { [L.colors[0]]: half, [L.colors[1]]: RULES.RUNE_DECK_SIZE - half } : { [L.colors[0]]: RULES.RUNE_DECK_SIZE };
      fixSlots();
    };
    const fixSlots = () => {
      const L = draft.legend ? getDef(draft.legend) : null;
      const ids = Object.keys(draft.cards);
      const champs = ids.map(getDef).filter((d) => d.type === "champion" && championMatchesLegend(d, L));
      if (!ids.includes(draft.champion) || !champs.some((c) => c.id === draft.champion)) draft.champion = champs[0]?.id || null;
      const sigs = ids.map(getDef).filter((d) => d.type === "signature");
      if (!ids.includes(draft.signature)) draft.signature = sigs[0]?.id || null;
    };
    const draw = () => {
      const L = draft.legend ? getDef(draft.legend) : null;
      const v = validateDeck(draft);
      const st = v.stats;
      const shown = pool().filter((c) => (bf.set === "ALL" || c.set === bf.set) && (bf.type === "ALL" || c.type === bf.type) && (!bf.q || (c.name + " " + c.text).toLowerCase().includes(bf.q.toLowerCase())));
      const inDeck = Object.keys(draft.cards).map(getDef).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.cost - b.cost);
      const groups = TYPE_ORDER.map((t) => [t, inDeck.filter((d) => d.type === t)]).filter(([, l]) => l.length);
      const champs = inDeck.filter((d) => d.type === "champion" && championMatchesLegend(d, L));
      const sigs = inDeck.filter((d) => d.type === "signature");
      const maxBar = Math.max(4, ...Object.values(st.curve), ...Object.values(GUIDE.curve));
      const sets = [...new Set(pool().map((c) => c.set))].sort();
      const runeA = L?.colors[0], runeB = L?.colors[1];
      app2.innerHTML = `<div class="page"><div class="builder">
      <div>
        <div class="row" style="margin-bottom:10px"><button class="ghost" id="back">\u2190 Decks</button><h2 style="margin:0">Deck builder</h2></div>
        ${!L ? '<p class="muted">Pick a Legend on the right to see the cards you can use.</p>' : `
        <div class="filters">
          ${["ALL", ...sets].map((s) => `<span class="chip ${bf.set === s ? "on" : ""}" data-bset="${s}">${s === "ALL" ? "All sets" : s}</span>`).join("")}
          <span style="width:8px"></span>
          ${["ALL", "champion", "unit", "spell", "gear", "signature"].map((t) => `<span class="chip ${bf.type === t ? "on" : ""}" data-btype="${t}">${t === "ALL" ? "All types" : TYPE_INFO[t].label}</span>`).join("")}
          <input type="search" id="bq" placeholder="Search\u2026" value="${esc(bf.q)}">
        </div>
        <p class="muted" style="margin-top:0">Click a card to add or remove it (singleton).</p>
        <div class="grid">${shown.map((c) => cardHtml(c, { size: "md", classes: draft.cards[c.id] ? "in-deck" : "" })).join("")}</div>`}
      </div>
      <aside class="side">
        <div class="field"><label>Deck name</label><input type="text" id="dname" value="${esc(draft.name)}"></div>
        <div class="field"><label>Legend</label><select id="legend"><option value="">\u2014 choose \u2014</option>
          ${legends.map((l) => `<option value="${l.id}" ${l.id === draft.legend ? "selected" : ""}>${esc(l.name)} (${l.colors.join("/")})</option>`).join("")}</select></div>
        ${L ? `
        <div class="field"><label>Champion Slot (starts on the table)</label><select id="champ">
          ${champs.length ? champs.map((c) => `<option value="${c.id}" ${c.id === draft.champion ? "selected" : ""}>${esc(c.name)}</option>`).join("") : '<option value="">add a matching Champion</option>'}</select></div>
        <div class="field"><label>Signature Slot (starts on the table)</label><select id="sig">
          ${sigs.length ? sigs.map((c) => `<option value="${c.id}" ${c.id === draft.signature ? "selected" : ""}>${esc(c.name)}</option>`).join("") : '<option value="">none</option>'}</select></div>
        <div class="field"><label>Mana Deck: ${runeB ? `${runeA} ${draft.runes[runeA] || 0} \xB7 ${runeB} ${draft.runes[runeB] || 0}` : `${runeA} ${RULES.RUNE_DECK_SIZE}`}</label>
          ${runeB ? `<input type="range" id="runes" min="0" max="${RULES.RUNE_DECK_SIZE}" value="${draft.runes[runeA] || 0}" style="width:100%">` : ""}</div>
        <div class="row"><b>${st.total}/${RULES.DECK_SIZE}</b><span class="muted">U ${st.units} \xB7 C ${st.champions} \xB7 S ${st.spells} \xB7 G ${st.gears} \xB7 Sig ${st.signatures} \xB7 avg ${st.avgCost.toFixed(1)}</span></div>
        <div class="curve">${Array.from({ length: 10 }, (_, i) => i + 1).map((c) => `<div class="bar" title="cost ${c}: ${st.curve[c] || 0} (guide ${GUIDE.curve[c] || 0})">
          <div class="fill" style="height:${(st.curve[c] || 0) / maxBar * 100}%"></div>
          <div class="target" style="bottom:${(GUIDE.curve[c] || 0) / maxBar * 100}%"></div></div>`).join("")}</div>
        <div class="curve-labels">${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}${i === 9 ? "+" : ""}</span>`).join("")}</div>
        <p class="muted" style="font-size:13px;margin:2px 0 8px">Bars = your curve, dashed = Assembly Guide.</p>
        ${v.errors.map((e) => `<div class="msg err">\u2717 ${esc(e)}</div>`).join("")}
        ${v.warnings.map((e) => `<div class="msg warn">! ${esc(e)}</div>`).join("")}
        ${!v.errors.length ? '<div class="msg ok">\u2713 Deck is legal</div>' : ""}
        <ul class="decklist">${groups.map(([t, l]) => `<li class="grp">${TYPE_INFO[t]?.label || t} (${l.length})</li>` + l.map((d) => `<li data-rm="${d.id}" data-cid="${d.id}"><span class="c">${d.cost}</span>${esc(d.name)}</li>`).join("")).join("")}</ul>` : ""}
        <div class="row"><button class="primary" id="save">Save deck</button><button class="ghost" id="cancel">Cancel</button></div>
      </aside></div></div>`;
      const $ = (s) => app2.querySelector(s);
      $("#back").onclick = $("#cancel").onclick = () => location.hash = "#/decks";
      $("#dname").oninput = (e) => draft.name = e.target.value;
      $("#legend").onchange = (e) => {
        setLegend(e.target.value);
        draw();
      };
      if (L) {
        $("#champ").onchange = (e) => {
          draft.champion = e.target.value;
          draw();
        };
        $("#sig").onchange = (e) => {
          draft.signature = e.target.value;
          draw();
        };
        if ($("#runes")) $("#runes").oninput = (e) => {
          draft.runes = { [runeA]: +e.target.value, [runeB]: RULES.RUNE_DECK_SIZE - e.target.value };
          draw();
        };
        app2.querySelectorAll("[data-bset]").forEach((b) => b.onclick = () => {
          bf.set = b.dataset.bset;
          draw();
        });
        app2.querySelectorAll("[data-btype]").forEach((b) => b.onclick = () => {
          bf.type = b.dataset.btype;
          draw();
        });
        $("#bq").oninput = (e) => {
          bf.q = e.target.value;
          draw();
          const n = $("#bq");
          n.focus();
          n.setSelectionRange(n.value.length, n.value.length);
        };
        app2.querySelectorAll(".grid .card").forEach((el) => {
          el.onclick = () => {
            const id = el.dataset.cid;
            draft.cards[id] ? delete draft.cards[id] : draft.cards[id] = 1;
            fixSlots();
            draw();
          };
          el.oncontextmenu = (e) => {
            e.preventDefault();
            showCardModal(getDef(el.dataset.cid));
          };
        });
        app2.querySelectorAll("[data-rm]").forEach((li) => li.onclick = () => {
          delete draft.cards[li.dataset.rm];
          fixSlots();
          draw();
        });
      }
      $("#save").onclick = () => {
        const list = customDecks().filter((d) => d.id !== draft.id);
        saveCustomDecks([...list, { ...draft, premade: false }]);
        location.hash = "#/decks";
      };
    };
    draw();
  }

  // js/engine/game.js
  var clockHour = () => (/* @__PURE__ */ new Date()).getHours();
  function rand(s) {
    s.seed = s.seed + 1831565813 | 0;
    let t = s.seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function createGame({ decks, names = ["You", "AI"], ai = [false, true], seed = Date.now(), firstPlayer = null }) {
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
    decks.forEach((d, i) => s.players.push(buildPlayer(s, d, i, names[i], ai[i])));
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
    return null;
  }
  function hasKeyword(s, inst, kw) {
    const d = getDef(inst.id);
    if ((d.keywords || []).includes(kw)) return true;
    if (kw === "Unstoppable" && d.unstoppableIfTribe) {
      const p = s.players[inst.owner];
      if ([...p.battle, ...p.gear].some((c) => (getDef(c.id).tribes || []).includes(d.unstoppableIfTribe))) return true;
    }
    return inst.mods.some((m) => m.keyword === kw);
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
  function effectiveCost(s, pi, d) {
    const r = d.costReduction;
    if (!r) return d.cost;
    const p = s.players[pi];
    let n = 0;
    if (r.perRunePair) n += Math.min(...r.perRunePair.map((c) => p.mana.filter((x) => x.color === c).length));
    if (r.perGraveTribe) n += p.graveyard.filter((c) => (getDef(c.id).tribes || []).includes(r.perGraveTribe)).length;
    return Math.max(0, d.cost - n);
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
      const dupKey = inst.id + (p.hand.includes(inst) ? "h" : "s");
      if (seen.has(dupKey)) continue;
      seen.add(dupKey);
      for (const m of modeChoices(d)) {
        acts.push(...withTargets(s, pi, d, { type: "play", uid: inst.uid, ...m ? { modes: m } : {} }, k === "spell", "play", m));
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
    return ts.map((t) => ({ ...base, target: t }));
  }
  function activateOptions(s, pi) {
    const p = s.players[pi];
    const acts = [];
    for (const g of [...p.gear, ...p.battle]) {
      const d = getDef(g.id);
      if (!(d.effects || []).some((e) => e.on === "activate")) continue;
      if (d.activateNoTap) {
        if (g.activatedTurn === s.turn) continue;
      } else if (g.tapped || p.battle.includes(g) && !canAttackNow(s, g)) continue;
      if (!canAfford(p, d.activateCost || 0, null)) continue;
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
      for (const t of op.battle) if (t.tapped || party) acts.push({ type: "attack", uid: u.uid, target: { kind: "unit", uid: t.uid } });
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
  var keyOf = (a) => JSON.stringify(a, Object.keys(a).sort()) + JSON.stringify(a.target ?? null) + JSON.stringify(a.uids ?? null) + JSON.stringify(a.modes ?? null);
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
      if (s.winner != null) continue;
      if (s.queue.length && s.queue[0].kind === "shieldify" && !s.players[s.queue[0].player].hand.length) {
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
  var isQueueKind = (pd) => pd.kind === "shieldTrigger" || pd.kind === "shieldify";
  function takeSuspended(s) {
    const x = s.suspended;
    s.suspended = null;
    return x;
  }
  function nextFromQueue(s) {
    s.pending = s.queue.length ? s.queue[0] : takeSuspended(s);
  }
  function setWinner(s, pi, reason) {
    if (s.winner != null) return;
    s.winner = pi;
    s.winReason = reason;
    log(s, pi === -1 ? `Draw \u2014 ${reason}.` : `${s.players[pi].name} wins! ${reason}`);
  }
  function checkDeaths(s) {
    for (const p of s.players) {
      for (const u of [...p.battle]) if (p.battle.includes(u) && power(s, u) <= 0) {
        log(s, `${nm(u)} has 0 Might and is destroyed.`);
        destroyUnit(s, u);
      }
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
      p.hand.push(p.deck.shift());
      return;
    }
    if (p.shields.length) {
      p.hand.push(p.shields.shift());
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
    payCost(s, p, effectiveCost(s, pi, d), d.colors, d.recycle || 0);
    removeFromSource(p, a.uid);
    const k = kindOf(d);
    if (k === "spell" && s.pending && s.pending.kind === "priority") {
      s.stack.push({ inst, controller: pi, target: a.target ?? null, modes: a.modes ?? null });
      log(s, `${p.name} casts ${d.name}${a.target ? " \u2192 " + nm(findInst(s, a.target).inst) : ""} (on the stack).`);
      fireAll(s, pi, "spellCast");
      s.pending.player = other(pi);
      s.pending.passes = 0;
      return;
    }
    putIntoPlay(s, pi, inst, a.target, a.modes);
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
  function putIntoPlay(s, pi, inst, target, modes = null) {
    const p = s.players[pi];
    const d = getDef(inst.id);
    const k = kindOf(d);
    modes = resolveModes(s, pi, d, modes);
    inst.tapped = false;
    inst.mods = [];
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
        const old = p.gear.shift();
        p.graveyard.push(old);
        log(s, `${nm(old)} expires (no free Gear slot).`);
      }
      p.gear.push(inst);
      log(s, `${p.name} equips ${d.name}.`);
      runEffects(s, pi, inst, playEffects(d, modes), target);
    } else {
      log(s, `${p.name} casts ${d.name}${target && findInst(s, target) ? " \u2192 " + nm(findInst(s, target).inst) : ""}.`);
      fireAll(s, pi, "spellCast");
      runTwiceIfDoubled(s, pi, inst, playEffects(d, modes), target);
      finishSpell(p, inst, modes);
    }
  }
  function finishSpell(p, inst, modes) {
    const d = getDef(inst.id);
    const after = (modes || []).map((i) => d.modes?.[i]?.afterCast).find(Boolean) || d.afterCast;
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
    const g = p.gear.find((x) => x.uid === a.uid) || p.battle.find((x) => x.uid === a.uid);
    const d = getDef(g.id);
    payCost(s, p, d.activateCost || 0, null);
    if (d.activateNoTap) g.activatedTurn = s.turn;
    else g.tapped = true;
    log(s, `${p.name} activates ${d.name}.`);
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
        for (let i = 0; i < n && me.shields.length; i++) me.hand.push(me.shields.shift());
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
          if (it.controller === pi || cd.cost > (e.maxCost ?? 99)) continue;
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
          if (!getDef(u.id).token) owner.hand.push(u);
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
          me.hand.push(c);
          log(s, `${me.name} recovers ${nm(c)}.`);
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
        me.hand.push(c);
        shuffle(s, me.deck);
        log(s, `${me.name} searches their deck and takes ${nm(c)}.`);
        break;
      }
      case "token":
        for (let i = 0; i < n; i++) {
          const t = mk(s, e.tokenId, pi);
          t.sick = true;
          me.battle.push(t);
          log(s, `${me.name} creates ${nm(t)}.`);
        }
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
    if (getDef(u.id).escapeOnce && !u.escaped) {
      u.escaped = true;
      u.mods.push({ power: 1 });
      log(s, `${nm(u)} escapes from hell and gains +1 Might!`);
      return;
    }
    owner.battle.splice(i, 1);
    resetInst(u);
    const d = getDef(u.id);
    if (!d.token) owner.graveyard.push(u);
    log(s, `${d.name} is destroyed.`);
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
      p.hand.push(sh);
      const d = getDef(sh.id);
      log(s, `${p.name}'s shield breaks (${p.shields.length} left).`);
      if (p.triggersSealedUntil > s.turn) continue;
      if ((d.keywords || []).includes("Shield Trigger")) s.queue.push({ kind: "shieldTrigger", player: defIdx, uid: sh.uid });
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
        putIntoPlay(s, pi, inst, a.target, a.modes);
      }
    }
    nextFromQueue(s);
  }
  function doShieldify(s, pi, a) {
    const q = s.queue[0];
    const p = s.players[pi];
    const i = p.hand.findIndex((c) => c.uid === a.uid);
    p.shields.push(p.hand.splice(i, 1)[0]);
    log(s, `${p.name} puts a card from hand into their Shield Zone.`);
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
      log(s, `${d.name} resolves.`);
      const modes = resolveModes(s, it.controller, d, it.modes);
      runTwiceIfDoubled(s, it.controller, it.inst, playEffects(d, modes), it.target);
      finishSpell(s.players[it.controller], it.inst, modes);
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
          if (d6 >= roll) continue;
        }
        destroyUnit(s, u);
      }
      return;
    }
    if (c.target.kind === "player" && D.shields.length === 0) {
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
    if (pd.kind === "shieldify") return cheapestHand(s, pi, acts);
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
    if (pd && pd.kind === "shieldify") return cheapestHand(s, pi, acts);
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
  var AI_DELAY = 750;
  var G = null;
  function stopGame() {
    if (G?.timer) clearTimeout(G.timer);
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
    const hour = (/* @__PURE__ */ new Date()).getHours();
    const entry = (d, who) => {
      const L = getDef(d.legend);
      const v = validateDeck(d);
      return `<div class="deck-pick ${pick[who] === d.id ? "on" : ""}" data-who="${who}" data-id="${d.id}">
      ${cardHtml(L, { size: "xs" })}
      <div><b>${esc(d.name)}</b><div class="muted">${L.colors.join(" / ")} \xB7 avg cost ${v.stats.avgCost.toFixed(1)} \xB7 ${d.premade ? "premade" : "custom"}${d.fillers ? ` \xB7 ${d.fillers} filler` : ""}</div></div></div>`;
    };
    app2.innerHTML = `<div class="page">
    <h2>Play against AI</h2>
    <div class="setup">
      <div class="col"><h3>Your deck</h3>${decks.map((d) => entry(d, "me")).join("")}</div>
      <div class="col"><h3>Opponent (AI) deck</h3>
        <div class="deck-pick ${pick.ai === "random" ? "on" : ""}" data-who="ai" data-id="random">
          ${cardBackHtml({ size: "xs", classes: "" }).replace("size-xs", 'size-xs" style="--w:62px')}
          <div><b>Random deck</b><div class="muted">Surprise me</div></div></div>
        ${decks.map((d) => entry(d, "ai")).join("")}</div>
    </div>
    <div class="start-row">
      <button class="primary" id="start" style="font-size:22px;padding:12px 40px">Start</button>
      <span class="muted">Nostalgia Line is ${hour >= 16 && hour < 22 ? '<b style="color:var(--good)">active</b>' : "inactive"} right now (16.00 \u2013 22.00).</span>
    </div></div>`;
    app2.querySelectorAll(".deck-pick").forEach((el) => el.onclick = () => {
      pick[el.dataset.who] = el.dataset.id;
      renderSetup(app2);
    });
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
    app2.innerHTML = `<div class="game">
    <section class="table">
      <div class="hand-row opp">${op.hand.map(() => cardBackHtml({ size: "sm" })).join("")}</div>
      ${playerRow(s, op, false, hl)}
      ${battleRow(s, op, hl)}
      ${midbar(s, legal, ui)}
      ${battleRow(s, me, hl)}
      ${playerRow(s, me, true, hl)}
      <div class="hand-row mine">${me.hand.map((c) => unitCard(s, c, hl, { inHand: true })).join("") || '<span class="muted">Empty hand</span>'}</div>
    </section>
    <aside class="side-panel">
      <div class="preview" id="preview"><span class="muted" style="align-self:center">Hover a card to inspect it \xB7 right-click for details</span></div>
      <div class="log">${s.log.map((l) => `<div class="${l.startsWith("\u2014") ? "turn" : ""}">${esc(l)}</div>`).join("")}</div>
    </aside>
  </div>
  ${triggerOverlay(s, legal, ui)}
  ${winnerOverlay(s)}`;
    const log2 = app2.querySelector(".log");
    if (keepScroll) log2.scrollTop = log2.scrollHeight;
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
      }
      return h;
    }
    if (pd?.kind === "block") legal.filter((a) => a.type === "block").forEach((a) => h.targets.add(a.uid));
    else if (pd?.kind === "shieldify") legal.forEach((a) => h.targets.add(a.uid));
    else if (pd?.kind !== "mulligan") {
      for (const a of legal) {
        if (a.type === "play" || a.type === "activate") h.playable.add(a.uid);
        if (a.type === "attack") h.attackers.add(a.uid);
      }
    }
    if (s.combat) {
      h.attacking = s.combat.attacker;
      h.defending = s.combat.target.uid;
    }
    return h;
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
    const pw = onBoard ? power(s, inst) : void 0;
    const cost = opts.inHand && inst.owner === HUMAN ? effectiveCost(s, inst.owner, d) : void 0;
    const sick = onBoard && !canAttackNow(s, inst) && !inst.tapped && s.active === inst.owner ? '<div class="badge-sick">zZ</div>' : "";
    const uses = inst.uses != null && !opts.inHand ? `<div class="badge-sick" style="top:auto;bottom:30%">${inst.uses} left</div>` : "";
    return cardHtml(d, { size: "sm", mini: true, uid: inst.uid, tapped: inst.tapped && !opts.inHand, power: pw, cost, classes: cls.join(" "), badges: sick + uses });
  }
  function playerRow(s, p, mine, hl) {
    const zone = (label, inner, attrs = "", empty = "") => `<div class="zone ${!inner && empty ? "empty-slot" : ""}" ${attrs} data-empty="${empty}"><span class="lbl">${label}</span>${inner}</div>`;
    const runeArt = G.decks[p.idx].runeArt || {};
    const runeBg = (c) => runeArt[c] && hasDef(runeArt[c]) && getDef(runeArt[c]).image ? `url('${getDef(runeArt[c]).image}') ${COLORS[c]?.hex}` : COLORS[c]?.hex;
    const runes = p.mana.map((r) => `<span class="rune ${r.tapped ? "tapped" : ""} ${runeArt[r.color] ? "art" : ""}" style="background:${runeBg(r.color)}" title="${r.color}${r.tapped ? " (tapped)" : ""}"></span>`).join("");
    const free = p.mana.filter((r) => !r.tapped).length;
    const shieldsTarget = !mine && hl.zoneTargets.has("shield");
    const directTarget = !mine && hl.zoneTargets.has("player");
    const shields = p.shields.length ? `<div class="shields">${p.shields.map(() => cardBackHtml({ size: "sm" })).join("")}</div><div class="stack-pile"><span class="count" style="position:static">${p.shields.length}</span></div>` : '<span class="muted" style="padding:0 8px">No shields!</span>';
    const gy = p.graveyard[p.graveyard.length - 1];
    return `<div class="zone-row">
    <div class="pinfo player-target zone-target ${s.active === p.idx ? "active" : ""} ${directTarget ? "targetable" : ""}" ${!mine ? 'data-zone="player"' : ""}>
      <span class="pname">${mine ? "You" : "AI"}${s.active === p.idx ? " \u25C6" : ""}</span>
      <span class="muted">${esc(p.deckName)}</span>
      <span>Runes <b>${free}</b>/${p.mana.length} \xB7 Mana deck ${p.manaDeck.length}</span>
      <div class="runes">${runes}</div>
    </div>
    ${zone("Legend", unitCard(s, p.legend, hl, { slot: true }))}
    ${zone("Champion", p.championSlot ? unitCard(s, p.championSlot, hl, { slot: true, inHand: true }) : "", "", "played")}
    ${zone("Signature", p.signatureSlot ? unitCard(s, p.signatureSlot, hl, { slot: true, inHand: true }) : "", "", "played")}
    ${zone(`Gear ${p.gear.length}/${RULES.GEAR_SLOTS}`, p.gear.map((g) => unitCard(s, g, hl, { slot: true })).join(""), "", "empty")}
    ${zone("Shields", shields, `data-zone="${mine ? "" : "shield"}"`, "").replace('class="zone', `class="zone zone-target ${shieldsTarget ? "targetable" : ""}`)}
    ${zone("Deck", `<div class="stack-pile">${p.deck.length ? cardBackHtml({ size: "sm" }) : ""}<span class="count">${p.deck.length}</span></div>`)}
    ${zone("Graveyard", `<div class="stack-pile" data-grave="${p.idx}" style="cursor:pointer">${gy ? cardHtml(getDef(gy.id), { size: "sm", mini: true }) : `<div style="width:var(--cw)"></div>`}<span class="count">${p.graveyard.length}</span></div>`)}
  </div>`;
  }
  function battleRow(s, p, hl) {
    return `<div class="battle">${p.battle.map((u) => unitCard(s, u, hl)).join("") || `<span class="empty">${p.idx === HUMAN ? "Your" : "AI's"} Battle Zone</span>`}</div>`;
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
      const t = s.combat.target;
      const tname = t.kind === "unit" ? getDef(findInst(s, t.uid)?.inst.id ?? "").name : t.kind === "shield" ? "a shield" : "the player";
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
      } else if (ui.sel.kind === "mode") {
        prompt2 = `<b>${esc(d.name)}</b> \u2014 choose ${d.chooseModes > 1 ? d.chooseModes : "one"}:`;
        const seen = /* @__PURE__ */ new Set();
        for (const a of ui.sel.options) {
          const key = (a.modes || []).join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          buttons += `<button class="primary" data-mode="${key}">${esc(a.modes.map((i) => d.modes[i].name).join(" + "))}</button>`;
        }
      } else prompt2 = `Choose a target for <b>${esc(d.name)}</b>.`;
      if (ui.sel.kind !== "mode" && ui.sel.options.some((a) => !a.target && a.type !== "attack")) buttons += btn("no-target", "Play without target");
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
    } else if (pd?.kind === "shieldTrigger") {
      prompt2 = "Shield Trigger!";
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
  function act(a) {
    try {
      step(G.s, a);
    } catch (e) {
      toast(e.message);
    }
    G.ui.sel = null;
    render();
  }
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function onHover(e) {
    if (!G) return;
    const el = e.target.closest("[data-cid]");
    const pv = G.app.querySelector("#preview");
    if (!el || !pv || el.closest("#preview")) return;
    const f = el.dataset.uid ? findInst(G.s, el.dataset.uid) : null;
    const d = getDef(el.dataset.cid);
    const pw = f && f.zone === "battle" ? power(G.s, f.inst) : void 0;
    pv.innerHTML = cardHtml(d, { size: "lg", power: pw });
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
    const gy = e.target.closest("[data-grave]");
    if (gy) return showGrave(+gy.dataset.grave);
    if (s.winner != null || whoActs(s) !== HUMAN) return;
    const legal = legalActions(s, HUMAN);
    const zoneEl = e.target.closest("[data-zone]");
    const uidEl = e.target.closest("[data-uid]");
    const uid = uidEl?.dataset.uid;
    if (ui.sel) {
      let a = null;
      if (uid) a = ui.sel.options.find((o) => o.type === "attack" ? o.target.uid === uid : o.target === uid);
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
    if (pd?.kind === "shieldify") {
      const a = legal.find((x) => x.uid === uid);
      return a ? act(a) : null;
    }
    const plays = legal.filter((a) => (a.type === "play" || a.type === "activate") && a.uid === uid);
    if (plays.length) {
      if (plays.length === 1 && !plays[0].target) return act(plays[0]);
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
      case "atk-shield":
        return act(ui.sel.options.find((a) => a.target.kind === "shield"));
      case "atk-player":
        return act(ui.sel.options.find((a) => a.target.kind === "player"));
      case "no-target":
        return act(ui.sel.options.find((a) => !a.target));
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

  // js/app.js
  var app = document.getElementById("app");
  function renderHome() {
    const showcase = ["OGN-001", "OGN-002", "OGN-003", "OGN-004", "TKN-001"].filter(hasDef).map(getDef);
    const fan = showcase.map((d, i) => {
      const rot = (i - (showcase.length - 1) / 2) * 7;
      return cardHtml(d, { size: "md", classes: "fan-card" }).replace('class="card', `style="transform:rotate(${rot}deg) translateY(${Math.abs(rot) * 1.4}px)" class="card`);
    }).join("");
    app.innerHTML = `<section class="home"><div>
    <h1>RIFT MASTERS</h1>
    <div class="tag">Shields, runes &amp; legends \u2014 a duel card game</div>
    <div class="menu">
      <button class="primary" onclick="location.hash='#/play'">Play against AI</button>
      <button onclick="location.hash='#/collection'">Collection</button>
      <button class="ghost" onclick="location.hash='#/decks'">Decks</button>
    </div>
    <div class="fan">${fan}</div>
    <p class="muted" style="margin-top:20px">${allCards().length} cards loaded</p>
  </div></section>`;
  }
  function route() {
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
        return renderDecks(app);
      case "deck":
        return renderBuilder(app, arg || "new");
      default:
        return renderHome();
    }
  }
  loadData().then(() => {
    window.addEventListener("hashchange", route);
    route();
  }).catch((err) => {
    app.innerHTML = `<div class="page"><h2>Could not load card data</h2><p class="muted">${err}</p>
  <p>Serve the folder over HTTP (e.g. <code>python3 -m http.server</code>) \u2014 opening index.html as a file won't work.</p></div>`;
  });
})();
