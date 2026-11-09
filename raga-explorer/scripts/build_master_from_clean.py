"""Combine the CLEAN-*.csv lists in `raga lists/` into one stacked master database.

One master row per source row, nothing merged or dropped. Every original column is kept; added columns give a
notation-free view of each scale (absolute semitones, 12-bit pitch set, note order) so later cleaning does not have
to parse sargam text. The semitone columns and the Vakra reliability columns come from sargam_intervals.py (the same
module that sets the Vakra column), read as Carnatic notation with close=True. Merging duplicate ragas across sources
is a later step.

Output: raga lists/ALL-SOURCE-ROWS-carnatic-raga-database.csv  (UTF-8, CRLF, same as the CLEAN lists)
"""
import csv, os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sargam_intervals import SargamError, absolute_positions, close_octave, is_vakra, parse  # noqa: E402

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'raga lists')
OUT = os.path.join(BASE, 'ALL-SOURCE-ROWS-carnatic-raga-database.csv')
RULINGS = os.path.join(BASE, 'vakra-rulings.csv')

# (code, file) in priority order
SOURCES = [
    ('PRAVAGAM', 'CLEAN-raga-pravagam-list.csv'),
    ('MUSICLEGATO', 'CLEAN-musiclegato-carnatic-raga-list.csv'),
    ('NERUR', 'CLEAN-nerur-carnatic-raga-list.csv'),
    ('WIKIPEDIA', 'CLEAN-wikipedia-janya-raga-list.csv'),
    ('RAGA-OF-THE-WEEK', 'CLEAN-raga-of-the-week-repo-list.csv'),
    ('ROYAL-CARPET', 'CLEAN-royal-carpet-janya-list.csv'),
    ('PASTED', 'CLEAN-carnatic-pasted-dataset-list.csv'),
]

SEMI = {'S': 0, 'R1': 1, 'R2': 2, 'R3': 3, 'G1': 2, 'G2': 3, 'G3': 4, 'M1': 5, 'M2': 6, 'P': 7,
        'D1': 8, 'D2': 9, 'D3': 10, 'N1': 9, 'N2': 10, 'N3': 11}


def scale_columns(text, up):
    """-> (absolute semitones 'a b c', pitch-class set as 12-char binary, decimal, note order, problem or '')"""
    if not text.split():
        return '', '', '', '', 'empty'
    try:
        notes = parse(text, notation='carnatic')
    except SargamError as e:
        return '', '', '', '', 'digitless' if 'variant digit' in str(e) else 'invalid'
    notes, _ = close_octave(notes, 'aroha' if up else 'avaroha')     # a plain one-octave Sa..Sa' scale: closing Sa is the upper Sa
    pos, _ = absolute_positions(notes, 'aroha' if up else 'avaroha', True)
    pc = [n.pc for n in notes]
    used = sorted(set(pc))
    binary = ''.join('1' if i in used else '0' for i in range(12))
    order = ''.join(str(used.index(s)) for s in pc)
    return ' '.join(map(str, pos)), binary, str(int(binary, 2)), order, ''


def load_rulings():
    """{(name key, aroha, avaroha): (Yes/No, reason)}: Vakra decisions made by the user for scales the module cannot settle."""
    out = {}
    if os.path.exists(RULINGS):
        with open(RULINGS, encoding='utf-8-sig', newline='') as f:
            for r in csv.DictReader(f):
                out[(r['Name Key'], r['Aroha'].strip(), r['Avaroha'].strip())] = (r['Vakra'], r['Ruling'])
    return out


def name_key(name):
    n = re.sub(r'\s*\(Raga \d+\)\s*$', '', name)
    n = unicodedata.normalize('NFKD', n.lower())
    return re.sub(r'[^a-z]', '', n)


def variant_tag(name):
    m = re.search(r'\(Raga (\d+)\)\s*$', name)
    return m.group(1) if m else ''


def bhashanga_basis(code, value, notes=''):
    """Where a Yes/No came from. No list carries a Bhashanga column of its own: the Nerur text, the Raga of the Week CSV and the
    Musiclegato pages were checked (2026-09-21) and none states it, so a value is derived from the swaras (a swara that differs from the
    parent melakarta's). The one exception is the Wikipedia page's printed "anya swara" note, found only on the rows whose Notes say so.
    Pravagam and pasted rows only get a value when a swara is visibly off the parent (their other digits are defaults)."""
    if value not in ('Yes', 'No'):
        return ''
    if code == 'WIKIPEDIA' and 'the Wikipedia page states anya swara' in notes:
        return 'stated by source'
    return 'derived from swaras'


