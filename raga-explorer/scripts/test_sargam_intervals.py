"""pytest suite for sargam_intervals.py.  Run only this file:  python -m pytest scripts/test_sargam_intervals.py -q

The raga scales below are the plain textbook skeletons, used to check the arithmetic by hand (each expected list was worked out
by hand, see the comments); they are not claims about the full grammar of the raga.
"""
import itertools
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sargam_intervals as sg  # noqa: E402
from sargam_intervals import (Note, SargamError, absolute_positions, analyse_steps, check_scale, close_octave,  # noqa: E402
                              degree_direction, is_vakra, parse, pitch_magnitude, semitone_steps)


def steps(text, **kw):
    return semitone_steps(parse(text, **kw))


# ------------------------------------------------------------------------------------ the required case
def test_sa_ni_re_sa_from_tuples():
    # Sa->Ni is -1 (not +11), Ni->Re is +3 (up to the next octave's Re), Re->Sa is -2
    assert semitone_steps([(0, 0), (6, 11), (1, 2), (0, 0)]) == [-1, +3, -2]


def test_sa_ni_re_sa_from_strings():
    assert steps('S N R S') == [-1, +3, -2]
    assert steps('sa ni re sa') == [-1, +3, -2]


# ------------------------------------------------------------------------------- tritone and same-degree cases
def test_sa_to_tivra_ma_and_back():
    assert steps('S M') == [+6]        # degree 0 -> 3 is up, so +6 rather than -6
    assert steps('M S') == [-6]        # degree 3 -> 0 is down


def test_ma_to_ni_and_back():
    assert steps('m N') == [+6]        # shuddha Ma (5) -> Ni (11)
    assert steps('N m') == [-6]


def test_komal_re_to_shuddha_re_is_same_degree():
    assert steps('r R') == [+1]
    assert steps('R r') == [-1]
    assert steps('R R') == [0]


def test_degree_direction_is_never_a_tie():
    for d1, d2 in itertools.product(range(7), repeat=2):
        assert -3 <= degree_direction(d1, d2) <= 3


def test_direction_and_magnitude_are_separate():
    assert degree_direction(0, 6) == -1                 # Sa -> Ni is a step down
    assert pitch_magnitude(-1, 0, 11) == -1             # of one semitone
    assert pitch_magnitude(+3, 0, 6) == +6 and pitch_magnitude(-3, 0, 6) == -6


# ------------------------------------------------------------------------- brute force over every pair of notes
HIND = list(parse('S r R g G m M P d D n N'))
CARN = list(parse('S R1 R2 R3 G1 G2 G3 M1 M2 P D1 D2 D3 N1 N2 N3'))


@pytest.mark.parametrize('table', [HIND, CARN], ids=['hindustani', 'carnatic'])
def test_guarded_step_is_bounded_and_matches_direction(table):
    for a, b in itertools.product(table, repeat=2):
        v = semitone_steps([a, b])[0]
        assert abs(v) <= sg.MAX_LEGIT_STEP, (a, b, v)


def test_hindustani_pairs_never_need_the_guard():
    for a, b in itertools.product(HIND, repeat=2):
        assert analyse_steps([a, b])[0].source == 'inferred'


def test_plain_formula_fails_on_exactly_four_carnatic_pairs():
    bad = {(a.token, b.token) for a, b in itertools.product(CARN, repeat=2) if abs(semitone_steps([a, b], guard=False)[0]) > 8}
    assert bad == {('R3', 'G1'), ('G1', 'R3'), ('D3', 'N1'), ('N1', 'D3')}


def test_enharmonic_guard_uses_pitch_and_flags_it():
    st = analyse_steps(parse('R3 G1'))[0]
    assert st.value == -1 and st.source == 'guard' and not st.suspect and st.warnings     # exact pitch move, still warned
    assert semitone_steps(parse('R3 G1'), guard=False) == [+11]      # the plain formula's nonsense answer
    assert steps('R2 G1') == [0]                                       # same pitch, adjacent degrees: no move, no warning
    assert not analyse_steps(parse('R2 G1'))[0].warnings


