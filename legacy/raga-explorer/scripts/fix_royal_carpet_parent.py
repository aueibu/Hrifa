"""Restore each Royal Carpet janya's parent melakarta from the source page.

The source page (karnatik.com janyalist2) lists every janya under its melakarta's block, so the block IS the parent.
The CLEAN list had overwritten that with a guess from the scale (blank when no melakarta matched). This puts the page's
parent back, then redoes what depended on it: bare swara letters (given the parent's variant), Bhashanga (a swara whose
variant is not the parent's), Vakra, and the notes.

CLEAN rows are matched to the page rows (data/royal-carpet-reverse-janya-list.csv, built from the anchors) in their
original order, so a raga listed under several melakartas gets the right parent on each row.
"""
import csv, difflib, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sargam_intervals import is_vakra  # noqa: E402

RAGA_LISTS = os.path.join(HERE, '..', 'raga lists')
CLEAN = os.path.join(RAGA_LISTS, 'CLEAN-royal-carpet-janya-list.csv')
PRAV = os.path.join(RAGA_LISTS, 'CLEAN-raga-pravagam-list.csv')
EXTRACT = os.path.join(HERE, '..', 'data', 'royal-carpet-reverse-janya-list.csv')
CHANGELOG = os.path.join(RAGA_LISTS, 'royal-carpet-parent-changelog.csv')

RG = [('R1', 'G1'), ('R1', 'G2'), ('R1', 'G3'), ('R2', 'G2'), ('R2', 'G3'), ('R3', 'G3')]
DN = [('D1', 'N1'), ('D1', 'N2'), ('D1', 'N3'), ('D2', 'N2'), ('D2', 'N3'), ('D3', 'N3')]


