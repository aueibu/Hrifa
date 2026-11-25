"""Export a lean JSON dataset off MASTERLIST-carnatic-ragas.csv for the Raga Explorer applet (shell/src/pages/raga-explorer).

Keeps only what the applet needs to browse, link and play back ragas. Theory (pitch-class set, tritones, mirror, negative,
etc.) is recomputed client-side by a TypeScript port of raga_theory.py (theory.ts), from the aroha/avaroha text alone, so
it is never duplicated here -- except the canonical semitone chain itself (`Aroha/Avaroha Semitones`), which is carried
through as-is rather than re-implementing canonical_chain.py's octave-placement search a second time in TypeScript: it is
both what theory.ts needs for its interval/gap columns and exactly the per-note pitch offsets the applet's audio engine
plays back. The cross-link columns (`Same Name Under Other Melas`, `Similar Names Not Merged`, `Multi-Parent Group`)
already store real Raga IDs (space-separated when there is more than one), so they are carried through as arrays too.

Output: shell/public/raga-explorer/ragas.json (fetched at runtime, not bundled -- see shell/src/pages/raga-explorer/data.ts)

    python scripts/export_raga_explorer_data.py
"""
import collections, csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
MASTERLIST = os.path.join(HERE, '..', 'raga lists', 'MASTERLIST-carnatic-ragas.csv')
OUT = os.path.join(HERE, '..', '..', 'shell', 'public', 'raga-explorer', 'ragas.json')


def ints(text):
    """Space-separated integers, signed (the canonical chain can carry negative, below-Sa positions)."""
    out = []
    for x in text.split():
        try:
            out.append(int(x))
        except ValueError:
            pass
    return out


def strs(text):
    return [x for x in text.split() if x.strip()]


def main():
    rows = list(csv.DictReader(open(MASTERLIST, encoding='utf-8')))
    out = []
    for r in rows:
        out.append({
            'id': r['Raga ID'], 'vid': r['Variant ID'], 'type': r['Type'],
            'mela': int(r['Melakarta Number']) if r['Melakarta Number'].strip().isdigit() else None,
            'melaName': r['Melakarta Name'],
            'name': r['Raga Name (Merged)'], 'aroha': r['Aroha (Merged)'], 'avaroha': r['Avaroha (Merged)'],
            'arohaChain': ints(r['Aroha Semitones']), 'avarohaChain': ints(r['Avaroha Semitones']),
            'vakra': r['Vakra'], 'bhashanga': r['Bhashanga (Merged)'],
            'status': r['Status'], 'sources': strs(r['Sources'].replace(',', ' ')), 'sourceCount': int(r['Source Count'] or 0),
            'twinGroup': r['Scale Twin Group'] or None, 'twinCount': int(r['Ragas Sharing This Scale'] or 0),
            'sameNameOtherMelas': strs(r['Same Name Under Other Melas']),
            'similarNamesNotMerged': strs(r['Similar Names Not Merged']),
            'multiParentGroup': r['Multi-Parent Group'] or None,
            'alsoListedUnderMelas': ints(r['Also Listed Under Melas']),
            'allSpellings': r['All Spellings'], 'aliasNames': r['Alias Names'],
        })
    # the mela-number -> name index the applet needs for the family browser; a mela can have minor spelling
    # variation across rows (different sources), so take the most common spelling for each number
    names_by_mela = collections.defaultdict(collections.Counter)
    for r in rows:
        if r['Melakarta Number'].strip().isdigit():
            names_by_mela[int(r['Melakarta Number'])][r['Melakarta Name']] += 1
    melas = [{'number': n, 'name': names_by_mela[n].most_common(1)[0][0]} for n in sorted(names_by_mela)]

    payload = {'ragas': out, 'melas': melas}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(OUT)
    print('wrote %d ragas, %d melas to %s (%.1f KB)' % (len(out), len(melas), OUT, size / 1024))


if __name__ == '__main__':
    main()
