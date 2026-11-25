"""Royal Carpet list: one melakarta row per mela, alternate names in the notes, and the janyas that cleaning had dropped.

1. Melakarta rows. The page heads every block with the melakarta (primary name), sometimes with alternate names and unnamed
   variant scales. The CLEAN list held 54 melakarta rows (mela 19 five times, 65 four times, 29 melas missing) plus three
   alternate-name lines filed as janyas. They are replaced by exactly 72 rows, one per mela, with the alternate names and
   the source noted.
2. Janyas. Page janya lines that the earlier cleaning dropped are added back, except lines that just repeat their own
   melakarta's scale. Notation marks are kept and explained in the row's notes.
Rows end up in page order (mela row, then its janyas).
"""
import csv, difflib, io, os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fix_royal_carpet_parent import tmap, vakra_yes, letters  # noqa: E402

RAGA_LISTS = os.path.join(HERE, '..', 'raga lists')
CLEAN = os.path.join(RAGA_LISTS, 'CLEAN-royal-carpet-janya-list.csv')
EXTRACT = os.path.join(HERE, '..', 'data', 'royal-carpet-reverse-janya-list.csv')
CHANGELOG = os.path.join(RAGA_LISTS, 'royal-carpet-melas-and-janyas-changelog.csv')
TOK = re.compile(r"^(S|P|[RGDN][123]|M[12])$")


def parse_scale(raw, parent):
    """-> (scale text, flags). Handles R2S (glued S), '*' (anya swara), M1'/M2' (the other Madhyama), other marks."""
    d = tmap(parent)
    s = re.sub(r'([0-9])S', r'\1 S', raw.strip())
    out, marks, filled, anya = [], set(), False, False
    for t in s.split():
        star = '*' in t
        prime = t.endswith("'")
        core = t.replace('*', '').rstrip("'")
        if star:
            marks.add('*')
        if core in ('R', 'G', 'M', 'D', 'N'):
            core = d[core]
            filled = True
        if prime and core[:1] == 'M' and len(core) == 2:      # the apostrophe on M is the other Madhyama
            core = 'M2' if core == 'M1' else 'M1'
            marks.add("M'")
            anya = True
        elif prime:                                             # any other apostrophe: mark kept in the notes only
            marks.add("'")
        if not TOK.match(core):
            raise SystemExit('cannot read token %r in %r' % (t, raw))
        if core not in ('S', 'P') and d[core[0]] != core:
            anya = True
        out.append(core)
    return ' '.join(out), dict(marks=marks, filled=filled, anya=anya)