# ------------------------------------------------------------------------------- full scales, hand-verified
# Yaman (Hindustani, tivra Ma): S R G M P D N S'
#   aroha  S->R 2, R->G 2, G->M(tivra) 4->6 2, M->P 1, P->D 2, D->N 2, N->S' 1          = 12
#   avaroha reversed: -1 -2 -2 -1 -2 -2 -2                                             = -12
YAMAN_AROHA = "S R G M P D N S'"
YAMAN_AVAROHA = "S' N D P M G R S"
# Bhupali: S R G P D S'   aroha 2 2 3 2 3 = 12 ; avaroha S' D P G R S  -3 -2 -3 -2 -2 = -12
BHUPALI_AROHA = "S R G P D S'"
BHUPALI_AVAROHA = "S' D P G R S"
# Marwa skeleton (Pa omitted): S r G M D N S'
#   aroha 1 3 2 3 2 1 = 12 ; avaroha S' N D M G r S  -1 -2 -3 -2 -3 -1 = -12
MARWA_AROHA = "S r G M D N S'"
MARWA_AVAROHA = "S' N D M G r S"
# Bageshree (Kafi: komal Ga, komal Ni, shuddha Ma), aroha S m D n S' : 5 4 1 2 = 12
#   avaroha S' n D m P D g m g R S : -2 -1 -4 +2 +2 -6 +2 -2 -1 -2 = -12   (D->g is the tritone case: degree 5->2 is down)
BAGESHREE_AROHA = "S m D n S'"
BAGESHREE_AVAROHA = "S' n D m P D g m g R S"


@pytest.mark.parametrize('text,expected', [
    (YAMAN_AROHA, [2, 2, 2, 1, 2, 2, 1]),
    (YAMAN_AVAROHA, [-1, -2, -2, -1, -2, -2, -2]),
    (BHUPALI_AROHA, [2, 2, 3, 2, 3]),
    (BHUPALI_AVAROHA, [-3, -2, -3, -2, -2]),
    (MARWA_AROHA, [1, 3, 2, 3, 2, 1]),
    (MARWA_AVAROHA, [-1, -2, -3, -2, -3, -1]),
    (BAGESHREE_AROHA, [5, 4, 1, 2]),
    (BAGESHREE_AVAROHA, [-2, -1, -4, 2, 2, -6, 2, -2, -1, -2]),
])
def test_known_scales(text, expected):
    assert steps(text) == expected


def test_scale_sums():
    for text, kind, total in [(YAMAN_AROHA, 'aroha', 12), (YAMAN_AVAROHA, 'avaroha', -12), (BHUPALI_AROHA, 'aroha', 12),
                              (BAGESHREE_AVAROHA, 'avaroha', -12), (MARWA_AROHA, 'aroha', 12)]:
        notes = parse(text)
        chk = check_scale(notes, semitone_steps(notes), kind)
        assert chk.applicable and chk.ok and chk.actual == total


def test_not_vakra():
    for ar, av in [(YAMAN_AROHA, YAMAN_AVAROHA), (BHUPALI_AROHA, BHUPALI_AVAROHA), (MARWA_AROHA, MARWA_AVAROHA)]:
        r = is_vakra(ar, av)
        assert not r.is_vakra and not r.triggers and r.reliable


def test_bageshree_is_vakra_and_says_which_steps():
    r = is_vakra(BAGESHREE_AROHA, BAGESHREE_AVAROHA)
    assert r.is_vakra and bool(r)
    got = [(t.part, t.index, t.from_token, t.to_token, t.step) for t in r.triggers]
    assert got == [('avaroha', 3, 'm', 'P', 2), ('avaroha', 4, 'P', 'D', 2), ('avaroha', 6, 'g', 'm', 2)]
    assert r.reliable                    # none of those rests on a 4th/5th ambiguity, and both sums check out


def test_zig_zag_in_aroha():
    r = is_vakra("S R G R G m P D N S'", YAMAN_AVAROHA)
    assert r.is_vakra and [(t.part, t.from_token, t.to_token) for t in r.triggers] == [('aroha', 'G', 'R')]


