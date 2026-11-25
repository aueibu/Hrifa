"""Set-theory / structural analytics for one raga's scale. Pure functions on the swara tokens (Carnatic notation,
octave marks already stripped); no I/O. Used by build_merged_ragas.py to add theory columns to the masterlist.

Semitone mapping (Sa = 0) matches the SEMI table in build_master_from_clean.py, the one already used everywhere
else in this project to build the Pitch Binary/Decimal columns:
    S R1 R2 R3 G1 G2 G3 M1 M2 P D1 D2 D3 N1 N2 N3
    0  1  2  3  2  3  4  5  6 7  8  9 10  9 10 11
Two Carnatic letters can share a semitone (R2/G1, R3/G2, D2/N1, D3/N2): which one a real raga uses is a property
of that raga's own scale, so wherever a result names an *actual* swara of the raga in hand, it is read from that
raga's own tokens (never guessed). Only the mirror and the negative scale can land on a pitch this raga never uses;
those are labelled with every enharmonic name for that semitone. Every swara label everywhere in this module also
carries its bare pitch class in parentheses, e.g. `R2/G1(2)`, so a name and its number are always both on hand.
"""
import re

SEMI = {'S': 0, 'R1': 1, 'R2': 2, 'R3': 3, 'G1': 2, 'G2': 3, 'G3': 4, 'M1': 5, 'M2': 6, 'P': 7,
        'D1': 8, 'D2': 9, 'D3': 10, 'N1': 9, 'N2': 10, 'N3': 11}
NAMES = {0: ['S'], 1: ['R1'], 2: ['R2', 'G1'], 3: ['R3', 'G2'], 4: ['G3'], 5: ['M1'], 6: ['M2'], 7: ['P'],
         8: ['D1'], 9: ['D2', 'N1'], 10: ['D3', 'N2'], 11: ['N3']}
MARKS = re.compile(r"[',=]")


def toks(text):
    """Swara tokens with octave marks stripped, in the order printed (repeats and all)."""
    return [MARKS.sub('', t) for t in text.split()]


def pcs_of(text):
    return [SEMI[t] for t in toks(text) if t in SEMI]


def token_map(aroha, avaroha):
    """pitch class -> the raga's own token(s) that use it (usually one; more only if the raga genuinely uses both
    enharmonic spellings, which the 72-melakarta scheme normally forbids within one raga)."""
    m = {}
    for t in toks(aroha) + toks(avaroha):
        if t in SEMI:
            m.setdefault(SEMI[t], set()).add(t)
    return m


def label(pc, tm=None):
    """This raga's own name(s) for a pitch class if it has one (tm), else every enharmonic name for that semitone,
    always followed by the bare pitch class: `R2/G1(2)`."""
    names = tm.get(pc) if tm else None
    return '%s(%d)' % ('/'.join(sorted(names) if names else NAMES[pc]), pc)


def tok_label(token):
    """A single already-known token of this raga's own text, e.g. `M1` -> `M1(5)`."""
    return '%s(%d)' % (token, SEMI[token]) if token in SEMI else token


def purvanga_uttaranga(aroha, avaroha):
    """(purvanga, uttaranga): the raga's own swaras split at Ma/Pa (S-M1/M2 = purvanga, pc 0-6; P-N3 = uttaranga, pc 7-11)."""
    tm = token_map(aroha, avaroha)
    pcset = sorted(tm)
    lower = ' '.join(label(p, tm) for p in pcset if p <= 6)
    upper = ' '.join(label(p, tm) for p in pcset if p >= 7)
    return lower, upper


def pitch_class_set(aroha, avaroha):
    """The raga's pitch-class set (aroha union avaroha), 0-11, set-theory notation."""
    pcset = sorted(set(pcs_of(aroha)) | set(pcs_of(avaroha)))
    return pcset, '{%s}' % ','.join(map(str, pcset))


