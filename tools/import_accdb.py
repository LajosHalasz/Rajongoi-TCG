#!/usr/bin/env python3
"""Import the card database (MS Access .accdb) into the game.

    python3 tools/import_accdb.py path/to/RajongoiTCG.accdb

Needs mdbtools (`sudo apt install mdbtools` / `brew install mdbtools`).

Writes:
  data/cards.json  - every card from the OGN + DND tables, plus generated
                     placeholder Legends and neutral "Filler" cards
  data/decks.json  - one premade deck per "Deck of" owner
  data/data.js     - bundled data for the browser

Missing values get provisional numbers (shown with a dashed outline on the card).
Spells/Gear without rules text get a provisional effect from the "Purpose"
column (or from their color). Cards whose text the engine understands get real
logic from CARD_LOGIC below. Finished riftcardmaker cards in data/imported.json
still override these by id (OGN-001 ...).
"""
import csv
import io
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLORS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order']
TYPE_MAP = {
    'unit': ('unit', None), 'champion unit': ('champion', None), 'spell': ('spell', None),
    'gear': ('gear', None), 'legend': ('legend', None),
    'signature spell': ('signature', 'spell'), 'signature unit': ('signature', 'unit'),
    'signature gear': ('signature', 'gear'),
}
KNOWN_KW = {'Shield Trigger', 'Defensive', 'Deathtouch', 'Nostalgia Line', 'Haste', 'Breaker',
            'Action', 'Reaction', 'Party Breaker', 'Slow Start', 'Unstoppable'}

# Game logic for cards whose rules text exists in the database.
CARD_LOGIC = {
    'OGN-007': {'effects': [{'do': 'token', 'tokenId': 'TKN-002', 'tokenName': 'White Pawn'}]},          # Make the first Move
    'OGN-021': {'effects': [{'do': 'tutor', 'kind': 'unit', 'name': 'Emese'}]},                            # Will you Marry Me?
    'OGN-070': {'keywords': ['Slow Start', 'Unstoppable', 'Deflect 2']},                                   # Kálmán Imre Euronight
    'OGN-083': {'effects': [{'do': 'draw', 'amount': 1}], 'afterCast': 'deckTop'},                         # Monad
    'OGN-120': {'effects': [{'on': 'static', 'do': 'buff', 'target': 'allFriendlyUnits', 'amount': 1}]},   # Captain Tingus
    'OGN-124': {'keywords': ['Breaker']},                                                                  # The 5th Angel
    'OGN-143': {'effects': [{'on': 'activate', 'do': 'destroy', 'target': 'enemyUnit', 'filter': {'notType': 'champion'}}]},  # Killer Butt
    'OGN-169': {'effects': [{'on': 'static', 'do': 'mightPerRune', 'color': 'Body', 'amount': 1}]},       # Burning Carbon Hydra
    'OGN-172': {'effects': [{'do': 'destroy', 'target': 'allUnits', 'filter': {'color': 'Chaos'}}]},      # Cowtrix
    'OGN-187': {'effects': [{'do': 'draw', 'amount': 2}]},                                                 # Pot of Greed
    'OGN-193': {'effects': [{'on': 'activate', 'do': 'untap', 'target': 'friendlyUnit'}]},                 # Passive semester
    'OGN-195': {'effects': [{'do': 'channel', 'amount': 1}]},                                              # Hacker Spell
    'OGN-196': {'keywords': ['Breaker']},                                                                  # The FBI
    'OGN-198': {'keywords': ['Action'], 'effects': [{'do': 'tutor', 'kind': 'unit'}]},                     # I know a Somebody
    'OGN-199': {'keywords': ['Breaker']},                                                                  # Somebody
    'DND-021': {'effects': [{'do': 'destroy', 'target': 'allUnits', 'filter': {'notColor': 'Chaos'}}]},   # Ballom
}

def slug(x):
    import unicodedata
    x = ''.join(ch for ch in unicodedata.normalize('NFD', x) if not unicodedata.combining(ch))
    return re.sub(r'[^a-z0-9]+', '-', x.lower()).strip('-')