# ------------------------------------------------------------------------------------ Carnatic notation
def test_carnatic_shankarabharanam_and_vakra_variant():
    assert steps("S R2 G3 M1 P D2 N3 S'") == [2, 2, 1, 2, 2, 2, 1]
    assert steps("S' N3 D2 P M1 G3 R2 S") == [-1, -2, -2, -2, -1, -2, -2]
    r = is_vakra("S R2 G3 M2 P D2 N3 S'", "S' N3 D2 P M2 P G3 R2 S")        # Kalyani variant: M2 -> P rises in the avaroha
    assert r.is_vakra and [(t.from_token, t.to_token, t.step) for t in r.triggers] == [('M2', 'P', 1)]


def test_carnatic_enharmonic_pair_is_the_same_pitch_but_a_different_degree():
    assert analyse_steps(parse('R2 G1'))[0].dd == 1 and steps('R2 G1') == [0]


# --------------------------------------------------------------------------- the 5th-or-more limitation and markers
def test_sa_to_pa_is_read_as_a_fourth_down_and_warned():
    st = analyse_steps(parse('S P'))[0]
    assert st.value == -5 and st.suspect and st.source == 'inferred' and 'octave markers' in st.warnings[0]


def test_explicit_markers_override_the_inference():
    st = analyse_steps(parse('S= P='))[0]
    assert st.value == +7 and st.source == 'marker' and st.warnings          # overrides the inferred -5, and says so
    assert steps('S= P=') == [7]
    assert steps("S' P=") == [-5]                                          # upper Sa down to middle Pa
    assert steps("N, S=") == [1]
    assert steps("S= S'") == [12]                                          # same degree, an octave apart


def test_unmarked_madhya_mode_makes_a_phrase_explicit():
    assert steps('S P', unmarked='madhya') == [7]
    assert steps("S R G m P D N S'", unmarked='madhya') == [2, 2, 1, 2, 2, 2, 1]


def test_marker_spellings():
    assert [n.octave for n in parse("S'' S' S= S, S,, 'S S")] == [2, 1, 0, -1, -2, -1, None]


def test_absolute_positions_and_reanchoring():
    pos, w = absolute_positions(parse("N, S R G", unmarked='madhya'))
    assert pos == [-1, 0, 2, 4] and not w
    pos, w = absolute_positions(parse("S P R'"))              # S then P inferred as -5, but R' anchors at +14
    assert pos == [0, -5, 14] and any('marker on' in x for x in w)
    ns = parse("S R G m S'")                                    # one marker on the closing Sa is enough
    p, _ = absolute_positions(ns)
    assert p == [0, 2, 4, 5, 12] and p[-1] - p[0] == sum(semitone_steps(ns))


def test_mandra_dip_is_read_as_down_and_up():
    # S N S: Sa down to Ni (-1) and back up (+1): a genuine zig-zag when the aroha is 'S N S R G ...'
    assert steps('S N S') == [-1, 1]
    r = is_vakra("S N S R G M P D N S'", YAMAN_AVAROHA)
    assert r.is_vakra and r.triggers[0].step == -1


# ---------------------------------------------------------------------------------------------- sum check
def test_sum_check_flags_a_misread_leap():
    notes = parse("S R G m S")                                # closing Sa read as a 4th DOWN from Ma: -5
    st = semitone_steps(notes)
    assert st[-1] == -5 and sum(st) == 0
    chk = check_scale(notes, st, 'aroha')
    assert chk.applicable and not chk.ok and 'off by -1 octave' in chk.message
    assert is_vakra("S R G m S", "S' m G R S").reliable is False       # a triggered aroha step from a suspect leap is not reliable


def test_sum_check_fixed_by_marker_or_close_octave():
    notes = parse("S R G m S'")
    assert check_scale(notes, semitone_steps(notes), 'aroha').ok
    r = is_vakra("S R G m S", "S m G R S", close=True)          # plain scale, octave closed on request
    assert not r.is_vakra and r.reliable
    r = is_vakra("S R G m S'", "S' m G R S", unmarked='madhya')   # or every note explicit
    assert not r.is_vakra and r.reliable and r.avaroha.steps[0].value == -7
    r = is_vakra("S R G m S'", "S' m G R S")                      # S' alone leaves S' -> m ambiguous: flagged, not guessed
    assert r.is_vakra and not r.reliable and r.triggers[0].suspect