def tritones(pcset, tm):
    """Pairs of the raga's own swaras 6 semitones apart (the only interval that is its own inversion)."""
    out = []
    s = set(pcset)
    for p in pcset:
        q = (p + 6) % 12
        if q in s and p < q:
            out.append('%s-%s' % (label(p, tm), label(q, tm)))
    return '; '.join(out)


def interval_listing(tokens, steps):
    """Every adjacent pair in a printed aroha/avaroha with its (already canonical, octave-mark-independent) step."""
    return ' '.join('%s-%s:%+d' % (tok_label(a), tok_label(b), s) for a, b, s in zip(tokens, tokens[1:], steps))


def large_gaps(tokens, steps, threshold=3):
    """Adjacent pairs (in melodic order, ascending for an aroha, descending for an avaroha) whose step is a minor
    third (3 semitones) or larger."""
    return '; '.join('%s-%s:%+d' % (tok_label(a), tok_label(b), s)
                      for a, b, s in zip(tokens, tokens[1:], steps) if abs(s) >= threshold)


def gamut_large_gaps(pcset, tm, threshold=3):
    """Large gaps (>= a minor third) in the raga's whole pitch-class set taken as one ascending scale (sorted, the
    octave closed back to Sa) -- the scale's own structural gaps, independent of how any one phrase orders its notes."""
    s = sorted(pcset)
    if not s:
        return ''
    pairs = list(zip(s, s[1:])) + [(s[-1], s[0] + 12)]
    return '; '.join('%s-%s:+%d' % (label(a % 12, tm), label(b % 12, tm), b - a) for a, b in pairs if b - a >= threshold)


def imperfections(pcset, tm):
    """Swaras with no note a perfect fifth ABOVE them, within this raga's own scale."""
    s = set(pcset)
    return ' '.join(label(p, tm) for p in pcset if (p + 7) % 12 not in s)


def detached_swaras(pcset, tm):
    """Swaras with no note a perfect fifth above OR below them, within this raga's own scale."""
    s = set(pcset)
    return ' '.join(label(p, tm) for p in pcset if (p + 7) % 12 not in s and (p + 5) % 12 not in s)


def pitch_counts(aroha, avaroha):
    """(pitches played with repeats across aroha+avaroha, unique pitch classes used)."""
    played = len(toks(aroha)) + len(toks(avaroha))
    unique = len(set(pcs_of(aroha)) | set(pcs_of(avaroha)))
    return played, unique


def mirror_seq(tokens):
    """The melodic inversion around Sa: each pitch class p becomes (-p mod 12), same token order (so the aroha's
    mirror is still read as an aroha, the avaroha's as an avaroha). An inverted phrase is a new scale, not
    necessarily one this raga uses, so every enharmonic name for the landing semitone is given, each with its pc."""
    return ' '.join(label((-SEMI[t]) % 12) if t in SEMI else t for t in tokens)


def mirror_gamut(pcset):
    """The mirror's entire pitch gamut: the whole pitch-class set inverted around Sa, not just one phrase's order."""
    mpcs = sorted({(-p) % 12 for p in pcset})
    return mpcs, '{%s}' % ','.join(map(str, mpcs)), ' '.join(label(p) for p in mpcs)


def negative_gamut(pcset):
    """The negative's entire pitch gamut: every pitch class this raga does NOT use, as the new scale's pitch-class set."""
    neg = sorted(set(range(12)) - set(pcset))
    return neg, '{%s}' % ','.join(map(str, neg)), ' '.join(label(p) for p in neg)


def negative_seq(neg_pcs):
    """The negative scale read as an aroha (ascending) and an avaroha (descending): the leftover pitch classes in
    scale order, closed to one octave (Sa..Sa) the same way a real aroha/avaroha is, when Sa (0) is among them --
    it usually is not, since almost every raga uses Sa, so the negative scale is typically Sa-less."""
    if not neg_pcs:
        return '', ''
    asc = ' '.join(label(p) for p in neg_pcs)
    desc = ' '.join(label(p) for p in reversed(neg_pcs))
    return asc, desc