def main():
    extra_cols = []
    src_rows = []
    for code, fn in SOURCES:
        with open(os.path.join(BASE, fn), encoding='utf-8', newline='') as f:
            rd = csv.DictReader(f)
            for c in rd.fieldnames:
                if c not in extra_cols:
                    extra_cols.append(c)
            src_rows.append((code, fn, list(rd)))

    lead = ['Master ID', 'Source List', 'Source Row', 'Row Type', 'Melakarta Number', 'Melakarta Number (as listed)',
            'Melakarta Name', 'Raga Name', 'Variant Tag', 'Name Key', 'Aroha', 'Avaroha',
            'Aroha Semitones', 'Avaroha Semitones', 'Aroha Pitch Binary', 'Aroha Pitch Decimal', 'Aroha Note Order',
            'Avaroha Pitch Binary', 'Avaroha Pitch Decimal', 'Avaroha Note Order', 'Vakra', 'Vakra Reliable', 'Vakra Trigger Steps',
            'Bhashanga', 'Bhashanga Basis', 'Scale Check']
    original = [c for c in extra_cols if c not in lead and c not in ('Melakarta Number',)]
    fields = lead + original
    rulings = load_rulings()
    n = 0
    checks = {}
    with open(OUT, 'w', encoding='utf-8', newline='') as fo:
        w = csv.DictWriter(fo, fieldnames=fields, lineterminator='\r\n')
        w.writeheader()
        for code, fn, rows in src_rows:
            for i, r in enumerate(rows):
                n += 1
                listed = r.get('Melakarta Number', '').strip()
                mel = str(int(listed)) if listed.isdigit() and 1 <= int(listed) <= 72 else ''
                a, v = r['Aroha'].strip(), r['Avaroha'].strip()
                A = scale_columns(a, True)
                V = scale_columns(v, False)
                if not a or not v:
                    check = 'no scale printed'
                elif 'invalid' in (A[4], V[4]):
                    check = 'invalid swara token'
                elif 'digitless' in (A[4], V[4]):
                    check = 'digit-less swara'
                else:
                    check = 'ok'
                checks[(code, check)] = checks.get((code, check), 0) + 1
                reliable = steps = ''
                if check == 'ok':
                    res = is_vakra(a, v, notation='carnatic', close=True, sa_conventions=True)
                    reliable = 'yes' if res.reliable else 'no'
                    if (name_key(r['Raga Name']), a, v) in rulings:
                        reliable = 'ruled'
                    steps = '; '.join('%s %s->%s %+d' % (t.part, t.from_token, t.to_token, t.step) for t in res.triggers)
                row = {c: r.get(c, '') for c in original}
                row.update({
                    'Master ID': 'M%06d' % n, 'Source List': code, 'Source Row': i + 2, 'Row Type': r['Row Type'],
                    'Melakarta Number': mel, 'Melakarta Number (as listed)': listed,
                    'Melakarta Name': r['Melakarta Name'], 'Raga Name': r['Raga Name'],
                    'Variant Tag': variant_tag(r['Raga Name']), 'Name Key': name_key(r['Raga Name']),
                    'Aroha': a, 'Avaroha': v,
                    'Aroha Semitones': A[0], 'Avaroha Semitones': V[0],
                    'Aroha Pitch Binary': A[1], 'Aroha Pitch Decimal': A[2], 'Aroha Note Order': A[3],
                    'Avaroha Pitch Binary': V[1], 'Avaroha Pitch Decimal': V[2], 'Avaroha Note Order': V[3],
                    'Vakra': r['Vakra'], 'Vakra Reliable': reliable, 'Vakra Trigger Steps': steps,
                    'Bhashanga': r['Bhashanga'], 'Bhashanga Basis': bhashanga_basis(code, r['Bhashanga'], r.get('Notes', '')), 'Scale Check': check,
                })
                w.writerow(row)
    print('master rows', n)
    for k, v in sorted(checks.items()):
        print(' ', k, v)


if __name__ == '__main__':
    main()