# Premade decks playable in 'Play vs AI'; every other owner's deck shows as Coming soon.
PLAYABLE_OWNERS = {'Lui'}  # Balu's deck is being reworked

GUIDE_CURVE = {1: 3, 2: 4, 3: 4, 4: 3, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1}


def mdb(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def read_table(db, table):
    rows = list(csv.DictReader(io.StringIO(mdb('mdb-export', db, table))))
    # mdbtools can also return the old, deleted version of a row that was edited
    # (until the database is compacted in Access); the newest version comes last.
    latest = {}
    for r in rows:
        latest[r.get('ID') or id(r)] = r
    return list(latest.values())


def to_int(v):
    v = (v or '').strip()
    return int(v) if re.fullmatch(r'-?\d+', v) else None


def variation(n):
    return (n % 3) - 1  # -1, 0, +1 so provisional costs aren't all identical


def provisional_cost(kind, sig_type, n):
    base = {'unit': 3, 'champion': 4, 'spell': 2, 'gear': 2, 'legend': 0}.get(kind, 3)
    if kind == 'signature':
        base = {'unit': 7, 'gear': 3}.get(sig_type, 6)
    return max(1, base + variation(n)) if kind != 'legend' else 0


def purpose_effect(purpose, kind, cost, colors):
    """Provisional effect for a Spell/Gear without rules text."""
    p = (purpose or '').lower()
    if kind == 'gear':
        if 'draw' in p:
            return {'uses': 3, 'effects': [{'on': 'activate', 'do': 'draw', 'amount': 1}]}
        if 'recycle' in p or 'mana' in p or 'ramp' in p:
            return {'effects': [{'on': 'activate', 'do': 'channel', 'amount': 1, 'tapped': True}], 'uses': 2}
        c = colors[0] if colors else None
        if c in ('Mind', 'Chaos'):
            return {'uses': 3, 'effects': [{'on': 'activate', 'do': 'draw', 'amount': 1}]}
        if c == 'Calm':
            return {'effects': [{'on': 'activate', 'do': 'untap', 'target': 'friendlyUnit'}]}
        return {'effects': [{'on': 'activate', 'do': 'buff', 'target': 'friendlyUnit', 'amount': 1, 'duration': 'turn'}]}

    def has(*words):
        return any(w in p for w in words)
    if has('counter'):
        return {'keywords': ['Reaction'], 'effects': [{'do': 'bounce', 'target': 'enemyUnit'}]}
    if has('aoe', 'shield clear', 'late clear'):
        return {'effects': [{'do': 'destroy', 'target': 'allEnemyUnits', 'maxPower': 4 if has('late') else 2}]}
    if has('removal', 'single clear', 'destroy spell', 'glass cannon'):
        return {'keywords': ['Action'], 'effects': [{'do': 'destroy', 'target': 'enemyUnit', 'maxPower': max(2, cost)}]}
    if has('search'):
        return {'effects': [{'do': 'tutor', 'kind': 'unit'}]}
    if has('token'):
        return {'effects': [{'do': 'token', 'tokenId': 'TKN-001', 'tokenName': 'Black Pawn'}]}
    if has('ramp', 'mana cheat', 'recharge'):
        return {'effects': [{'do': 'channel', 'amount': 1}]}
    if has('draw'):
        return {'effects': [{'do': 'draw', 'amount': 2}]}
    if has('buff', 'first strike', '+2', 'early'):
        return {'keywords': ['Action'], 'effects': [{'do': 'buff', 'target': 'friendlyUnit', 'amount': 3, 'duration': 'turn'}]}
    if has('finisher'):
        eff = [{'do': 'breakShield', 'amount': 1}]
        if cost >= 8:
            eff.insert(0, {'do': 'destroy', 'target': 'allEnemyUnits', 'maxPower': 6})
        return {'effects': eff}
    if has('utility'):
        return {'keywords': ['Reaction' if has('reaction') else 'Action'], 'effects': [{'do': 'draw', 'amount': 1}]}
    c = colors[0] if colors else None
    if c == 'Fury':
        return {'keywords': ['Action'], 'effects': [{'do': 'destroy', 'target': 'enemyUnit', 'maxPower': cost + 1}]}
    if c == 'Chaos':
        return {'effects': [{'do': 'bounce', 'target': 'enemyUnit', 'maxPower': cost + 1}]}
    if c == 'Calm':
        return {'effects': [{'do': 'addShield', 'amount': 1}] if cost >= 3 else [{'do': 'channel', 'amount': 1}]}
    if c == 'Mind':
        return {'effects': [{'do': 'draw', 'amount': 2 if cost >= 4 else 1}]}
    if c == 'Order':
        return {'keywords': ['Reaction'], 'effects': [{'do': 'buff', 'target': 'friendlyUnit', 'amount': cost + 1, 'duration': 'turn'}]}
    if c == 'Body':
        return {'effects': [{'do': 'buff', 'target': 'friendlyUnit', 'amount': 2, 'duration': 'permanent'}]}
    return {'effects': [{'do': 'draw', 'amount': 1}]}


def keywords_from_text(text):
    kws = []
    for m in re.finditer(r'\{([^#}]+)#[^}]*\}', text or ''):
        k = m.group(1).strip()
        if k == 'Double Breaker':
            k = 'Breaker'
        if k in KNOWN_KW and k not in kws:
            kws.append(k)
    if re.search(r'(?<![{\w])Double Breaker', text or '') and 'Breaker' not in kws:
        kws.append('Breaker')
    return kws


def convert(row, set_code):
    n = to_int(row['ID'])
    cid = f'{set_code}-{n:03d}'
    kind, sig_type = TYPE_MAP.get((row['Type'] or '').strip().lower(), ('unit', None))
    colors = [c for c in (row['Color 1'].strip(), row['Color 2'].strip()) if c in COLORS]
    mana, might, recycle = to_int(row['Mana']), to_int(row['Might']), to_int(row['Recycle'])
    acts_as = sig_type or kind
    provisional = []
    if kind != 'legend' and not mana:
        mana = provisional_cost(kind, sig_type, n)
        provisional.append('cost')
        if might == 1:
            might = None  # 0/1/0 are the form's default values
    if acts_as in ('unit', 'champion'):
        if might is None or might <= 0:  # a 0-Might unit would die instantly: treat as not designed yet
            bonus = 2 if kind == 'signature' else (1 if kind == 'champion' or mana <= 3 else 0)
            might = max(1, mana + bonus)
            provisional.append('might')
    else:
        might = 0
    text = (row['Description'] or '').strip()
    owners = [o.strip() for o in (row['Deck of'] or '').split('/') if o.strip()]
    card = {
        'id': cid, 'set': set_code, 'number': f'{n:03d}', 'setInfo': f'{set_code} {n:03d}/300',
        'name': row['Name'].strip(), 'type': kind, 'colors': colors,
        'cost': mana or 0, 'power': might, 'recycle': recycle or 0,
        'keywords': keywords_from_text(text), 'effects': [],
        'tribes': [row['Tag'].strip()] if row['Tag'].strip() else [],
        'text': text, 'flavor': (row['Flavour Text'] or '').strip(),
        'owners': owners, 'purpose': (row['Purpose'] or '').strip(), 'wip': row['FLAG'] == '1',
    }
    if sig_type:
        card['sigType'] = sig_type
    if row['Shield Trigger'] == '1' and 'Shield Trigger' not in card['keywords']:
        card['keywords'].insert(0, 'Shield Trigger')
    if provisional:
        card['provisional'] = provisional
    # rarity (the database has none): Signatures epic, Legends and Champions rare,
    # expensive cards uncommon, the rest common. Finished cards override this.
    card['rarity'] = ('rare' if kind == 'legend' else 'epic' if kind == 'signature' else 'rare' if kind == 'champion'
                      else 'uncommon' if card['cost'] >= 4 else 'common')
    logic = CARD_LOGIC.get(cid)
    if logic:
        for k, v in logic.items():
            if k == 'keywords':
                card['keywords'] += [x for x in v if x not in card['keywords']]
            else:
                card[k] = v
    elif not text and acts_as in ('spell', 'gear'):
        pe = purpose_effect(card['purpose'], acts_as, card['cost'], colors)
        card['keywords'] += [x for x in pe.pop('keywords', []) if x not in card['keywords']]
        card.update(pe)
        card['provisionalEffect'] = True
    return card


def base(name):
    return re.split(r'[|,]', name)[0].strip()


def champ_keys(c):
    """Names a Champion may share with its Legend: the part before "|" ("Lui | Miniature Painter")
    and, on finished cards, the subname ("Miniature Painter" / "Lui")."""
    keys = {base(c['name']).strip().lower()}
    if c.get('subname'):
        keys.add(c['subname'].strip().lower())
    return keys


def norm(name):
    import unicodedata
    n = unicodedata.normalize('NFD', re.split(r'[|,(]', name or '')[0])
    return re.sub(r'[^a-z0-9]', '', ''.join(ch for ch in n if not unicodedata.combining(ch)).lower())


def load_json(rel, default):
    path = os.path.join(ROOT, 'data', rel)
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)


