"""Find ragas that are likely duplicates across sources in the master database. Read-only: nothing in the master is changed.

Three views of the same rows, each with its own group id so they can be filtered against each other:

  Name group    same melakarta + same name (spelling folded).             Groups the versions of one raga inside a parent mela.
  Scale group   same pitch-set binary + note order, aroha and avaroha.    Global (any mela, any name): finds synonyms and twins.
  Same-raga     same melakarta + same name + same scale.                   The strong duplicate: name and scale both agree.
  cluster

Spelling folding (Name Key is already lower-case ASCII letters): doubled vowels and the usual transliteration pairs are
collapsed (aa->a, ee->i, sh->s, th->t, dh->d, bh->b, ch->c, w->v, y->i, doubled letters) so `Karmukhavati`,
`Karmukhavathi` and `kArmukhavati` meet. The scale signature is `Aroha Pitch Binary + Aroha Note Order + Avaroha Pitch
Binary + Avaroha Note Order`; it ignores octave, so a raga's scale twins with other ragas are expected.

Outputs (raga lists/): duplicate-candidates.csv (one row per master row that shares a group with another row) and
duplicate-name-groups.csv (one row per name group with 2+ sources: do the sources agree on the scale?).
"""
import collections, csv, os, re

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'raga lists')
MASTER = os.path.join(BASE, 'ALL-SOURCE-ROWS-carnatic-raga-database.csv')
OUT_ROWS = os.path.join(BASE, 'duplicate-candidates.csv')
OUT_GROUPS = os.path.join(BASE, 'duplicate-name-groups.csv')

FOLD = (('sh', 's'), ('th', 't'), ('dh', 'd'), ('kh', 'k'), ('gh', 'g'), ('bh', 'b'), ('ph', 'p'), ('ch', 'c'), ('zh', 'l'), ('w', 'v'), ('y', 'i'))


def fold(key):
    k = re.sub(r'aa', 'a', key)
    k = re.sub(r'ee', 'i', k)
    k = re.sub(r'oo', 'u', k)
    k = re.sub(r'ii', 'i', k)
    k = re.sub(r'uu', 'u', k)
    for a, b in FOLD:
        k = k.replace(a, b)
    return re.sub(r'(.)\1', r'\1', k)


def signature(r):
    return (r['Aroha Pitch Binary'], r['Aroha Note Order'], r['Avaroha Pitch Binary'], r['Avaroha Note Order'])


def main():
    with open(MASTER, encoding='utf-8', newline='') as f:
        rows = [r for r in csv.DictReader(f) if r['Scale Check'] == 'ok']
    for r in rows:
        r['_fold'] = fold(r['Name Key'])
        r['_sig'] = signature(r)

    name_g = collections.defaultdict(list)     # mela + folded name
    scale_g = collections.defaultdict(list)    # global signature
    same_g = collections.defaultdict(list)     # mela + folded name + signature
    for r in rows:
        if r['Melakarta Number']:
            name_g[(r['Melakarta Number'], r['_fold'])].append(r)
            same_g[(r['Melakarta Number'], r['_fold'], r['_sig'])].append(r)
        scale_g[r['_sig']].append(r)

    ids = {}
    for label, g in (('N', name_g), ('S', scale_g), ('D', same_g)):
        for n, k in enumerate(sorted(k for k, v in g.items() if len(v) > 1), 1):
            ids[(label, k)] = '%s%05d' % (label, n)

    def sources(v):
        return len({r['Source List'] for r in v})

    out = []
    for r in rows:
        nk = (r['Melakarta Number'], r['_fold'])
        sk = r['_sig']
        dk = (r['Melakarta Number'], r['_fold'], r['_sig'])
        n_v = name_g.get(nk, []) if r['Melakarta Number'] else []
        s_v = scale_g[sk]
        d_v = same_g.get(dk, []) if r['Melakarta Number'] else []
        if len(n_v) < 2 and len(s_v) < 2:
            continue
        out.append({
            'Master ID': r['Master ID'], 'Source List': r['Source List'], 'Source Row': r['Source Row'],
            'Raga Name': r['Raga Name'], 'Melakarta Number': r['Melakarta Number'], 'Aroha': r['Aroha'], 'Avaroha': r['Avaroha'],
            'Vakra': r['Vakra'],
            'Name Group': ids.get(('N', nk), '') if len(n_v) > 1 else '',
            'Name Group Rows': len(n_v) if len(n_v) > 1 else '',
            'Name Group Sources': sources(n_v) if len(n_v) > 1 else '',
            'Name Group Scales': len({x['_sig'] for x in n_v}) if len(n_v) > 1 else '',
            'Scale Group': ids.get(('S', sk), '') if len(s_v) > 1 else '',
            'Scale Group Rows': len(s_v) if len(s_v) > 1 else '',
            'Scale Group Sources': sources(s_v) if len(s_v) > 1 else '',
            'Scale Group Names': len({(x['Melakarta Number'], x['_fold']) for x in s_v}) if len(s_v) > 1 else '',
            'Scale Group Melas': len({x['Melakarta Number'] for x in s_v}) if len(s_v) > 1 else '',
            'Same-Raga Cluster': ids.get(('D', dk), '') if len(d_v) > 1 else '',
            'Cluster Rows': len(d_v) if len(d_v) > 1 else '',
            'Cluster Sources': sources(d_v) if len(d_v) > 1 else '',
            'Cluster Spellings': ' / '.join(sorted({x['Raga Name'].split(' (Raga')[0] for x in d_v})) if len(d_v) > 1 else '',
        })
    with open(OUT_ROWS, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)

    grp = []
    for (mela, fk), v in sorted(name_g.items(), key=lambda kv: (int(kv[0][0]), kv[0][1])):
        if sources(v) < 2:
            continue
        by_sig = collections.defaultdict(set)
        for r in v:
            by_sig[r['_sig']].add(r['Source List'])
        confirmed = sum(1 for s in by_sig.values() if len(s) >= 2)
        if len(by_sig) == 1:
            status = 'all sources agree on one scale'
        elif confirmed:
            status = 'a scale confirmed by 2+ sources, plus other versions'
        else:
            status = 'sources disagree: no scale is shared'
        grp.append({'Name Group': ids[('N', (mela, fk))], 'Melakarta Number': mela, 'Names': ' / '.join(sorted({r['Raga Name'].split(' (Raga')[0] for r in v})),
                    'Rows': len(v), 'Sources': sources(v), 'Source Lists': ', '.join(sorted({r['Source List'] for r in v})),
                    'Distinct Scales': len(by_sig), 'Scales Confirmed By 2+ Sources': confirmed, 'Status': status})
    with open(OUT_GROUPS, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(grp[0]))
        w.writeheader()
        w.writerows(grp)

    print('rows in duplicate-candidates.csv:', len(out), '| name groups (2+ sources):', len(grp))
    print('name group status:', dict(collections.Counter(g['Status'] for g in grp)))
    multi_d = [v for v in same_g.values() if sources(v) >= 2]
    multi_s = [v for v in scale_g.values() if sources(v) >= 2]
    print('same-raga clusters spanning 2+ sources:', len(multi_d), '(rows %d)' % sum(len(v) for v in multi_d))
    print('scale groups spanning 2+ sources:', len(multi_s), '(rows %d)' % sum(len(v) for v in multi_s))


if __name__ == '__main__':
    main()