def tmap(n):
    k = (n - 1) % 36
    r, g = RG[k // 6]
    d, nn = DN[k % 6]
    return {'R': r, 'G': g, 'M': 'M1' if n <= 36 else 'M2', 'D': d, 'N': nn}


def vakra_yes(aroha, avaroha):
    """Vakra by the pitch-based rule in sargam_intervals.py (Carnatic notation, one-octave scales closed)."""
    return is_vakra(aroha, avaroha, notation='carnatic', close=True).is_vakra


BARE = ('R', 'G', 'M', 'D', 'N')
letters = lambda s: re.sub(r"[\d'\s]", '', s)

# hand-resolved rows that the ordered match cannot pair (names/scales edited in the CLEAN list):
# (Raga Name, Row Type, Raga Name fix, Aroha fix, parent)
UNMATCHED_FIX = {
    'jhankaarabhramari': dict(parent=19),
    'gowrivElaavaLi': dict(parent=23),          # page: gaurIvELAvaLi, under melakarta 23
    'tarangini': dict(parent=26),               # page: tarangiNi variants; S R2 G3 P D1 N2 D1 S fits melakarta 26
}


def main():
    raw = open(CLEAN, 'rb').read()
    crlf = b'\r\n' in raw
    endnl = raw.endswith(b'\n')
    rows = list(csv.reader(io.StringIO(raw.decode('utf-8'), newline='')))
    H = rows[0]
    C = {h: i for i, h in enumerate(H)}
    body = rows[1:]

    # melakarta names: this list's own spelling where a row already had that melakarta, else Pravagam's spelling
    mela_name = {}
    for r in body:
        if r[C['Melakarta Number']].strip().isdigit() and r[C['Melakarta Name']]:
            mela_name.setdefault(int(r[C['Melakarta Number']]), r[C['Melakarta Name']])
    for r in csv.DictReader(open(PRAV, encoding='utf-8', newline='')):
        mela_name.setdefault(int(r['Melakarta Number']), r['Melakarta Name'])

    page = [r for r in csv.DictReader(open(EXTRACT, encoding='utf-8-sig', newline='')) if r['Row Type'] == 'Janya']
    cj = [(i, r) for i, r in enumerate(body) if r[C['Row Type']] == 'Janya']
    ka = [(r[C['Raga Name']], letters(r[C['Aroha']]), letters(r[C['Avaroha']])) for _, r in cj]
    kb = [(r['Raga Name'], letters(r['Aroha']), letters(r['Avaroha'])) for r in page]
    match = {}
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ka, kb, autojunk=False).get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                match[i1 + k] = int(page[j1 + k]['Melakarta Number'])
    log = []
    for n, (i, r) in enumerate(cj):
        old = {k: r[C[k]] for k in ('Melakarta Number', 'Melakarta Name', 'Raga Name', 'Row Type', 'Aroha', 'Avaroha', 'Vakra', 'Bhashanga', 'Notes')}
        name = r[C['Raga Name']]
        # the four rows the older cleaning turned into ragas called "S": unnamed variant scales of melakarta 19
        if name == 'S':
            parent = 19
            r[C['Row Type']] = 'Melakarta'
            r[C['Raga Name']] = '(unnamed variant scale of melakarta 19)'
            if not r[C['Aroha']].split()[0].startswith('S'):
                r[C['Aroha']] = 'S ' + r[C['Aroha']]
            extra = ' Its name was "S" and its aroha had lost the opening S; restored from the source page, where it is an unnamed variant scale of melakarta 19.'
        elif n in match:
            parent, extra = match[n], ''
        elif name in UNMATCHED_FIX:
            parent, extra = UNMATCHED_FIX[name]['parent'], ' The parent was matched by hand (the name or scale differs slightly from the page).'
        else:
            raise SystemExit('unresolved row %d %s' % (i + 2, name))
        r[C['Melakarta Number']] = str(parent)
        r[C['Melakarta Name']] = mela_name[parent]
        d = tmap(parent)
        filled = given_anya = False
        for k in ('Aroha', 'Avaroha'):
            out = []
            for t in r[C[k]].split():
                core = t.strip("'")
                if core in BARE:
                    out.append(t.replace(core, d[core]))
                    filled = True
                else:
                    out.append(t)
                    if core not in ('S', 'P') and d.get(core[0]) != core:
                        given_anya = True
            r[C[k]] = ' '.join(out)
        r[C['Vakra']] = 'Yes' if vakra_yes(r[C['Aroha']], r[C['Avaroha']]) else 'No'
        r[C['Bhashanga']] = 'Yes' if given_anya else ('Needs Review' if filled else 'No')
        note = 'Parent melakarta %d (%s) is the block this raga is listed under on the source page.' % (parent, mela_name[parent])
        if filled:
            note += " Bare swara letter(s) were given the parent melakarta's variant digit, so Bhashanga cannot be confirmed."
        r[C['Notes']] = note + extra
        new = {k: r[C[k]] for k in old}
        if any(new[k] != old[k] for k in old if k != 'Notes'):
            log.append([i + 2] + [old[k] for k in ('Raga Name', 'Melakarta Number', 'Aroha', 'Avaroha', 'Vakra', 'Bhashanga')] +
                       [new[k] for k in ('Raga Name', 'Melakarta Number', 'Aroha', 'Avaroha', 'Vakra', 'Bhashanga')])

    if '--write' in sys.argv:
        buf = io.StringIO(newline='')
        csv.writer(buf, lineterminator='\r\n' if crlf else '\n').writerows([H] + body)
        b = buf.getvalue().encode('utf-8')
        if not endnl:
            b = b[:-2] if crlf else b[:-1]
        open(CLEAN, 'wb').write(b)
        with open(CHANGELOG, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['Row', 'Raga (before)', 'Melakarta (before)', 'Aroha (before)', 'Avaroha (before)', 'Vakra (before)', 'Bhashanga (before)',
                        'Raga (after)', 'Melakarta (after)', 'Aroha (after)', 'Avaroha (after)', 'Vakra (after)', 'Bhashanga (after)'])
            w.writerows(log)
    print('matched in order', len(match), 'of', len(cj), '| rows changed', len(log))


if __name__ == '__main__':
    main()
