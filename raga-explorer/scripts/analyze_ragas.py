"""Collection-level raga analytics off MASTERLIST-carnatic-ragas.csv. Read-only: prints a report, writes nothing.

    python scripts/analyze_ragas.py
"""
import collections, csv, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, '..', 'raga lists')
MASTERLIST = os.path.join(BASE, 'MASTERLIST-carnatic-ragas.csv')

JATI = {5: 'Audava', 6: 'Shadava', 7: 'Sampurna'}


def jati(binary):
    return JATI.get(binary.count('1'), '%d-note' % binary.count('1')) if binary else '?'


def pcs(binary):
    return frozenset(i for i, b in enumerate(binary) if b == '1')


def main():
    rows = list(csv.DictReader(open(MASTERLIST, encoding='utf-8')))
    print('variants:', len(rows))

    # 1. Jati distribution (aroha jati x avaroha jati)
    jc = collections.Counter((jati(r['Aroha Pitch Binary']), jati(r['Avaroha Pitch Binary'])) for r in rows)
    print('\n-- Jati (note count) distribution, aroha x avaroha --')
    for k, v in jc.most_common():
        print('  %-20s %5d  (%.1f%%)' % ('%s / %s' % k, v, 100 * v / len(rows)))

    # 2. Vakra / Bhashanga distribution
    print('\n-- Vakra --')
    for k, v in collections.Counter(r['Vakra'] for r in rows).most_common():
        print('  %-14s %5d' % (k, v))
    print('\n-- Bhashanga (Merged) --')
    for k, v in collections.Counter(r['Bhashanga (Merged)'] for r in rows).most_common():
        print('  %-14s %5d' % (k, v))
    print('\n-- Vakra x Bhashanga --')
    for k, v in collections.Counter((r['Vakra'], r['Bhashanga (Merged)']) for r in rows).most_common():
        print('  %-24s %5d' % ('%s / %s' % k, v))

    # 3. Symmetry: does the avaroha's pitch-class set equal the aroha's (varjya-symmetric)?
    sym = sum(1 for r in rows if pcs(r['Aroha Pitch Binary']) == pcs(r['Avaroha Pitch Binary']))
    print('\n-- Symmetry --')
    print('  same pitch-class set both ways: %d (%.1f%%)' % (sym, 100 * sym / len(rows)))
    print('  different sets (true Bhashanga/vakra-shape asymmetry): %d (%.1f%%)' % (len(rows) - sym, 100 * (len(rows) - sym) / len(rows)))

    # 4. Melakarta fertility: janya count per parent mela (Type == Janya only; skip blanks/unknown)
    janya = [r for r in rows if r.get('Type', '').strip().lower() == 'janya' and r['Melakarta Number'].strip().isdigit()]
    by_mela = collections.Counter(int(r['Melakarta Number']) for r in janya)
    print('\n-- Janya count per melakarta (%d janya variants, %d melas represented) --' % (len(janya), len(by_mela)))
    ranked = sorted(by_mela.items(), key=lambda x: -x[1])
    print('  top 5:', ', '.join('mela %d: %d' % x for x in ranked[:5]))
    print('  bottom 5:', ', '.join('mela %d: %d' % x for x in ranked[-5:]))
    missing = sorted(set(range(1, 73)) - set(by_mela))
    print('  melas with zero janyas in the collection:', missing if missing else 'none')

    # 5. Scale-twin clustering (already computed as 'Scale Twin Group' by the merge build)
    twin_rows = [r for r in rows if r['Scale Twin Group'].strip()]
    groups = collections.defaultdict(list)
    for r in twin_rows:
        groups[r['Scale Twin Group']].append(r['Raga Name (Merged)'])
    print('\n-- Scale twins (distinct ragas that share one exact scale) --')
    print('  variants involved: %d, distinct groups: %d' % (len(twin_rows), len(groups)))
    biggest = sorted(groups.items(), key=lambda x: -len(x[1]))[:8]
    for gid, names in biggest:
        print('  %s (%d ragas): %s' % (gid, len(names), ', '.join(sorted(set(names))[:6]) + (' ...' if len(set(names)) > 6 else '')))

    # 6. Step-size profile (canonical chain steps)
    def stepvals(col):
        for r in rows:
            for tok in r[col].split():
                yield int(tok)
    all_steps = list(stepvals('Aroha Steps')) + list(stepvals('Avaroha Steps'))
    sc = collections.Counter(abs(s) for s in all_steps)
    print('\n-- Step sizes across every chained variant (%d steps total) --' % len(all_steps))
    for size in sorted(sc):
        bar = '#' * max(1, int(60 * sc[size] / max(sc.values())))
        print('  %2d semitones: %6d  %s' % (size, sc[size], bar))
    leaps = sum(v for k, v in sc.items() if k >= 5)
    print('  leaps of >=5 semitones: %d (%.1f%% of all steps)' % (leaps, 100 * leaps / len(all_steps)))


if __name__ == '__main__':
    main()
