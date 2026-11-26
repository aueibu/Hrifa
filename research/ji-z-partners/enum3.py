#!/usr/bin/env python3
"""enum3.py: exhaustive 3-limit Z-pair enumeration (every set, every size), plain CPython.

Why 3-limit is so easy: every note is a power of 3 (octave-reduced), so a set is just a set of positions
on the chain of fifths, i.e. a set of integers, and an interval is a difference of positions. The lattice
has ONE dimension instead of two or more. q of a set is 3^span (span = top position - bottom position,
in fifths), so q grows by a factor 3 for each extra fifth of span while the number of sets only doubles:
sets with span L number 2^(L-1). q <= 3^20 (about 3.5 billion) is about a million sets (12 s here), while
5-limit q <= 3,645 was 28 billion sets on the 16-core VM. The flip side: 3-limit pairs need a large span,
so they only appear at very large q (first at span 11, q = 3^11 = 177,147).

Method: for each span L, every set containing 0 and L (each set counted once by its span; partners share
their span because they share their largest interval). Group by (note count, difference multiset); a
group holding two or more sets that are not each other's mirror is a family. Mirror = the set reflected
(x -> L - x), the same as taking 1/r for each ratio; transpositions are removed by fixing the lowest note.

usage: python enum3.py MAXSPAN          (prints new families per span, then totals by note count)
"""
import collections, sys, time

MAXSPAN = int(sys.argv[1])
t0 = time.time()
total = collections.Counter()
for L in range(1, MAXSPAN + 1):
    groups = collections.defaultdict(set)
    for mask in range(1 << (L - 1)):
        s = [0] + [i + 1 for i in range(L - 1) if mask >> i & 1] + [L]
        d = collections.Counter(b - a for i, a in enumerate(s) for b in s[i + 1:])
        mirror = tuple(sorted(L - x for x in s))
        canon = min(tuple(s), mirror)
        groups[(len(s), tuple(sorted(d.items())))].add(canon)
    new = collections.Counter(k for (k, _), v in groups.items() if len(v) > 1)
    total += new
    if new:
        print(f"span {L:2d} (q = 3^{L} = {3**L:,}): new families by notes {dict(sorted(new.items()))}")
print(f"span <= {MAXSPAN} (q <= {3**MAXSPAN:,}): {sum(total.values())} families, "
      f"by notes {dict(sorted(total.items()))}; {time.time() - t0:.1f} s")