def main():
    raw = open(CLEAN, 'rb').read()
    crlf, endnl = b'\r\n' in raw, raw.endswith(b'\n')
    rows = list(csv.reader(io.StringIO(raw.decode('utf-8'), newline='')))
    H = rows[0]
    C = {h: i for i, h in enumerate(H)}
    body = rows[1:]
    E = list(csv.DictReader(open(EXTRACT, encoding='utf-8-sig', newline='')))
    page_j = [r for r in E if r['Row Type'] == 'Janya']
    prim = {int(r['Melakarta Number']): r for r in E if r['Row Type'] == 'Melakarta (primary name)'}
    alt = collections.defaultdict(list)
    unnamed = collections.Counter()
    for r in E:
        if r['Row Type'].startswith('Melakarta (alternate'):
            alt[int(r['Melakarta Number'])].append(r)
        elif r['Row Type'].startswith('Melakarta (unnamed'):
            unnamed[int(r['Melakarta Number'])] += 1
    assert len(prim) == 72
    source = next(r[C['Source']] for r in body if r[C['Source']])
    mela_name = {}
    for r in body:
        if r[C['Melakarta Number']].isdigit() and r[C['Melakarta Name']]:
            mela_name.setdefault(int(r[C['Melakarta Number']]), r[C['Melakarta Name']])

    # ---- drop: every melakarta-typed row, and janya rows that are really the page's alternate-name lines
    alt_keys = {(a['Raga Name'], letters(a['Aroha']), letters(a['Avaroha'])) for v in alt.values() for a in v}
    # an alternate name that the page ALSO lists as a janya line under the same melakarta stays a janya
    alt_keys -= {(r['Raga Name'], letters(r['Aroha']), letters(r['Avaroha'])) for r in page_j}
    removed, kept = [], []
    for i, r in enumerate(body):
        key = (r[C['Raga Name']], letters(r[C['Aroha']]), letters(r[C['Avaroha']]))
        if r[C['Row Type']] == 'Melakarta' or (r[C['Row Type']] == 'Janya' and key in alt_keys):
            removed.append((i + 2, r))
        else:
            kept.append(r)

    # ---- match the remaining janya rows to page lines in order
    ka = [(r[C['Raga Name']], letters(r[C['Aroha']]), letters(r[C['Avaroha']])) for r in kept]
    kb = [(r['Raga Name'], letters(r['Aroha']), letters(r['Avaroha'])) for r in page_j]
    at = {}
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ka, kb, autojunk=False).get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                at[j1 + k] = kept[i1 + k]
    assert len(at) == len(kept), (len(at), len(kept))

    # page lines that only repeat their own melakarta's scale
    own_scales = collections.defaultdict(set)
    for r in E:
        if r['Row Type'].startswith('Melakarta'):
            own_scales[int(r['Melakarta Number'])].add((r['Aroha'], r['Avaroha']))
    added = []

    def new_janya(pr):
        parent = int(pr['Melakarta Number'])
        A, fa = parse_scale(pr['Aroha'], parent)
        V, fv = parse_scale(pr['Avaroha'], parent)
        marks = fa['marks'] | fv['marks']
        filled = fa['filled'] or fv['filled']
        anya = fa['anya'] or fv['anya']
        note = ('Parent melakarta %d (%s) is the block this raga is listed under on the source page. '
                'Added back: an earlier cleaning had dropped this line because of its notation. Printed scale: %s - %s.'
                % (parent, mela_name[parent], pr['Aroha'].strip(), pr['Avaroha'].strip()))
        if '*' in marks:
            note += ' A * in the printed scale marks an anya (foreign) swara; the swara is kept without the *.'
        if "M'" in marks:
            note += " An apostrophe on M is the other Madhyama: M1' is read as M2 and M2' as M1 (the source gives no legend; the same ragas are the ones Pravagam notes as using a changed Madhyama)."
        if "'" in marks:
            note += " The printed scale has an apostrophe on a swara other than M (N2'); its meaning is not given on the source page, so the swara is kept as N2."
        if filled:
            note += " Bare swara letter(s) were given the parent melakarta's variant digit, so Bhashanga cannot be confirmed."
        vak = 'Yes' if vakra_yes(A, V) else 'No'
        bh = 'Yes' if anya else ('Needs Review' if filled else 'No')
        r = [''] * len(H)
        for k, v in (('Row Type', 'Janya'), ('Melakarta Number', str(parent)), ('Melakarta Name', mela_name[parent]),
                     ('Raga Name', pr['Raga Name']), ('Aroha', A), ('Avaroha', V), ('Vakra', vak), ('Bhashanga', bh),
                     ('Notes', note), ('Source', source)):
            r[C[k]] = v
        return r

    def mela_row(n):
        p = prim[n]
        A, _ = parse_scale(p['Aroha'], n)
        V, _ = parse_scale(p['Avaroha'], n)
        alts = [a['Raga Name'] for a in alt.get(n, [])]
        note = 'Melakarta %d, listed at the head of its block on the source page.' % n
        if alts:
            note += ' Alternate name(s) on the source page: %s.' % ', '.join(alts)
        if unnamed[n]:
            note += ' The page also lists %d unnamed variant scale(s) for this melakarta (not kept).' % unnamed[n]
        r = [''] * len(H)
        for k, v in (('Row Type', 'Melakarta'), ('Melakarta Number', str(n)), ('Melakarta Name', mela_name[n]),
                     ('Raga Name', p['Raga Name']), ('Aroha', A), ('Avaroha', V),
                     ('Vakra', 'Yes' if vakra_yes(A, V) else 'No'),
                     ('Bhashanga', 'No'), ('Notes', note), ('Source', source)):
            r[C[k]] = v
        return r

    out, seen_block = [], set()
    for j, pr in enumerate(page_j):
        n = int(pr['Melakarta Number'])
        if n not in seen_block:
            seen_block.add(n)
            out.append(mela_row(n))
        if j in at:
            out.append(at[j])
        elif (pr['Aroha'], pr['Avaroha']) in own_scales[n]:
            continue
        else:
            nr = new_janya(pr)
            out.append(nr)
            added.append(nr)
    assert seen_block == set(range(1, 73)), 'a block has no janyas'

    print('removed', len(removed), '| added janyas', len(added), '| melakarta rows', sum(r[C['Row Type']] == 'Melakarta' for r in out), '| total rows', len(out))
    if '--write' in sys.argv:
        buf = io.StringIO(newline='')
        csv.writer(buf, lineterminator='\r\n' if crlf else '\n').writerows([H] + out)
        b = buf.getvalue().encode('utf-8')
        if not endnl:
            b = b[:-2] if crlf else b[:-1]
        open(CLEAN, 'wb').write(b)
        with open(CHANGELOG, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['Change', 'Was row', 'Melakarta', 'Raga', 'Aroha', 'Avaroha', 'Vakra', 'Bhashanga'])
            for i, r in removed:
                why = 'removed: melakarta row (replaced by one row per mela)' if r[C['Row Type']] == 'Melakarta' else 'removed: alternate-name line of the melakarta (now in its notes)'
                w.writerow([why, i, r[C['Melakarta Number']], r[C['Raga Name']], r[C['Aroha']], r[C['Avaroha']], r[C['Vakra']], r[C['Bhashanga']]])
            for r in added:
                w.writerow(['added: janya line the cleaning had dropped', '', r[C['Melakarta Number']], r[C['Raga Name']], r[C['Aroha']], r[C['Avaroha']], r[C['Vakra']], r[C['Bhashanga']]])


if __name__ == '__main__':
    main()