def similar(a, b):
    import difflib
    a, b = norm(a), norm(b)
    return bool(a and b) and (a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.75)


def merged(db_card, imp):
    """Same rule as mergeSources() in js/engine/cards.js."""
    m = {**db_card, **imp}
    if db_card.get('type') == 'signature' and imp.get('type') in ('unit', 'spell', 'gear'):
        m['type'] = db_card['type']
        if db_card.get('sigType'):
            m['sigType'] = db_card['sigType']
    for k in ('provisional', 'provisionalEffect', 'placeholder'):
        m.pop(k, None)
    m['wip'] = False
    return m


def renumber_collisions(cards, imported):
    """A finished card printed with a number the database uses for a different card wins that id;
    the database row moves to the next free number of its set."""
    by_id = {c['id']: c for c in cards}
    used = defaultdict(set)
    for c in cards:
        used[c['set']].add(int(c['number']))
    def flat(x):
        return norm(x) if '|' not in (x or '') else re.sub(r'[^a-z0-9]', '', (x or '').lower())

    def same_stats(db, imp):
        fam = lambda t: 'unit' if t in ('unit', 'champion', 'token') else t
        return fam(db['type']) == fam(imp['type']) and db['cost'] == imp.get('cost') and sorted(db['colors']) == sorted(imp.get('colors', []))

    def same(db, imp):
        a = {norm(db['name'])} | {re.sub(r'[^a-z0-9]', '', p.lower()) for p in db['name'].split('|')}
        b = {norm(imp['name'])}
        if imp.get('subname'):
            b |= {re.sub(r'[^a-z0-9]', '', (imp['subname'] + imp['name']).lower())}
        return any(similar(x, y) or (min(len(x), len(y)) >= 6 and (x.startswith(y) or y.startswith(x))) for x in a for y in b if x and y)

    for imp in imported:
        db = by_id.get(imp['id'])
        if not db or same(db, imp) or same_stats(db, imp):
            continue
        n = max(used[db['set']]) + 1
        used[db['set']].add(n)
        new_id = f"{db['set']}-{n:03d}"
        print(f"  renumbered {db['id']} \"{db['name']}\" -> {new_id} (its number is used by \"{imp['name']}\")")
        db.update(id=new_id, number=f'{n:03d}', setInfo=f"{db['set']} {n:03d}/300")
        by_id[new_id] = db