def test_close_octave_refuses_to_guess():
    _, why = close_octave(parse("S R S G S"), 'aroha')
    assert why and 'inside' in why
    _, why = close_octave(parse("N S R"), 'aroha')
    assert why and 'start and end' in why


def test_sum_check_not_applicable_off_sa():
    notes = parse("N, S R G")
    assert not check_scale(notes, semitone_steps(notes), 'aroha').applicable


def test_two_octave_scale_message():
    notes = parse("S R G M P D N S' R' G' M' P' D' N' S''")
    st = semitone_steps(notes)                                 # unmarked middle notes: R' G' ... are anchored by their markers
    assert sum(st) == 24
    chk = check_scale(notes, st, 'aroha')
    assert chk.applicable and not chk.ok and 'two-octave' in chk.message and chk.actual == 24


# -------------------------------------------------------------------------------------------------- parsing
@pytest.mark.parametrize('text', ['S X R', 'Q', "S 'R'", "S,' R", 'S R2 G', "S R= ' M", 'S, R'.replace('R', 'ZZ'), ''])
def test_unknown_or_malformed_tokens_are_rejected(text):
    with pytest.raises(SargamError):
        parse(text)


def test_carnatic_bare_letter_error_names_the_problem():
    with pytest.raises(SargamError, match='no variant digit'):
        parse('S R2 G3 M P')


def test_syllables_and_letter_aliases():
    assert steps('sa kre kga tma pa kdha kni sa') == steps('S r g M P d n S')
    assert steps('s p') == steps('S P')


def test_forced_notation():
    assert parse('R', notation='hindustani')[0].pc == 2
    with pytest.raises(SargamError):
        parse('R', notation='carnatic')


def test_plain_tuples_and_notes_interoperate():
    assert semitone_steps([Note(0, 0), (6, 11, None), (1, 2, None, 'x')]) == [-1, 3]


def test_cli(capsys):
    assert sg.main(['steps', 'S N R S']) == 0
    assert '-1 +3 -2' in capsys.readouterr().out
    assert sg.main(['vakra', '--aroha', "S R G M P D N S'", '--avaroha', "S' N D P M G R S"]) == 0
    assert 'no' in capsys.readouterr().out
    assert sg.main(['steps', 'S X']) == 2


# ------------------------------------------------------- markers outrank the "first note is madhya" assumption
def test_mandra_start_written_without_its_marker():
    # sources often write `N S ... S'` for `N, S ... S'`; the later S' marker shows the first N was the lower one
    notes = parse("N S R G M P D N S'")
    st = analyse_steps(notes)
    assert [s.value for s in st] == [1, 2, 2, 2, 1, 2, 2, 1]
    assert 'below the middle octave' in st[0].warnings[0]
    pos, _ = absolute_positions(notes)
    assert pos[0] == -1 and pos[-1] == 12
    assert is_vakra("N2 S M1 P N2 S'", "S' N2 D2 P M1 G2 R2 S").is_vakra is False


def test_no_markers_means_no_octave_shift():
    st = analyse_steps(parse("N S R G"))
    assert [s.value for s in st] == [1, 2, 2] and not st[0].warnings
    pos, _ = absolute_positions(parse("N S R G"))
    assert pos[0] == 11                                             # nothing outranks the middle-octave assumption


def test_marker_frame_is_kept_when_the_start_is_already_right():
    st = analyse_steps(parse("S R G m P D N S'"))
    assert [s.value for s in st] == [2, 2, 1, 2, 2, 2, 1] and not any(s.warnings for s in st)


def test_positions_are_the_running_total_of_steps():
    for text in ["N S R G M P D N S'", "S R G m S'", "S= P= R'", "S' m G R S", "S N S R G"]:
        n = parse(text)
        pos, _ = absolute_positions(n)
        assert [b - a for a, b in zip(pos, pos[1:])] == semitone_steps(n)


