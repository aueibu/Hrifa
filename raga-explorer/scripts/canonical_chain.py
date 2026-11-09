"""One canonical semitone chain per raga variant, independent of how a source marked its octaves.

Sources mark octaves inconsistently (`S'` at the end of one row, a plain `S` in another row of the same variant), and an explicit mark
overrides the notes around it, which can force an impossible leap (a final `S'` after a note in the lower octave is a +14 step). The
canonical chain ignores every octave mark and reads the swaras alone: each note is placed at the octave that keeps the melody moving
by the smallest steps, subject to what a scale has to satisfy.

  * The chain is the cheapest path over the octave of every note (dynamic programming). A step costs its size in semitones, plus 0.5 when it
    runs against the direction of the part (a fall in an aroha, a rise in an avaroha: this only breaks ties, such as the +6 / -6 of N2 to G3),
    plus 3 per semitone beyond 7. No step may be larger than 11 semitones.
  * Octave placement: a scale is placed so its notes sit as near the middle octave (0 to 12) as the steps allow (a tiny cost per semitone
    outside it): a scale opening on the lower Ni reads N -2, S 0; `R1 M1 P D1 N3 S` reads 1 5 7 8 11 12.
  * aroha: if it opens and closes on Sa, the first Sa is 0 and the closing Sa is the upper Sa (12): one octave.
  * avaroha: it starts where the aroha ended (an aroha ending on the upper Sa gives an avaroha starting at 12); if it opens on a different
    swara it starts at the occurrence of that swara nearest to the aroha's last note. If it opens and closes on Sa, it falls exactly one octave.
  * The opening-Sa convention the user approved: a leap away from the opening Sa goes in the part's direction (`S P` up in an aroha, `S' M` down).

    canonical_chain(aroha, avaroha) -> (aroha positions, avaroha positions)
"""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sargam_intervals import parse  # noqa: E402

MARKS = re.compile(r"[',=]")
MAX_STEP = 11
AGAINST = 0.5
FORCED = 20.0            # against-direction cost of the direction-forced reading (a ruled Vakra can require a leap up where nearest-step reads a fall)
AGAINST_FROM_OPENING_SA = 4.0   # the user-approved convention: a leap away from the opening Sa goes in the part's direction (S P up, S' M down)
SANE_STEP = 8            # a chain with a larger step is suspicious: closing on Sa is dropped if that removes it, and the variant is flagged
LEAP_FROM, LEAP_COST = 7, 3
OCTAVES = range(-3, 5)
OUTSIDE = 0.001          # cost per semitone outside 0..12, only there to place a scale in the middle octave


def strip_marks(text):
    return ' '.join(t for t in (MARKS.sub('', tok) for tok in text.split()) if t)


def _pcs(text):
    return [n.pc for n in parse(strip_marks(text), notation='carnatic')]


def _cost(d, up, against=AGAINST):
    a = abs(d)
    if a > MAX_STEP:
        return None
    c = float(a)
    if d != 0 and (d > 0) != up:
        c += against
    if a > LEAP_FROM:
        c += LEAP_COST * (a - LEAP_FROM)
    return c


def _solve(pcs, up, fixed, against=AGAINST, opening=AGAINST_FROM_OPENING_SA):
    """Cheapest positions for the notes `pcs`; `fixed` maps a note index to its required position. None when infeasible."""
    cand = [[fixed[i]] if i in fixed else [pc + 12 * k for k in OCTAVES] for i, pc in enumerate(pcs)]
    node = lambda p: OUTSIDE * (max(0, -p) + max(0, p - 12))
    best = [{p: (node(p), None) for p in cand[0]}]
    for i in range(1, len(pcs)):
        layer = {}
        for p in cand[i]:
            top = None
            for q, (c0, _) in best[i - 1].items():
                c = _cost(p - q, up, opening if i == 1 and pcs[0] == 0 else against)
                if c is None:
                    continue
                if top is None or c0 + c + node(p) < top[0]:
                    top = (c0 + c + node(p), q)
            if top is not None:
                layer[p] = top
        if not layer:
            return None
        best.append(layer)
    p = min(best[-1], key=lambda x: (best[-1][x][0], x))
    total, path = best[-1][p][0], [p]
    for i in range(len(pcs) - 1, 0, -1):
        p = best[i][p][1]
        path.append(p)
    return path[::-1], total


def _place(pcs, up, fixed, closing, against=AGAINST, opening=AGAINST_FROM_OPENING_SA):
    out = _solve(pcs, up, {**fixed, **closing}, against, opening)
    return out[0] if out else None


def _max_step(*chains):
    return max([abs(b - a) for c in chains for a, b in zip(c, c[1:])] or [0])


def _vakra(a, v):
    return 'Yes' if any(b < x for x, b in zip(a, a[1:])) or any(b > x for x, b in zip(v, v[1:])) else 'No'


def canonical_chain(aroha, avaroha, vakra=None, with_note=False):
    """Positions in semitones (Sa = 0, upper Sa = 12) for the aroha and the avaroha, octave marks ignored.

    The default reading takes the nearest step and closes a scale that opens and closes on Sa to one octave. It is replaced by the best of
    the other readings (open scale; direction forced) only when it needs a step larger than SANE_STEP or disagrees with the recorded
    `vakra` (Yes/No); the default wins ties. With `with_note`, also returns a note saying which reading was used ('' for the default)."""
    ap, vp = _pcs(aroha), _pcs(avaroha)
    a_closed = len(ap) > 1 and ap[0] == 0 and ap[-1] == 0
    v_closed = len(vp) > 1 and vp[0] == 0 and vp[-1] == 0
    best = None
    for forced in (False, True):
        ag, op = (FORCED, FORCED) if forced else (AGAINST, AGAINST_FROM_OPENING_SA)
        for ac in ((True, False) if a_closed else (False,)):
            a = _place(ap, True, {0: 0} if ac else {}, {len(ap) - 1: 12} if ac else {}, ag, op)
            if a is None:
                continue
            start = min((vp[0] + 12 * k for k in range(-3, 5)), key=lambda c: (abs(c - a[-1]), -c))
            for vc in ((True, False) if v_closed else (False,)):
                v = _place(vp, False, {0: start}, {len(vp) - 1: start - 12} if vc else {}, ag, op)
                if v is None:
                    continue
                score = (int(vakra in ('Yes', 'No') and _vakra(a, v) != vakra), int(_max_step(a, v) > SANE_STEP), int(forced), int(not ac) + int(not vc))
                if best is None or score < best[0]:
                    best = (score, a, v, forced, ac, vc)
    if best is None:
        return (None, None, '') if with_note else (None, None)
    _, a, v, forced, ac, vc = best
    note = []
    if forced:
        note.append('read with the direction of each part forced (the recorded Vakra needs it)')
    if (a_closed and not ac) or (v_closed and not vc):
        note.append('not closed to one octave (the scale text does not span one)')
    if vakra in ('Yes', 'No') and _vakra(a, v) != vakra:
        note.append('the chain reads Vakra %s but %s is recorded' % (_vakra(a, v), vakra))
    return (a, v, '; '.join(note)) if with_note else (a, v)


def steps(positions):
    return [b - a for a, b in zip(positions, positions[1:])]