def build_decks(cards, imported, overrides):
    imp_by_id = {c['id']: c for c in imported}
    view = []
    for c in cards:
        m = merged(c, imp_by_id[c['id']]) if c['id'] in imp_by_id else dict(c)
        m.update(overrides.get(c['id'], {}))
        m['_src'] = c
        view.append(m)
    real_legends = {}
    for c in imported:
        if c.get('type') == 'legend' and c['id'] not in {x['id'] for x in cards}:
            for o in c.get('owners', []):
                real_legends[o.lower()] = {**c, **overrides.get(c['id'], {})}
    cards = view
    by_owner = defaultdict(list)
    for c in cards:
        if c['set'] == 'OGN' and c['type'] != 'legend':
            for o in c['owners']:
                by_owner[o].append(c)
    legends, decks, report = [], [], []
    for i, (owner, own) in enumerate(sorted(by_owner.items()), 1):
        counts = Counter(col for c in own for col in c['colors'])
        lcolors = [c for c, _ in counts.most_common(2)] or ['Mind']
        champs = [c for c in own if c['type'] == 'champion']
        real = real_legends.get(owner.lower())
        if real:
            lcolors = real['colors']
            names = [base(real['name']).lower(), (real.get('subname') or '').lower()] + [n.lower() for n in real.get('championNames', [])]
            names = [n for n in names if n]
            lbase = real.get('subname') or base(real['name'])
            legend = {'id': real['id']}
            ok_champ = lambda c, names=names: bool(champ_keys(c) & set(names))
        else:
            # the placeholder Legend is named after the deck's owner ("Varon | Legend"); the owner's
            # Champions belong to it even when they are other people ("Emese | Borsó" in Varon's deck)
            lbase = owner
            cnames = sorted({base(c['name']) for c in champs if owner.lower() not in champ_keys(c)})
            names = {owner.lower(), *(n.lower() for n in cnames)}
            ok_champ = lambda c, names=names: bool(champ_keys(c) & names)
        legend = legend if real else {
            'id': f'OGN-L-{slug(owner)}', 'set': 'OGN', 'number': f'L-{slug(owner)}', 'setInfo': f'OGN Legend',
            'name': f'{lbase} | Legend', 'type': 'legend', 'colors': lcolors, 'cost': 0, 'power': 0,
            'recycle': 0, 'keywords': [], 'effects': [], 'tribes': [owner], 'owners': [owner],
            'text': f"{{Placeholder Legend#7A7A7A}}__(The real Legend of {owner}'s deck is coming soon.)__",
            'flavor': '', 'placeholder': True, **({'championNames': cnames} if cnames else {}),
        }
        if not real:
            legends.append(legend)
        legal = [c for c in own if all(col in lcolors for col in c['colors'])]
        dropped = [c['name'] for c in own if c not in legal]
        for c in legal:
            if c['type'] == 'signature':
                c['_src']['legend'] = legend['id']  # signature belongs to this owner's Legend
                c['legend'] = legend['id']
        ch = sorted([c for c in legal if c['type'] == 'champion'],
                    key=lambda c: (not ok_champ(c), 'cost' in c.get('provisional', [])))[:3]
        sg = [c for c in legal if c['type'] == 'signature'][:2]
        rest = sorted([c for c in legal if c['type'] not in ('champion', 'signature')],
                      key=lambda c: (bool(c.get('provisional')), c['wip']))
        picked = ch + sg + rest
        if len(picked) > 20:
            dropped += [c['name'] for c in picked[20:]]
            picked = picked[:20]
        # no filler cards: a deck with fewer than 20 of its own cards simply stays short (and locked)
        added = 0
        champ_slot = next((c for c in ch if ok_champ(c)), None)
        runes = {lcolors[0]: 12} if len(lcolors) == 1 else {lcolors[0]: 6, lcolors[1]: 6}
        rune_art = {}
        for c in sorted(imported, key=lambda c: not c.get('fullArtRune')):  # regular runes win
            if c.get('type') == 'rune' and c.get('image') and c['colors'] \
                    and owner.lower() in [o.lower() for o in c.get('owners', [])]:
                rune_art[c['colors'][0]] = c['id']
        decks.append({
            'id': f'ogn-{re.sub(r"[^a-z0-9]+", "-", owner.lower())}', 'name': f"{owner}'s deck", 'premade': True,
            'owner': owner, 'legend': legend['id'], 'champion': champ_slot['id'] if champ_slot else None,
            'signature': sg[0]['id'] if sg else None, 'cards': {c['id']: 1 for c in picked}, 'runes': runes,
            **({'runeArt': rune_art} if rune_art else {}),
            **({} if owner in PLAYABLE_OWNERS else {'comingSoon': True}),
        })
        report.append(f"  {owner:8s} {'/'.join(lcolors):12s} own {len(own):2d}  used {len(picked) - added:2d}  fillers {added:2d}"
                      + (f"  dropped: {', '.join(dropped)}" if dropped else ''))
    legends_extra, decks_extra = extra_decks(cards, real_legends)
    return legends + legends_extra, decks + decks_extra, report


