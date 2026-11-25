"""Add raga and variant identity to the master database, in place: one file, one row per source row.

Every master row gets a Raga ID and a Variant ID plus the columns that describe them, and the file is sorted so a raga's rows
sit together (raga, then variant, then source). Nothing is deleted or merged away: all rows stay, and Master ID is unchanged.

RAGA      one identity: a name inside a parent melakarta (melakarta rows: the mela number). Names are merged only with more
          evidence than the scale:
            - a source states one name as the other's alias (Pravagam's `Rasali (Karjavali)`, Nerur's equivalences), or
            - the names are 0.92+ alike (spelling folded), or 0.86+ alike and the two ragas share a scale, or 0.86+ alike and
              their closest scales are within 2 swaras of each other (a similar name and a near scale);
          and never when any single source lists both as separate entries (the veto). For the 0.86 tiers names are also compared
          after folding vowel variants (au/ow/ou, ai/ei/ey) and voicing (k/g, t/d, p/b, c/j, s/z, zh/l); a pair that only reaches
          0.86 through those folds still needs a shared or near scale, so the folds alone never merge two names.
          Scale alone never merges anything. Ragas with the same scale in one mela share a Scale Twin Group.
MULTI-PARENT  the same name and the same scale listed under different melas is one raga with several parents (Multi-Parent Group).
VARIANT   one distinct scale of a raga (aroha + avaroha pitch-set binary and note orders). Different scales stay separate variants.

Run after build_master_from_clean.py. Safe to re-run: it removes its own columns first.
"""
import collections, csv, difflib, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from find_duplicate_candidates import fold, signature  # noqa: E402
from build_merged_ragas import core_tokens, edit_distance  # noqa: E402

BASE = os.path.join(HERE, '..', 'raga lists')
MASTER = os.path.join(BASE, 'ALL-SOURCE-ROWS-carnatic-raga-database.csv')
NERUR_EQ = os.path.join(HERE, '..', 'data', 'nerur-raga-equivalencies.csv')

NAME_PRIORITY = ['WIKIPEDIA', 'MUSICLEGATO', 'RAGA-OF-THE-WEEK', 'NERUR', 'PASTED', 'ROYAL-CARPET', 'PRAVAGAM']
SCALE_PRIORITY = ['NERUR', 'MUSICLEGATO', 'WIKIPEDIA', 'RAGA-OF-THE-WEEK', 'ROYAL-CARPET', 'PASTED', 'PRAVAGAM']   # digit-bearing sources first
ADDED = ['Raga ID', 'Variant ID', 'Raga Type', 'Raga Name (Merged)', 'Parent Melakarta Raga ID', 'Raga All Names', 'Raga Alias Names',
         'Raga Sources', 'Raga Source Count', 'Raga Rows', 'Raga Variants', 'Names Merged On', 'Similar Names Not Merged',
         'Same Name Under Other Melas', 'Variant Sources', 'Variant Source Count', 'Variant Rows', 'Variant Confirmed By 2+ Sources',
         'Scale Twin Group', 'Ragas Sharing This Scale', 'Multi-Parent Group', 'Also Listed Under Melas']
CRLF = chr(13) + chr(10)   # the CLEAN lists and the master use Windows line endings
MERGE_HIGH = 0.92          # names this alike merge on spelling alone
MERGE_WITH_SCALE = 0.86    # ...or this alike if the two ragas share a scale
NEAR_SCALE = 2             # ...or this alike if their closest scales are within this many swaras
SIMILAR = 0.86             # listed as a similar name when not merged


def split_name(raw):
    """-> (main name, [alias names]). Drops the (Raga n) variant tag and {Hindustani}-style braces; a parenthetical is an alias."""
    base = re.sub(r'\s*\(Raga \d+\)\s*$', '', raw)
    base = re.sub(r'\{[^}]*\}', ' ', base).replace('+', ' ')
    m = re.match(r'^\((?P<a>[^)]*)\)\s*(?P<rest>.+)$', base)
    if m:
        return m.group('rest').strip(), [(m.group('a') + ' ' + m.group('rest')).strip()]
    aliases = [p.strip() for p in re.findall(r'\(([^)]*)\)', base) if len(re.sub(r'[^A-Za-z]', '', p)) >= 4]
    return re.sub(r'\s*\([^)]*\)', '', base).strip(), aliases


