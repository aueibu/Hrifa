"""Sargam -> signed semitone intervals, and a vakra (zig-zag) check built on them.

Every note is a (degree, pitch_class) pair: degree 0-6 for Sa Re Ga Ma Pa Dha Ni (komal/tivra ignored), pitch class 0-11
in 12-TET with Sa = 0. For each consecutive pair the two halves of the answer come from different information:

  DIRECTION comes from the degrees. The difference is wrapped to -3..+3. Seven is odd, so the wrap is never a tie, and it
  encodes the assumption that a melodic leap never exceeds a 4th (three degree steps). Pitch class alone cannot give the
  direction: Sa <-> tivra Ma is 6 semitones either way, and Sa -> Ni looks like +11 but is really -1.

  MAGNITUDE comes from the pitch classes, measured in that direction. Degrees only say "up a 3rd", not how big.

Where the assumption fails (a 5th or more, e.g. Sa -> Pa read as a 4th down) explicit octave markers override it:

    S'  or  S''    upper octave (tara), two octaves up          N,  or  N,,   lower octave (mandra)
    S=             explicitly the middle octave (madhya)         'N  (leading apostrophe) lower octave, as in the Wikipedia list

A marked note is placed exactly (12 * octave + pitch class, middle-octave Sa = 0). An unmarked note takes the inferred
direction from the note before it, and the first note is assumed to be in the middle octave. Where a marker contradicts the
inferred position, the marker wins and the step into that note is the one the marker implies, so one `S'` is enough to make
`... m S'` a +7. Unmarked steps of +-3 degrees (a 4th, or a 5th the other way) are reported as suspect instead of being
silently trusted.

Notations accepted (the notation is detected from the tokens, or forced with notation=):
  Hindustani letters, case matters: S r R g G m M P d D n N   (lowercase komal, m = shuddha Ma, M = tivra Ma; s/p also read)
  Syllables: sa re ga ma pa dha ni  (shuddha), komal kre kga kdha kni, tivra tma
  Carnatic: S R1 R2 R3 G1 G2 G3 M1 M2 P D1 D2 D3 N1 N2 N3  (any digit switches the phrase to Carnatic; a bare R/G/M/D/N is an error)

CLI:  python scripts/sargam_intervals.py steps "S N R S"
      python scripts/sargam_intervals.py vakra --aroha "S R G M P D N S'" --avaroha "S' N D P M G R S"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from typing import List, NamedTuple, Optional, Sequence, Tuple, Union

# --------------------------------------------------------------------------------------------- notes and tables

DEGREE_NAMES = ['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni']

# largest |step| that degree and pitch can legitimately agree on after the -3..+3 wrap (Carnatic G1 -> D3 is 8).
# Anything bigger means the degree-derived direction contradicts the pitch (R3 -> G1 would come out +11).
MAX_LEGIT_STEP = 8


class Note(NamedTuple):
    """A note. The first two items are the (degree, pitch_class) pair; octave is None when no marker was written."""
    degree: int
    pc: int
    octave: Optional[int] = None
    token: str = ''

    def label(self) -> str:
        return self.token or '(%d,%d)' % (self.degree, self.pc)


NoteLike = Union[Note, Tuple[int, int], Tuple[int, int, Optional[int]]]

_HINDUSTANI = {'S': (0, 0), 'r': (1, 1), 'R': (1, 2), 'g': (2, 3), 'G': (2, 4), 'm': (3, 5), 'M': (3, 6), 'P': (4, 7),
               'd': (5, 8), 'D': (5, 9), 'n': (6, 10), 'N': (6, 11), 's': (0, 0), 'p': (4, 7)}
_SYLLABLE = {'sa': (0, 0), 're': (1, 2), 'ga': (2, 4), 'ma': (3, 5), 'pa': (4, 7), 'dha': (5, 9), 'ni': (6, 11),
             'kre': (1, 1), 'kga': (2, 3), 'kdha': (5, 8), 'kni': (6, 10), 'tma': (3, 6)}
_CARNATIC = {'S': (0, 0), 'R1': (1, 1), 'R2': (1, 2), 'R3': (1, 3), 'G1': (2, 2), 'G2': (2, 3), 'G3': (2, 4),
             'M1': (3, 5), 'M2': (3, 6), 'P': (4, 7), 'D1': (5, 8), 'D2': (5, 9), 'D3': (5, 10),
             'N1': (6, 9), 'N2': (6, 10), 'N3': (6, 11), 's': (0, 0), 'p': (4, 7)}


class SargamError(ValueError):
    """Raised for a token the parser cannot read."""


# ------------------------------------------------------------------------------------------------------ parsing

_TOKEN = re.compile(r"^(?P<lead>')?(?P<base>[A-Za-z]+[0-9]?)(?P<marks>(?:'|,|=)*)$")


def _octave_of(token: str, lead: Optional[str], marks: str) -> Optional[int]:
    if lead and marks:
        raise SargamError('octave marker on both sides of %r' % token)
    if lead:
        return -1
    if not marks:
        return None
    if '=' in marks:
        if marks != '=':
            raise SargamError("'=' (middle octave) cannot be combined with other markers in %r" % token)
        return 0
    if "'" in marks and ',' in marks:
        raise SargamError('upper and lower octave markers mixed in %r' % token)
    return marks.count("'") - marks.count(',')


def parse(text: str, notation: str = 'auto', unmarked: str = 'infer') -> List[Note]:
    """Sargam string -> list of Note (each also a (degree, pitch_class, octave, token) tuple).

    notation: 'auto' | 'hindustani' | 'carnatic'.
    unmarked: 'infer' (an unmarked note has no octave; direction is inferred) or 'madhya' (an unmarked note is the middle octave,
    so a fully-explicit phrase results).
    """
    if notation not in ('auto', 'hindustani', 'carnatic'):
        raise ValueError("notation must be 'auto', 'hindustani' or 'carnatic'")
    if unmarked not in ('infer', 'madhya'):
        raise ValueError("unmarked must be 'infer' or 'madhya'")
    tokens = text.split()          # whitespace separates swaras; a comma is the lower-octave marker, not a separator
    if not tokens:
        raise SargamError('empty phrase')
    parsed = []
    for tok in tokens:
        m = _TOKEN.match(tok)
        if not m:
            raise SargamError('cannot read %r (expected a swara with optional octave markers)' % tok)
        parsed.append((tok, m.group('base'), _octave_of(tok, m.group('lead'), m.group('marks'))))
    mode = notation
    if mode == 'auto':
        mode = 'carnatic' if any(re.fullmatch(r'[RGMDNrgmdn][0-9]', b) for _, b, _ in parsed) else 'hindustani'
    out = []
    for tok, base, octv in parsed:
        low = base.lower()
        if low in _SYLLABLE and len(base) > 1 and not re.search(r'[0-9]', base):
            d, p = _SYLLABLE[low]
        elif mode == 'carnatic':
            key = base if base in ('s', 'p') else base.upper()
            if re.fullmatch(r'[RGMDN]', key):
                raise SargamError('%r has no variant digit; in Carnatic notation write R1-R3, G1-G3, M1-M2, D1-D3, N1-N3' % tok)
            if key not in _CARNATIC:
                raise SargamError('unknown Carnatic swara %r' % tok)
            d, p = _CARNATIC[key]
        else:
            if base not in _HINDUSTANI:
                raise SargamError('unknown swara %r (Hindustani: S r R g G m M P d D n N; syllables: sa re ga ma pa dha ni, kre kga kdha kni, tma)' % tok)
            d, p = _HINDUSTANI[base]
        if octv is None and unmarked == 'madhya':
            octv = 0
        out.append(Note(d, p, octv, tok))
    return out


def _as_note(x: NoteLike) -> Note:
    if isinstance(x, Note):
        return x
    if len(x) == 2:
        return Note(x[0], x[1])
    return Note(x[0], x[1], x[2])


# ----------------------------------------------------------------------------- direction and magnitude (kept apart)

def degree_direction(d1: int, d2: int) -> int:
    """DIRECTION, from degrees only: signed degree step wrapped to -3..+3. Never ambiguous because 7 is odd."""
    return ((d2 - d1 + 3) % 7) - 3


def pitch_magnitude(dd: int, p1: int, p2: int) -> int:
    """MAGNITUDE, from pitch classes only, measured in the direction dd already decided by the degrees."""
    if dd > 0:
        return (p2 - p1) % 12
    if dd < 0:
        return -((p1 - p2) % 12)
    return ((p2 - p1 + 6) % 12) - 6          # same degree (komal -> shuddha): a small move either way


def shortest_pitch_delta(p1: int, p2: int) -> int:
    return ((p2 - p1 + 6) % 12) - 6


# --------------------------------------------------------------------------------------------------- step results

@dataclass
class Step:
    value: int                 # signed semitones
    dd: int                    # signed degree step, -3..+3
    source: str                # 'marker' | 'inferred' | 'guard'
    from_token: str = ''
    to_token: str = ''
    suspect: bool = False      # True if the direction rests on an unresolved 4th/5th ambiguity or on the guard
    warnings: List[str] = field(default_factory=list)


def step_between(a: NoteLike, b: NoteLike) -> Step:
    a, b = _as_note(a), _as_note(b)
    dd = degree_direction(a.degree, b.degree)
    inferred = pitch_magnitude(dd, a.pc, b.pc)
    st = Step(inferred, dd, 'inferred', a.label(), b.label())
    if a.octave is not None and b.octave is not None:                 # both explicit: the marker wins
        exact = (12 * b.octave + b.pc) - (12 * a.octave + a.pc)
        if exact != inferred:
            st.warnings.append('marker overrides the inferred step (%+d) for %s -> %s' % (inferred, st.from_token, st.to_token))
        st.value, st.source = exact, 'marker'
        return st
    if abs(inferred) > MAX_LEGIT_STEP:                                # degree and pitch disagree (Carnatic enharmonic pairs)
        st.value = shortest_pitch_delta(a.pc, b.pc)
        st.source = 'guard'                     # the direction now comes from the pitch itself, so it is not an octave ambiguity
        st.warnings.append('%s -> %s: degree says %s but pitch moves %+d; used the pitch move, not %+d'
                           % (st.from_token, st.to_token, 'up' if dd > 0 else 'down', st.value, inferred))
    elif abs(dd) == 3:
        st.suspect = True
        st.warnings.append('%s -> %s read as %+d (a 4th %s); it could be a 5th the other way. Add octave markers to settle it.'
                           % (st.from_token, st.to_token, inferred, 'up' if dd > 0 else 'down'))
    return st


def _apply_sa_conventions(st: Step, ns: List[Note], i: int, kind: str) -> None:
    """Two conventions for an unmarked +-3 degree step that touches Sa (the 4th/5th ambiguity), opt-in via sa_conventions:

    1. Opening Sa. An aroha starts on its lowest Sa and an avaroha on its highest, so a leap away from the opening Sa (or from
       a run of opening Sa's) goes in the scale's direction: `S P` in an aroha is +7, `S M` in an avaroha is -7.
    2. Middle Sa. An unmarked Sa in the middle of a scale (neither the first nor the last note) is a return to the nearest Sa, so
       the shorter reading is kept: `M S` in an aroha falls (-5), `S P` after a middle Sa falls (-5).
    Dips of one or two degrees (`S N`, `S D`) are not touched.
    """
    a, b = ns[i], ns[i + 1]
    if st.source != 'inferred' or abs(st.dd) != 3 or a.octave is not None or b.octave is not None:
        return
    opening = a.degree == 0 and all(n.degree == 0 and n.octave is None for n in ns[:i + 1])
    if opening:
        if kind == 'aroha' and st.value < 0:
            st.value += 12
        elif kind == 'avaroha' and st.value > 0:
            st.value -= 12
        st.suspect = False
        st.warnings = [w for w in st.warnings if 'could be a 5th' not in w]
        st.warnings.append('%s -> %s taken in the direction of the scale (%+d): a leap away from the opening Sa' % (st.from_token, st.to_token, st.value))
        return
    last = len(ns) - 1
    mid_sa = (a.degree == 0 and 0 < i < last) or (b.degree == 0 and 0 < i + 1 < last)
    if mid_sa:
        st.suspect = False
        st.warnings = [w for w in st.warnings if 'could be a 5th' not in w]
        st.warnings.append('%s -> %s: the nearest reading (%+d) kept for an Sa in the middle of the scale' % (st.from_token, st.to_token, st.value))


def _chain(ns: List[Note], start_octave: int, kind: Optional[str] = None, sa_conventions: bool = False) -> Tuple[List[Step], int, List[int]]:
    """Steps for a phrase whose first note (if unmarked) sits in start_octave; the number of markers that had to override the
    inferred position; and the positions."""
    out: List[Step] = []
    conflicts = 0
    pos = 12 * (ns[0].octave if ns[0].octave is not None else start_octave) + ns[0].pc
    positions = [pos]
    for i, (a, b) in enumerate(zip(ns, ns[1:])):
        st = step_between(a, b)
        if sa_conventions and kind:
            _apply_sa_conventions(st, ns, i, kind)
        if st.source != 'marker' and b.octave is not None:
            anchored = 12 * b.octave + b.pc
            if anchored != pos + st.value:
                conflicts += 1
                st.warnings.append('marker on %s overrides the inferred step (%+d) for %s -> %s'
                                   % (b.label(), st.value, st.from_token, st.to_token))
                st.value, st.source, st.suspect = anchored - pos, 'marker', False
        pos += st.value
        positions.append(pos)
        out.append(st)
    return out, conflicts, positions


def _cost(ns: List[Note], conflicts: int, positions: List[int]) -> int:
    """Marker conflicts, plus one for every unmarked note pushed outside the middle octave (unmarked means madhya by convention)."""
    return conflicts + sum(1 for n, p in zip(ns, positions) if n.octave is None and not 0 <= p < 12)


def _analyse(ns: List[Note], kind: Optional[str] = None, sa_conventions: bool = False) -> Tuple[List[Step], int]:
    """-> (steps, octave the first note was placed in). See analyse_steps()."""
    best, best_c, best_pos = _chain(ns, 0, kind, sa_conventions)
    best_k = 0
    if ns[0].octave is None and best_c and any(n.octave is not None for n in ns[1:]):
        best_cost = _cost(ns, best_c, best_pos)
        for k in (-1, 1, -2, 2):
            cand, c, pos = _chain(ns, k, kind, sa_conventions)
            cost = _cost(ns, c, pos)
            if cost < best_cost:
                best, best_c, best_k, best_cost = cand, c, k, cost
        if best_k != 0 and best:
            best[0].warnings.append("first note %s placed %d octave(s) %s the middle octave because the phrase's octave markers agree with that"
                                    % (ns[0].label(), abs(best_k), 'below' if best_k < 0 else 'above'))
    return best, (ns[0].octave if ns[0].octave is not None else best_k)


def analyse_steps(notes: Sequence[NoteLike], kind: Optional[str] = None, sa_conventions: bool = False) -> List[Step]:
    """Steps for a whole phrase. Positions are tracked as the phrase goes, so a marked note anchors the position: if its marker
    contradicts where the inferred steps have led, the marker wins and the step into it is the marker-derived one.

    The first note is assumed to be in the middle octave unless it is marked, but a marker later in the phrase outranks that
    assumption: if the phrase has markers and starting one octave lower (or higher) makes them agree with the inferred steps,
    that start is used, and the first step says so. (`N, S ...` written as `N S ... S'`: the mandra mark was left off.)
    """
    ns = [_as_note(n) for n in notes]
    return _analyse(ns, kind, sa_conventions)[0] if ns else []


def semitone_steps(notes: Sequence[NoteLike], guard: bool = True) -> List[int]:
    """Signed semitone step for each consecutive pair. guard=False is the plain formula (no marker or enharmonic handling)."""
    if guard:
        return [s.value for s in analyse_steps(notes)]
    ns = [_as_note(n) for n in notes]
    return [pitch_magnitude(degree_direction(a.degree, b.degree), a.pc, b.pc) for a, b in zip(ns, ns[1:])]


def absolute_positions(notes: Sequence[NoteLike], kind: Optional[str] = None, sa_conventions: bool = False) -> Tuple[List[int], List[str]]:
    """Absolute pitch of every note in semitones (Sa of the middle octave = 0), plus the marker-override warnings.

    The first note sits at its pitch class plus its marker, or in the octave analyse_steps() chose for it. Every later position
    is the previous one plus the step, so positions are exactly the running total of analyse_steps(); marked notes land on
    12*octave + pitch_class.
    """
    ns = [_as_note(n) for n in notes]
    if not ns:
        return [], []
    steps, octave = _analyse(ns, kind, sa_conventions)
    pos = [12 * octave + ns[0].pc]
    for st in steps:
        pos.append(pos[-1] + st.value)
    return pos, [w for st in steps if st.source == 'marker' for w in st.warnings]


# --------------------------------------------------------------------------------------------------- scale checks

@dataclass
class ScaleCheck:
    applicable: bool
    expected: Optional[int] = None
    actual: Optional[int] = None
    ok: Optional[bool] = None
    message: str = ''


def check_scale(notes: Sequence[NoteLike], steps: Sequence[int], kind: str) -> ScaleCheck:
    """A one-octave aroha from Sa to Sa' sums to +12; an avaroha from Sa' to Sa sums to -12. Only checked when the phrase starts
    and ends on Sa. Steps are consistent mod 12, so a wrong total is a whole number of octaves out."""
    ns = [_as_note(n) for n in notes]
    if kind not in ('aroha', 'avaroha'):
        raise ValueError("kind must be 'aroha' or 'avaroha'")
    if len(ns) < 2 or ns[0].pc != 0 or ns[-1].pc != 0 or ns[0].degree != 0 or ns[-1].degree != 0:
        return ScaleCheck(False, message='not checked: the phrase does not start and end on Sa')
    expected = 12 if kind == 'aroha' else -12
    actual = sum(steps)
    if actual == expected:
        return ScaleCheck(True, expected, actual, True, 'ok')
    k = (actual - expected) // 12
    msg = '%s sums to %+d, expected %+d: off by %d octave(s), so a leap of a 5th or more was probably read the wrong way' % (kind, actual, expected, k)
    if actual == 2 * expected:
        msg += ' (or this is a genuine two-octave scale)'
    msg += '. Add octave markers.'
    return ScaleCheck(True, expected, actual, False, msg)


def close_octave(notes: Sequence[NoteLike], kind: str) -> Tuple[List[Note], Optional[str]]:
    """Opt-in helper for a plain one-octave Sa..Sa' scale: mark the closing Sa of an aroha (or the opening Sa of an avaroha) as
    the upper octave and every other note as the middle octave. Skipped (with a reason) when it would be a guess."""
    ns = [_as_note(n) for n in notes]
    if len(ns) < 2 or ns[0].degree != 0 or ns[-1].degree != 0:
        return ns, 'close_octave not applied: the phrase does not start and end on Sa'
    if any(n.degree == 0 for n in ns[1:-1]):
        return ns, 'close_octave not applied: there is an Sa inside the phrase, so the octave is not implied'
    if any(n.octave is not None for n in ns):
        return ns, 'close_octave not applied: the phrase already has octave markers'
    out = [n._replace(octave=0) for n in ns]
    if kind == 'aroha':
        out[-1] = out[-1]._replace(octave=1)
    else:
        out[0] = out[0]._replace(octave=1)
    return out, None


# ------------------------------------------------------------------------------------------------------- vakra

@dataclass
class Trigger:
    part: str                  # 'aroha' | 'avaroha'
    index: int                 # step number within the phrase (0-based)
    from_token: str
    to_token: str
    step: int
    suspect: bool
    reason: str


@dataclass
class PhraseReport:
    kind: str
    notes: List[Note]
    steps: List[Step]
    positions: List[int]
    check: ScaleCheck
    warnings: List[str] = field(default_factory=list)


@dataclass
class VakraResult:
    is_vakra: bool
    triggers: List[Trigger]
    aroha: PhraseReport
    avaroha: PhraseReport
    warnings: List[str]
    reliable: bool             # False only when there are triggers and every one of them rests on an unresolved 4th/5th ambiguity

    def __bool__(self) -> bool:
        return self.is_vakra


def _phrase(x: Union[str, Sequence[NoteLike]], kind: str, notation: str, unmarked: str, close: bool, sa_conventions: bool = False) -> PhraseReport:
    notes = parse(x, notation, unmarked) if isinstance(x, str) else [_as_note(n) for n in x]
    warnings: List[str] = []
    if close:
        notes, why = close_octave(notes, kind)
        if why:
            warnings.append(why)
    steps = analyse_steps(notes, kind, sa_conventions)
    positions, _ = absolute_positions(notes, kind, sa_conventions)
    for s in steps:
        warnings += s.warnings
    return PhraseReport(kind, notes, steps, positions, check_scale(notes, [s.value for s in steps], kind), warnings)


def is_vakra(aroha, avaroha, notation: str = 'auto', unmarked: str = 'infer', close: bool = False, sa_conventions: bool = False) -> VakraResult:
    """Vakra means the pitch zig-zags: any step down in the aroha or any step up in the avaroha. Returns which steps triggered it.

    aroha / avaroha: sargam strings or lists of notes. close=True applies close_octave() to plain Sa..Sa' scales.
    sa_conventions=True applies the two Sa conventions of _apply_sa_conventions() (opening Sa leaps go in the scale's direction;
    an Sa in the middle of a scale keeps the nearest reading), which settles most +-3 degree ambiguities around Sa.
    """
    ar = _phrase(aroha, 'aroha', notation, unmarked, close, sa_conventions)
    av = _phrase(avaroha, 'avaroha', notation, unmarked, close, sa_conventions)
    triggers: List[Trigger] = []
    for rep, bad in ((ar, lambda v: v < 0), (av, lambda v: v > 0)):
        for i, s in enumerate(rep.steps):
            if bad(s.value):
                why = ('%s step %s -> %s is %+d (%s)' % (rep.kind, s.from_token, s.to_token, s.value, 'falls' if s.value < 0 else 'rises'))
                if s.suspect:
                    why += '; direction rests on a 4th/5th ambiguity or the enharmonic guard'
                triggers.append(Trigger(rep.kind, i, s.from_token, s.to_token, s.value, s.suspect, why))
    warnings = ar.warnings + av.warnings
    for rep in (ar, av):
        if rep.check.applicable and not rep.check.ok:
            warnings.append(rep.check.message)
    # A Yes is certain if any one trigger is unambiguous (each step is judged on its own). A No is certain when no step turns back.
    # Only a Yes whose every trigger rests on an unresolved 4th/5th ambiguity is unreliable. A failed +12/-12 sum stays a warning.
    reliable = (not triggers) or any(not t.suspect for t in triggers)
    return VakraResult(bool(triggers), triggers, ar, av, warnings, reliable)


# ---------------------------------------------------------------------------------------------------------- CLI

def _fmt_steps(rep: PhraseReport) -> str:
    return ' '.join('%+d' % s.value for s in rep.steps)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='Sargam -> signed semitone steps, and a vakra check.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--notation', choices=['auto', 'hindustani', 'carnatic'], default='auto')
    common.add_argument('--unmarked', choices=['infer', 'madhya'], default='infer',
                        help="how to treat notes without an octave marker (default: infer the direction)")
    common.add_argument('--json', action='store_true')
    p1 = sub.add_parser('steps', parents=[common], help='signed semitone steps for one phrase')
    p1.add_argument('phrase')
    p1.add_argument('--kind', choices=['aroha', 'avaroha'], help='also run the +12/-12 sum check')
    p2 = sub.add_parser('vakra', parents=[common], help='vakra check for an aroha and avaroha')
    p2.add_argument('--aroha', required=True)
    p2.add_argument('--avaroha', required=True)
    p2.add_argument('--close-octave', action='store_true', help="treat a plain Sa..Sa' scale as one octave (opt-in)")
    p2.add_argument('--sa-conventions', action='store_true', help='opening-Sa leaps go in the scale direction; a middle Sa keeps the nearest reading (opt-in)')
    a = ap.parse_args(argv)
    try:
        if a.cmd == 'steps':
            notes = parse(a.phrase, a.notation, a.unmarked)
            steps = analyse_steps(notes)
            pos, pw = absolute_positions(notes)
            chk = check_scale(notes, [s.value for s in steps], a.kind) if a.kind else None
            if a.json:
                print(json.dumps({'steps': [asdict(s) for s in steps], 'positions': pos, 'check': asdict(chk) if chk else None,
                                  'warnings': pw + [w for s in steps for w in s.warnings]}, indent=2))
            else:
                print('steps:     ', ' '.join('%+d' % s.value for s in steps))
                print('positions: ', ' '.join('%+d' % p for p in pos))
                if chk:
                    print('sum check: ', chk.message)
                for w in pw + [w for s in steps for w in s.warnings]:
                    print('warning:   ', w)
        else:
            r = is_vakra(a.aroha, a.avaroha, a.notation, a.unmarked, a.close_octave, a.sa_conventions)
            if a.json:
                print(json.dumps({'is_vakra': r.is_vakra, 'reliable': r.reliable, 'triggers': [asdict(t) for t in r.triggers],
                                  'aroha_steps': [s.value for s in r.aroha.steps], 'avaroha_steps': [s.value for s in r.avaroha.steps],
                                  'warnings': r.warnings}, indent=2))
            else:
                print('vakra:   ', 'YES' if r.is_vakra else 'no', '' if r.reliable else '(not fully reliable, see warnings)')
                print('aroha:   ', _fmt_steps(r.aroha), '|', r.aroha.check.message)
                print('avaroha: ', _fmt_steps(r.avaroha), '|', r.avaroha.check.message)
                for t in r.triggers:
                    print('trigger: ', t.reason)
                for w in r.warnings:
                    print('warning: ', w)
    except SargamError as e:
        print('error:', e, file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
