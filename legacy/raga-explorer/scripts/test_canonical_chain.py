"""Tests for canonical_chain.py. Run only this file:  python -m pytest scripts/test_canonical_chain.py"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from canonical_chain import canonical_chain, steps  # noqa: E402


def test_octave_marks_do_not_change_the_chain():
    plain = canonical_chain("S R1 M1 P D1 S", "S N2 S P D1 M1 P R1 G2 R1 S")
    marked = canonical_chain("S R1 M1 P D1 S'", "S' N2 S P D1 M1 P R1 G2 R1 S")
    assert plain == marked
    assert plain[1][0] == 12 and plain[1][-1] == 0


def test_no_leap_of_14_when_the_closing_sa_is_marked():
    plain = canonical_chain("S R1 G2 M1 S P M1 D1 N2 S", "S N2 D1 P M1 G2 R1 S")
    marked = canonical_chain("S R1 G2 M1 S P M1 D1 N2 S'", "S' N2 D1 P M1 G2 R1 S")
    assert plain == marked
    a, v = plain
    assert a[-1] == 12 and max(abs(x) for x in steps(a) + steps(v)) <= 8


def test_an_ambiguous_tritone_step_is_resolved_by_closing_the_octave():
    # N2 to G3 is +6 or -6; only the fall lets the aroha close on the upper Sa
    a, v = canonical_chain("S R1 M1 D2 N2 G3 P S'", "S' P G3 N2 D2 M1 R1 S")
    assert a == [0, 1, 5, 9, 10, 4, 7, 12]
    assert v[0] == 12 and v[-1] == 0


def test_a_scale_opening_on_the_lower_ni_sits_below_sa():
    a, v = canonical_chain("N2 S R1 G2 M1 P D1 N2", "N2 D1 P M1 G2 R1 S N2")
    assert a[:2] == [-2, 0] and v[0] == a[-1] and v[-1] == -2


def test_a_scale_without_an_opening_sa_sits_in_the_middle_octave():
    a, v = canonical_chain("R1 M1 P D1 N3 S", "S N3 D1 P M1 G1 R1 S")
    assert a == [1, 5, 7, 8, 11, 12]
    assert v[0] == 12 and v[-1] == 0


def test_lower_octave_opening_is_found_without_marks():
    a, _ = canonical_chain("G2 P N3 S R2 G2 M1 P D1", "P M2 P R2 M1 G2 S")
    assert a[:4] == [-9, -5, -1, 0]


def test_the_opening_sa_leap_goes_in_the_direction_of_the_part():
    a, v = canonical_chain("S R2 G2 M1 P S", "S M1 G2 R2 S")
    assert canonical_chain("S P M1 S", "S N2 P S")[0][:2] == [0, 7]          # S P in an aroha is +7
    assert v[:2] == [12, 5]                                                  # S M in an avaroha is -7


def test_the_avaroha_starts_where_the_aroha_ended():
    a, v = canonical_chain("S R2 M1 P D2 N2 S", "R2 S N2 S D2 P M1 R2 G2 G2 R2 S")
    assert a[-1] == 12 and v[0] == 14                                        # the nearest R2 to the upper Sa


def test_an_avaroha_written_upward_is_left_open_not_forced_into_a_jump():
    a, v = canonical_chain("S R1 G2 M1 P D1 N2 S", "S R1 G2 M1 P D1 N2 S")   # Janatodi's avaroha is the aroha
    assert max(abs(x) for x in steps(a) + steps(v)) <= 8
    _, _, note = canonical_chain("S R1 G2 M1 P D1 N2 S", "S R1 G2 M1 P D1 N2 S", "Yes", with_note=True)
    assert 'not closed' in note


def test_vakulasree_ni_to_ma_is_a_leap_down_not_up():
    # the user first read N2 to M2 as a leap up (Vakra No), then corrected it: it is a fall back to the earlier Ma (Vakra Yes)
    a, v, note = canonical_chain("S R1 G1 M2 D2 N2 M2 P N2 S'", "S' D2 P M2 G1 R1 S", "Yes", with_note=True)
    assert a == [0, 1, 2, 6, 9, 10, 6, 7, 10, 12]
    assert note == ''


def test_a_ruled_vakra_can_force_a_leap_when_the_default_reading_disagrees():
    # a synthetic case: the nearest reading of N2 to M2 falls (an aroha turn), but a Vakra ruling of No requires it read as a rise instead
    a, v, note = canonical_chain("S N2 M2 S", "S M2 N2 S", "No", with_note=True)
    default, _, default_note = canonical_chain("S N2 M2 S", "S M2 N2 S", None, with_note=True)
    assert any(x < 0 for x in steps(default))          # unruled, the nearest reading is a fall
    assert not any(x < 0 for x in steps(a))             # ruled No, the fall is not allowed
    assert 'forced' in note


def test_default_reading_has_no_note():
    _, _, note = canonical_chain("S R2 G3 M1 P D2 N3 S", "S N3 D2 P M1 G3 R2 S", "No", with_note=True)
    assert note == ''
