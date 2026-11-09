"""Nearest-neighbor scale distance analysis off MASTERLIST-carnatic-ragas.csv. Read-only: prints a report, writes nothing.

A raga's "scale" here is its aroha pitch-class set and avaroha pitch-class set together (the two 12-bit binaries already on the
masterlist, aroha bits followed by avaroha bits: 24 bits total). Distance between two scales is Hamming distance on that 24-bit
vector: each bit that differs (a pitch class present in one scale's aroha/avaroha and absent in the other's) counts 1. This is
distinct from `Scale Twin Group` (distance 0, exact duplicates, already computed at merge time): here we look at distance >= 1,
the closest *different* scales to each other, i.e. which ragas are one or two swaras apart from which other ragas.

    python scripts/nearest_neighbor_scales.py
"""
import collections, csv, os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MASTERLIST = os.path.join(HERE, '..', 'raga lists', 'MASTERLIST-carnatic-ragas.csv')


def main():
    rows = list(csv.DictReader(open(MASTERLIST, encoding='utf-8')))
    rows = [r for r in rows if len(r['Aroha Pitch Binary']) == 12 and len(r['Avaroha Pitch Binary']) == 12]

    # collapse to unique scale signatures (a variant's exact 24-bit vector), keeping every raga name that carries it
    by_sig = collections.OrderedDict()
    for r in rows:
        sig = r['Aroha Pitch Binary'] + r['Avaroha Pitch Binary']
        by_sig.setdefault(sig, []).append(r)
    sigs = list(by_sig.keys())
    n = len(sigs)
    print('variants with a usable scale: %d | distinct scale signatures: %d' % (len(rows), n))

    X = np.array([[int(c) for c in s] for s in sigs], dtype=np.int16)
    counts = X.sum(axis=1)
    dot = X.astype(np.int32) @ X.T.astype(np.int32)
    dist = counts[:, None] + counts[None, :] - 2 * dot
    np.fill_diagonal(dist, 999)

    nearest = dist.min(axis=1)
    dc = collections.Counter(int(d) for d in nearest)
    print('\n-- nearest-*different*-scale distance, per distinct scale signature (%d signatures) --' % n)
    for d in sorted(dc):
        bar = '#' * max(1, int(60 * dc[d] / max(dc.values())))
        print('  %2d bit(s) away: %5d  (%.1f%%)  %s' % (d, dc[d], 100 * dc[d] / n, bar))

    def label(sig):
        rs = by_sig[sig]
        names = sorted({r['Raga Name (Merged)'] for r in rs})
        mela = rs[0]['Melakarta Number']
        return '%s (mela %s%s)' % (' / '.join(names[:3]) + (' ...' if len(names) > 3 else ''), mela,
                                    ', %d ragas share this exact scale' % len(names) if len(names) > 1 else '')

    # distance-1 pairs: the closest possible kinship short of being the same scale (one pitch class added/dropped/moved)
    print('\n-- sample of distance-1 pairs (one bit apart: a single swara added, dropped, or shifted to an adjacent semitone) --')
    seen_pairs = set()
    shown = 0
    order = np.argsort(nearest)
    for i in order:
        if nearest[i] != 1:
            continue
        js = np.where(dist[i] == 1)[0]
        for j in js:
            key = tuple(sorted((int(i), int(j))))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            print('  %s\n    <-> %s' % (label(sigs[i]), label(sigs[j])))
            shown += 1
            break
        if shown >= 15:
            break
    print('  (%d distinct distance-1 pairs total)' % len(seen_pairs))

    # a well-known raga's nearest kin, as a worked example
    print('\n-- worked examples: nearest different scale for a few well-known ragas --')
    # (name, melakarta) - several names on this list are also (unrelated) janya names under other melas, so pin the mela too
    for want, mela in (('Kharaharapriyā', '22'), ('kalyANi', '65'), ('Sankarabharanam', '29'), ('tODi', '8'), ('Bhairavi', '20')):
        hit = next((sig for sig, rs in by_sig.items() if any(r['Raga Name (Merged)'] == want and r['Melakarta Number'] == mela for r in rs)), None)
        if hit is None:
            continue
        i = sigs.index(hit)
        j = int(np.argmin(dist[i]))
        print('  %s -> nearest: %s, distance %d' % (label(sigs[i]), label(sigs[j]), int(dist[i][j])))


if __name__ == '__main__':
    main()