def fold_more(key):
    """Extra folding for comparing Tamil/Sanskrit transliterations: diphthongs and voiced/unvoiced consonants."""
    k = re.sub(r'(au|ou|ow|aw)', 'o', key)
    k = re.sub(r'(ei|ey|ai)', 'e', k)
    k = k.replace('zh', 'l').replace('ks', 'x').replace('kx', 'x')
    k = k.translate(str.maketrans({'g': 'k', 'd': 't', 'b': 'p', 'j': 'c', 'z': 's', 'f': 'p'}))
    return re.sub(r'(.)', r'', k)


def name_key(s):
    return fold(re.sub(r'[^a-z]', '', __import__('unicodedata').normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode()))


def main():
    with open(MASTER, encoding='utf-8', newline='') as f:
        rd = csv.DictReader(f)
        base_fields = [c for c in rd.fieldnames if c not in ADDED]
        rows = [{k: v for k, v in r.items() if k not in ADDED} for r in rd]
    order = {s: i for i, s in enumerate(NAME_PRIORITY)}
    sorder = {s: i for i, s in enumerate(SCALE_PRIORITY)}

    # ---- 1. initial groups: (type, mela, name key); melakarta rows by mela number
    groups = collections.defaultdict(list)
    for r in rows:
        main_name, aliases = split_name(r['Raga Name'])
        r['_main'], r['_aliases'] = main_name, aliases
        if r['Row Type'] == 'Melakarta':
            key = ('M', r['Melakarta Number'], '')
        else:
            key = ('J', r['Melakarta Number'], name_key(main_name))
        r['_gkey'] = key
        groups[key].append(r)
    gsources = {k: {r['Source List'] for r in v} for k, v in groups.items()}
    gsigs = {k: {signature(r) for r in v if r['Scale Check'] == 'ok'} for k, v in groups.items()}
    gscales = {k: {(tuple(core_tokens(r['Aroha'])), tuple(core_tokens(r['Avaroha']))) for r in v if r['Scale Check'] == 'ok'} for k, v in groups.items()}

    def scale_distance(a, b):
        best = 99
        for xa, xv in gscales[a]:
            for ya, yv in gscales[b]:
                best = min(best, edit_distance(xa, ya) + edit_distance(xv, yv))
        return best

    # ---- 2. candidate merges inside each mela
    edges = []            # (rank, -ratio, key a, key b, evidence)
    similar = collections.defaultdict(set)
    by_mela = collections.defaultdict(list)
    for k in groups:
        if k[0] == 'J':
            by_mela[k[1]].append(k)
    alias_extra = collections.defaultdict(set)      # group -> alias names with no group of their own
    for k, v in groups.items():
        if k[0] != 'J':
            continue
        for r in v:
            for al in r['_aliases']:
                ak = ('J', k[1], name_key(al))
                if ak == k or not ak[2]:
                    continue
                if ak in groups:
                    edges.append((0, 0.0, k, ak, 'alias stated by a source'))
                alias_extra[k].add(al)
    try:
        with open(NERUR_EQ, encoding='utf-8-sig', newline='') as f:
            eq = [(name_key(r['Raga Name']), name_key(r['Equivalent To'])) for r in csv.DictReader(f)]
    except OSError:
        eq = []
    for a_key, b_key in eq:
        for mela, ks in by_mela.items():
            ka, kb = ('J', mela, a_key), ('J', mela, b_key)
            if ka in groups and kb in groups:
                edges.append((0, 0.0, ka, kb, 'alias stated by a source'))
    for mela, ks in by_mela.items():
        for i, a in enumerate(ks):
            for b in ks[i + 1:]:
                plain = difflib.SequenceMatcher(None, a[2], b[2]).ratio()
                ratio = max(plain, difflib.SequenceMatcher(None, fold_more(a[2]), fold_more(b[2])).ratio())
                if ratio < SIMILAR:
                    continue
                share = bool(gsigs[a] & gsigs[b])
                if plain >= MERGE_HIGH:
                    edges.append((1, -ratio, a, b, 'spelling (%.2f)' % ratio))
                elif share:
                    edges.append((2, -ratio, a, b, 'spelling (%.2f) and a shared scale' % ratio))
                elif scale_distance(a, b) <= NEAR_SCALE:
                    edges.append((3, -ratio, a, b, 'similar name and a near scale (%.2f)' % ratio))
                else:
                    similar[a].add(b); similar[b].add(a)

    # ---- 3. union-find with the veto: two ragas never merge if a source has an entry in both
    parent = {k: k for k in groups}
    comp_sources = {k: set(gsources[k]) for k in groups}
    evidence = collections.defaultdict(set)
    vetoed = 0

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for rank, nr, a, b, why in sorted(edges, key=lambda e: (e[0], e[1], min(e[2], e[3]), max(e[2], e[3]), e[4])):   # the same order whichever way a pair was written
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        if comp_sources[ra] & comp_sources[rb]:
            vetoed += 1
            similar[a].add(b); similar[b].add(a)
            continue
        parent[rb] = ra
        comp_sources[ra] |= comp_sources[rb]
        evidence[ra] |= evidence[rb] | {why.split(' (')[0]}

    comps = collections.defaultdict(list)
    for k in groups:
        comps[find(k)].append(k)

    # ---- 4. raga records
    def disp_name(rows_):
        best = sorted(rows_, key=lambda r: (order.get(r['Source List'], 9), -sum(1 for x in rows_ if x['_main'] == r['_main']), r['_main']))
        return best[0]['_main']

    ragas = []
    for root, gks in comps.items():
        rs = [r for gk in gks for r in groups[gk]]
        is_mela = root[0] == 'M'
        primary = disp_name(rs) if not is_mela else disp_name(rs)
        ragas.append({'root': root, 'gks': gks, 'rows': rs, 'type': 'Melakarta' if is_mela else 'Janya',
                      'mela': root[1], 'primary': primary})
    for g in ragas:
        g['gks'].sort()
    ragas.sort(key=lambda g: (int(g['mela']) if g['mela'].isdigit() else 999, 0 if g['type'] == 'Melakarta' else 1, name_key(g['primary']), g['gks'][0]))
    rid_of_group = {}
    for i, g in enumerate(ragas, 1):
        g['id'] = 'R%05d' % i
        for gk in g['gks']:
            rid_of_group[gk] = g['id']
    mela_rid = {g['mela']: g['id'] for g in ragas if g['type'] == 'Melakarta'}
    by_fold_name = collections.defaultdict(set)
    for g in ragas:
        if g['type'] == 'Janya':
            for gk in g['gks']:
                by_fold_name[gk[2]].add(g['id'])

    # ---- 5. variants
    variants = []
    scale_twin = collections.defaultdict(set)       # (mela, signature) -> raga ids
    for g in ragas:
        by_sig = collections.defaultdict(list)
        for r in g['rows']:
            by_sig[signature(r) if r['Scale Check'] == 'ok' else ('none',)].append(r)
        ordered = sorted(by_sig.items(), key=lambda kv: (kv[0] == ('none',), -len({r['Source List'] for r in kv[1]}), -len(kv[1]), kv[0]))
        for n, (sig, vr) in enumerate(ordered, 1):
            rep = sorted(vr, key=lambda r: (sorder.get(r['Source List'], 9), r['Master ID']))[0]
            texts = collections.Counter((r['Aroha'], r['Avaroha']) for r in vr)
            v = {'id': '%s-V%d' % (g['id'], n), 'raga': g, 'sig': sig, 'rows': vr, 'rep': rep, 'texts': texts}
            variants.append(v)
            g.setdefault('variants', []).append(v)
            if sig != ('none',):
                scale_twin[(g['mela'], sig)].add(g['id'])
    # ---- 5b. the same name and scale under different melas: one raga with several parents
    mp_parent = {g['id']: g['id'] for g in ragas if g['type'] == 'Janya'}

    def mp_find(x):
        while mp_parent[x] != x:
            mp_parent[x] = mp_parent[mp_parent[x]]
            x = mp_parent[x]
        return x

    seen_ns = {}
    for g in ragas:
        if g['type'] != 'Janya':
            continue
        for gk in g['gks']:
            for v in g['variants']:
                if v['sig'] == ('none',):
                    continue
                key = (gk[2], v['sig'])
                if key in seen_ns and seen_ns[key][1] != g['mela']:
                    mp_parent[mp_find(g['id'])] = mp_find(seen_ns[key][0])
                seen_ns.setdefault(key, (g['id'], g['mela']))
    mp_members = collections.defaultdict(list)
    for g in ragas:
        if g['type'] == 'Janya':
            mp_members[mp_find(g['id'])].append(g)
    mp_id, mp_melas = {}, {}
    for n, root in enumerate(sorted(r for r, m in mp_members.items() if len({x['mela'] for x in m}) > 1), 1):
        for g in mp_members[root]:
            mp_id[g['id']] = 'F%05d' % n
            mp_melas[g['id']] = sorted({x['mela'] for x in mp_members[root]} - {g['mela']}, key=lambda m: int(m) if m.isdigit() else 999)
    twin_ids = {}
    for n, k in enumerate(sorted(k for k, v in scale_twin.items() if len(v) > 1), 1):
        twin_ids[k] = 'T%05d' % n

    # ---- 6. write the enriched master: one row per source row, sorted raga -> variant -> source
    def srcs(rs):
        return sorted({r['Source List'] for r in rs}, key=lambda s: order.get(s, 9))

    info = {}
    for gi, g in enumerate(ragas):
        names = sorted({r['_main'] for r in g['rows']}, key=lambda x: (x.lower() != g['primary'].lower(), x.lower(), x))
        aliases = sorted({a for gk in g['gks'] for a in alias_extra.get(gk, set())})
        sim = sorted({rid_of_group[k] for gk in g['gks'] for k in similar.get(gk, set())} - {g['id']})
        other = sorted(by_fold_name.get(g['gks'][0][2], set()) - {g['id']}) if g['type'] == 'Janya' else []
        gsrc = srcs(g['rows'])
        g['info'] = {'Raga ID': g['id'], 'Raga Type': g['type'], 'Raga Name (Merged)': g['primary'],
                     'Parent Melakarta Raga ID': '' if g['type'] == 'Melakarta' else mela_rid.get(g['mela'], ''),
                     'Raga All Names': ' | '.join(names), 'Raga Alias Names': ' | '.join(aliases), 'Raga Sources': ', '.join(gsrc),
                     'Raga Source Count': len(gsrc), 'Raga Rows': len(g['rows']), 'Raga Variants': len(g['variants']),
                     'Names Merged On': ', '.join(sorted(evidence.get(g['root'], set()))), 'Similar Names Not Merged': ' '.join(sim[:8]),
                     'Same Name Under Other Melas': ' '.join(other[:8])}
        g['index'] = gi
    out_rows = []
    for v in variants:
        g, vr, sig = v['raga'], v['rows'], v['sig']
        vs = srcs(vr)
        key = (g['mela'], sig)
        common = dict(g['info'])
        common.update({'Multi-Parent Group': mp_id.get(g['id'], ''), 'Also Listed Under Melas': ' '.join(mp_melas.get(g['id'], []))})
        common.update({'Variant ID': v['id'], 'Variant Sources': ', '.join(vs), 'Variant Source Count': len(vs), 'Variant Rows': len(vr),
                       'Variant Confirmed By 2+ Sources': 'yes' if len(vs) >= 2 else 'no',
                       'Scale Twin Group': twin_ids.get(key, ''), 'Ragas Sharing This Scale': len(scale_twin[key]) if key in twin_ids else ''})
        vnum = int(v['id'].rsplit('-V', 1)[1])
        for r in vr:
            row = {k: r[k] for k in base_fields}
            row.update(common)
            out_rows.append(((g['index'], vnum, sorder.get(r['Source List'], 9), r['Master ID']), row))
    out_rows.sort(key=lambda t: t[0])
    lead = ['Raga ID', 'Variant ID', 'Raga Type', 'Raga Name (Merged)']
    tail = [c for c in ADDED if c not in lead]
    fields = [base_fields[0]] + lead + base_fields[1:] + tail
    with open(MASTER, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator=CRLF)
        w.writeheader()
        w.writerows(row for _, row in out_rows)
    link = {row['Master ID'] for _, row in out_rows}

    jan = [g for g in ragas if g['type'] == 'Janya']
    print('master rows %d | ragas %d (%d melakarta, %d janya) | variants %d | rows written %d' % (len(rows), len(ragas), len(ragas) - len(jan), len(jan), len(variants), len(link)))
    print('janya ragas in 2+ sources: %d | in 1 source: %d' % (sum(1 for g in jan if len({r['Source List'] for r in g['rows']}) >= 2),
                                                               sum(1 for g in jan if len({r['Source List'] for r in g['rows']}) < 2)))
    print('name groups before merging: %d | merged into fewer ragas: %d groups | vetoed merges: %d' % (
        sum(1 for k in groups if k[0] == 'J'), sum(1 for g in jan if len(g['gks']) > 1), vetoed))
    print('merge evidence:', dict(collections.Counter(e for g in ragas for e in evidence.get(g['root'], set()))))
    print('scale twin groups (2+ ragas share a scale in one mela): %d' % len(twin_ids))
    return ragas, variants


if __name__ == '__main__':
    main()