# Decks that don't come from the database's "Deck of" column.
#   Emese: her own deck (separate from Varon's), placeholder Legend until her cards exist.
#   Lutheria: the DnD DLC deck around the Lutheria Legend (DND-017), from the DND cards in her colors.
EXTRA_DECKS = [
    {'owner': 'Emese', 'colors': ['Body', 'Order']},
    {'owner': 'Lutheria', 'set': 'DND', 'legend': 'DND-017'},
]


def extra_decks(cards, real_legends):
    legends, decks = [], []
    for x in EXTRA_DECKS:
        owner = x['owner']
        real = real_legends.get(owner.lower())
        if real:
            lid, lcolors = real['id'], real['colors']
        else:
            lid, lcolors = f'OGN-L-{slug(owner)}', x['colors']
            legends.append({
                'id': lid, 'set': 'OGN', 'number': f'L-{slug(owner)}', 'setInfo': 'OGN Legend',
                'name': f'{owner} | Legend', 'type': 'legend', 'colors': lcolors, 'cost': 0, 'power': 0,
                'recycle': 0, 'keywords': [], 'effects': [], 'tribes': [owner], 'owners': [owner],
                'text': f"{{Placeholder Legend#7A7A7A}}__(The real Legend of {owner}'s deck is coming soon.)__",
                'flavor': '', 'placeholder': True,
            })
        picked = []
        if x.get('set'):
            legal = [c for c in cards if c['set'] == x['set'] and c['type'] != 'legend' and c['colors']
                     and all(col in lcolors for col in c['colors'])]
            own = [c for c in legal if c['type'] == 'champion' and owner.lower() in champ_keys(c)]
            picked = (own + [c for c in legal if c['type'] != 'champion'])[:20]
        champ = next((c for c in picked if c['type'] == 'champion'), None)
        decks.append({
            'id': f"{(x.get('set') or 'OGN').lower()}-{slug(owner)}", 'name': f"{owner}'s deck", 'premade': True,
            'owner': owner, 'legend': lid, 'champion': champ['id'] if champ else None, 'signature': None,
            'cards': {c['id']: 1 for c in picked},
            'runes': {lcolors[0]: 6, lcolors[1]: 6} if len(lcolors) > 1 else {lcolors[0]: 12},
            'comingSoon': True,
        })
    return legends, decks


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    db = sys.argv[1]
    tables = [t for t in mdb('mdb-tables', '-1', db).splitlines() if t.strip()]
    cards = []
    for t in tables:
        code = re.match(r'\s*([A-Za-z]+)', t).group(1).upper()
        rows = read_table(db, t)
        cards += [convert(r, code) for r in rows if to_int(r['ID']) is not None and r['Name'].strip()]
        print(f'{t!r}: {len(rows)} rows -> set {code}')
    imported = load_json('imported.json', [])
    overrides = {k: v for k, v in load_json('effects.json', {}).items() if not k.startswith('_')}
    renumber_collisions(cards, imported)
    legends, decks, report = build_decks(cards, imported, overrides)
    # tokens come from data/imported.json (riftcardmaker exports)
    all_cards = sorted(cards + legends, key=lambda c: (c['set'], c['number']))
    with open(os.path.join(ROOT, 'data', 'cards.json'), 'w') as f:
        json.dump(all_cards, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, 'data', 'decks.json'), 'w') as f:
        json.dump(decks, f, ensure_ascii=False, indent=2)
    prov = sum(1 for c in cards if c.get('provisional'))
    peff = sum(1 for c in cards if c.get('provisionalEffect'))
    print(f'{len(cards)} cards ({prov} with provisional numbers, {peff} with provisional effects), '
          f'{len(legends)} placeholder Legends, {len(decks)} decks:')
    print('\n'.join(report))
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'build-data.mjs')], check=True)


if __name__ == '__main__':
    main()
