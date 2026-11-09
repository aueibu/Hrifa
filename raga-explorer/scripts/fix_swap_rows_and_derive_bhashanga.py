"""Correct digit-swap rows, move Nerur's Sindhu Bhairavi to its real parent, and fill Bhashanga by the swara rule.

1. Swap rows: a row whose scale carries a swara variant that is not its parent melakarta's, where the row never uses the
   parent's variant of that swara and 2+ other sources for the same raga (same melakarta and name) all use the parent's
   variant. That pattern is a transcription slip, not a real anya swara (a real one usually shows both variants in the row).
   Each off-parent digit is replaced with the parent's digit. Vakra and Bhashanga are recomputed for the row.
2. Nerur `sindhu bhairavi` is moved from melakarta 10 to 20: its scale (R2 G2 M1 P D1 N2, R1 in the avaroha) is naTabhairavi's.
3. Bhashanga (a swara whose variant is not the parent melakarta's) is filled for the Pravagam and pasted rows that were `Unknown`.
   Rows with a bare swara letter or no usable melakarta get `Needs Review`. The rule is first checked against the four lists
   whose Bhashanga came from the source itself.

    python scripts/fix_swap_rows_and_derive_bhashanga.py            # dry run
    python scripts/fix_swap_rows_and_derive_bhashanga.py --write    # back up the CLEAN lists first
"""
import collections, csv, io, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fix_royal_carpet_parent import tmap  # noqa: E402
from sargam_intervals import SargamError, is_vakra  # noqa: E402
from build_master_from_clean import load_rulings, name_key  # noqa: E402

BASE = os.path.join(HERE, '..', 'raga lists')
MASTER = os.path.join(BASE, 'ALL-SOURCE-ROWS-carnatic-raga-database.csv')
CHANGELOG = os.path.join(BASE, 'bhashanga-swap-fix-changelog.csv')
FILES = {'PRAVAGAM': 'CLEAN-raga-pravagam-list.csv', 'MUSICLEGATO': 'CLEAN-musiclegato-carnatic-raga-list.csv',
         'NERUR': 'CLEAN-nerur-carnatic-raga-list.csv', 'WIKIPEDIA': 'CLEAN-wikipedia-janya-raga-list.csv',
         'RAGA-OF-THE-WEEK': 'CLEAN-raga-of-the-week-repo-list.csv', 'ROYAL-CARPET': 'CLEAN-royal-carpet-janya-list.csv',
         'PASTED': 'CLEAN-carnatic-pasted-dataset-list.csv'}
STATED = ('MUSICLEGATO', 'NERUR', 'WIKIPEDIA', 'RAGA-OF-THE-WEEK')
TOKEN = re.compile(r"^[,'=]*([SRGMPDN])(\d?)[,'=]*$")
DATE = '2026-09-21'


def scan(aroha, avaroha, mela):
    """(set of off-parent variants, has a bare letter, has an unreadable token)."""
    t = tmap(mela)
    off, bare, bad = set(), False, False
    for tok in (aroha + ' ' + avaroha).split():
        m = TOKEN.match(tok)
        if not m:
            bad = True
        elif m.group(1) in 'SP':
            continue
        elif not m.group(2):
            bare = True
        elif m.group(1) + m.group(2) != t[m.group(1)]:
            off.add(m.group(1) + m.group(2))
    return off, bare, bad


def rule(aroha, avaroha, mela_text):
    if not (mela_text.isdigit() and 1 <= int(mela_text) <= 72):
        return 'Needs Review'
    off, bare, bad = scan(aroha, avaroha, int(mela_text))
    if bare or bad:
        return 'Needs Review'
    return 'Yes' if off else 'No'


def fix_digits(text, mela):
    t = tmap(mela)
    out = []
    for tok in text.split():
        m = re.match(r"^([,'=]*)([RGMDN])(\d)([,'=]*)$", tok)
        out.append(m.group(1) + t[m.group(2)] + m.group(4) if m else tok)
    return ' '.join(out)