# ------------------------------------------------------------------------------------------------ reliability
def test_one_unambiguous_trigger_makes_a_yes_reliable():
    # M -> R is a plain fall of a whole tone; the closing m -> S (read -5) is ambiguous but does not matter
    r = is_vakra("S R G m G R m S", "S' m G R S")
    assert r.is_vakra and r.reliable
    assert any(not t.suspect for t in r.triggers) and any(t.suspect for t in r.triggers)


def test_yes_resting_only_on_an_ambiguous_step_is_unreliable():
    r = is_vakra("S P D N S'", "S' N D P S")            # S -> P read as -5 (it is a leap up to Pa)
    assert r.is_vakra and not r.reliable and all(t.suspect for t in r.triggers)


def test_no_is_reliable_even_with_ambiguous_steps_in_the_right_direction():
    r = is_vakra("S R G m P D N S'", "S' N D P m G R S")
    assert not r.is_vakra and r.reliable


# ---------------------------------------------------------------------------------------------- Sa conventions
def vk(ar, av, **kw):
    return is_vakra(ar, av, notation='carnatic', close=True, **kw)


def test_conventions_are_opt_in():
    r = vk("S P D3 N3 S'", "S' N3 D3 P M1 G3 R1 S")                      # Kallola
    assert r.is_vakra and not r.reliable                                   # default: the S -> P leap is read as -5 and flagged


def test_opening_sa_leap_goes_in_the_direction_of_the_scale():
    r = vk("S P D3 N3 S'", "S' N3 D3 P M1 G3 R1 S", sa_conventions=True)
    assert not r.is_vakra and r.reliable
    assert [s.value for s in r.aroha.steps][0] == 7                        # S -> P is +7 in an aroha
    assert 'opening Sa' in r.aroha.steps[0].warnings[0]
    r = vk("M1 P D1 N2 S R2 G2 M1 P S", "S M1 G2 R2 S N2 D1 P M1", sa_conventions=True)   # Sowmya Manohari
    assert r.avaroha.steps[0].value == -7 and not r.is_vakra and r.reliable                 # S -> M1 is -7 in an avaroha


def test_a_run_of_opening_sas_counts_as_the_opening():
    r = vk("S R2 G3 M1 P S", "S S M1 G3 R2 S", sa_conventions=True)       # ratnabhUSaNi
    assert not r.is_vakra and r.reliable and r.avaroha.steps[1].value == -7


def test_middle_sa_keeps_the_nearest_reading_so_m_s_is_a_turn():
    r = vk("S R1 G3 M1 S P D2 N2 S", "S D2 M1 G3 S", sa_conventions=True)   # Guha Priya
    assert r.is_vakra and r.reliable
    assert [(t.from_token, t.to_token, t.step, t.suspect) for t in r.triggers] == [('M1', 'S', -5, False), ('S', 'P', -5, False)]
    r = vk("S R1 G3 M1 P D1 N1 S P N1 S", "S N1 D1 P G3 R1 S", sa_conventions=True)  # Sarva Mangala: S -> P after a middle Sa
    assert r.is_vakra and r.reliable


def test_conventions_leave_dips_and_marked_notes_alone():
    r = vk("S N3 S R1 G3 M1 P D1 N3 S'", "S' N3 D1 P M1 G3 R1 S", sa_conventions=True)
    assert r.aroha.steps[0].value == -1 and r.is_vakra                     # S N is a dip, not an opening leap
    st = analyse_steps(parse("S= P="), 'aroha', True)[0]
    assert st.value == 7 and st.source == 'marker'


def test_closing_sa_is_still_ambiguous_without_close_octave():
    r = is_vakra("S R G M S", "S' M G R S", notation='hindustani', sa_conventions=True)
    assert r.is_vakra and not r.reliable                                   # the final S is not a *middle* Sa


def test_marks_on_the_notes_after_a_leap_up_settle_it():
    # Vakulasree: N2 -> M2 is a leap up to the upper Ma, written with octave marks
    r = vk("S R1 G1 M2 D2 N2 M2' P' N2' S''", "S' D2 P M2 G1 R1 S", sa_conventions=True)
    assert not r.is_vakra and r.reliable and r.aroha.steps[5].value == 8