def read(path):
    raw = open(path, 'rb').read()
    rows = list(csv.reader(io.StringIO(raw.decode('utf-8'), newline='')))
    return rows, b'\r\n' in raw, raw.endswith(b'\n')


def write(path, rows, crlf, endnl):
    buf = io.StringIO(newline='')
    csv.writer(buf, lineterminator='\r\n' if crlf else '\n').writerows(rows)
    b = buf.getvalue().encode('utf-8')
    if not endnl:
        b = b[:-2] if crlf else b[:-1]
    open(path, 'wb').write(b)


def main():
    do_write = '--write' in sys.argv
    master = list(csv.DictReader(open(MASTER, encoding='utf-8', newline='')))
    byraga = collections.defaultdict(list)
    for r in master:
        byraga[r['Raga ID']].append(r)

    def off_of(r):
        if not r['Melakarta Number'] or r['Scale Check'] != 'ok':
            return None
        return scan(r['Aroha'], r['Avaroha'], int(r['Melakarta Number']))[0]

    # rule check against the lists that state Bhashanga themselves
    bad = [r for r in master if r['Source List'] in STATED and rule(r['Aroha'], r['Avaroha'], r['Melakarta Number']) != r['Bhashanga']]
    checked = sum(1 for r in master if r['Source List'] in STATED)
    print('rule vs stated Bhashanga: %d of %d rows differ' % (len(bad), checked))
    for r in bad[:10]:
        print('   ', r['Source List'], r['Raga Name'], r['Bhashanga'], rule(r['Aroha'], r['Avaroha'], r['Melakarta Number']))

    # 1. swap rows
    swaps = []
    for r in master:
        o = off_of(r)
        if not o:
            continue
        others = [x for x in byraga[r['Raga ID']] if x['Source List'] != r['Source List']]
        if not others or any(off_of(x) is not None and o <= off_of(x) for x in others if off_of(x)):
            continue
        agree = {x['Source List'] for x in others if off_of(x) == set()}
        if not agree:
            continue
        t = tmap(int(r['Melakarta Number']))
        toks = [TOKEN.match(x) for x in (r['Aroha'] + ' ' + r['Avaroha']).split()]
        both = any(len({m.group(1) + m.group(2) for m in toks if m and m.group(1) == v[0] and m.group(2)}) > 1 for v in o)
        if not both:
            swaps.append((r, len(agree)))
    print('swap rows found:', len(swaps))

    edits = collections.defaultdict(dict)   # source -> csv row index -> new values
    log = []
    files = {}
    for code, fn in FILES.items():
        files[code] = read(os.path.join(BASE, fn))

    def note_add(rows, C, i, msg):
        col = C['Decision / Finding Notes'] if 'Decision / Finding Notes' in C else C['Notes']
        rows[i][col] = (rows[i][col].rstrip() + (' | ' if 'Decision / Finding Notes' in C else ' ') + msg) if rows[i][col] else msg

    rulings = load_rulings()

    def new_vakra(row, C):
        try:
            res = is_vakra(row[C['Aroha']], row[C['Avaroha']], notation='carnatic', close=True, sa_conventions=True)
        except SargamError:
            return row[C['Vakra']]
        ru = rulings.get((name_key(row[C['Raga Name']]), row[C['Aroha']].strip(), row[C['Avaroha']].strip()))
        if ru:
            return ru[0]
        return ('Yes' if res.is_vakra else 'No') if res.reliable else row[C['Vakra']]

    for r, n_agree in swaps:
        rows, crlf, endnl = files[r['Source List']]
        C = {h: k for k, h in enumerate(rows[0])}
        i = int(r['Source Row']) - 1
        row = rows[i]
        mela = int(r['Melakarta Number'])
        old_a, old_v = row[C['Aroha']], row[C['Avaroha']]
        row[C['Aroha']], row[C['Avaroha']] = fix_digits(old_a, mela), fix_digits(old_v, mela)
        old_b, old_vk = row[C['Bhashanga']], row[C['Vakra']]
        row[C['Bhashanga']] = rule(row[C['Aroha']], row[C['Avaroha']], str(mela))
        row[C['Vakra']] = new_vakra(row, C)
        msg = ('[%s] CORRECTED: off-parent swara variant(s) %s replaced with melakarta %d\'s own (%d other source(s) agree with the parent). '
               'Was aroha "%s" and avaroha "%s"; Bhashanga %s -> %s, Vakra %s -> %s.'
               % (DATE, ', '.join(sorted(off_of(r))), mela, n_agree, old_a, old_v, old_b, row[C['Bhashanga']], old_vk, row[C['Vakra']]))
        note_add(rows, C, i, msg)
        log.append([r['Source List'], i + 1, r['Raga Name'], 'digit swap corrected', 'aroha: %s | avaroha: %s' % (old_a, old_v),
                    'aroha: %s | avaroha: %s' % (row[C['Aroha']], row[C['Avaroha']]),
                    'Bhashanga %s -> %s; Vakra %s -> %s' % (old_b, row[C['Bhashanga']], old_vk, row[C['Vakra']])])

    # 2. Nerur Sindhu Bhairavi
    rows, crlf, endnl = files['NERUR']
    C = {h: k for k, h in enumerate(rows[0])}
    hit = [i for i, row in enumerate(rows) if i and row[C['Raga Name']] == 'sindhu bhairavi' and row[C['Melakarta Number']] == '10']
    assert len(hit) == 1
    i = hit[0]
    row = rows[i]
    old = (row[C['Melakarta Number']], row[C['Melakarta Name']], row[C['Bhashanga']])
    row[C['Melakarta Number']], row[C['Melakarta Name']] = '20', 'naTabhairavi'
    row[C['Bhashanga']] = rule(row[C['Aroha']], row[C['Avaroha']], '20')
    note_add(rows, C, i, '[%s] PARENT CHANGED: was melakarta 10 (nAtakapriya); the scale (R2 G2 M1 P D1 N2, with R1 in the avaroha) is '
             'naTabhairavi\'s (20). Bhashanga %s -> %s.' % (DATE, old[2], row[C['Bhashanga']]))
    log.append(['NERUR', i + 1, row[C['Raga Name']], 'parent melakarta changed', 'melakarta 10 nAtakapriya', 'melakarta 20 naTabhairavi',
                'Bhashanga %s -> %s' % (old[2], row[C['Bhashanga']])])

    # 3. derived Bhashanga. Pravagam and the pasted list carry only the parent's default digits (bare letters were filled
    # from the parent), so a row that shows no off-parent swara proves nothing: it stays Unknown. Only a swara that IS off
    # the parent (the book's mixed Madhyama notes) is evidence, and that gives Yes.
    for code in ('PRAVAGAM', 'PASTED'):
        rows, crlf, endnl = files[code]
        C = {h: k for k, h in enumerate(rows[0])}
        c = collections.Counter()
        for i, row in enumerate(rows[1:], 1):
            if row[C['Bhashanga']] == 'Unknown':
                if rule(row[C['Aroha']], row[C['Avaroha']], row[C['Melakarta Number']].strip()) == 'Yes':
                    row[C['Bhashanga']] = 'Yes'
                    c['Yes'] += 1
                    log.append([code, i + 1, row[C['Raga Name']], 'Bhashanga derived: a swara off the parent is in the scale',
                                'Unknown', 'Yes', row[C['Aroha']] + ' || ' + row[C['Avaroha']]])
                else:
                    c['left Unknown'] += 1
        print(code, 'derived Bhashanga:', dict(c))

    print('changes logged:', len(log))
    if not do_write:
        print('dry run: nothing written')
        return
    stamp = 'backup-before-swap-fix-and-derived-bhashanga'
    for code, fn in FILES.items():
        src = os.path.join(BASE, fn)
        shutil.copyfile(src, src.replace('.csv', '.%s.csv' % stamp))
        rows, crlf, endnl = files[code]
        write(src, rows, crlf, endnl)
    with open(CHANGELOG, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Source List', 'CSV Row', 'Raga Name', 'Change', 'Before', 'After', 'Effect'])
        w.writerows(log)
    print('written; backups: *.%s.csv' % stamp)


if __name__ == '__main__':
    main()
