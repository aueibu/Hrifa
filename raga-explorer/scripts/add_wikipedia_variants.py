"""Add the Wikipedia page's extra variants to CLEAN-wikipedia-janya-raga-list.csv.

On the "List of Janya ragas" page a raga can carry several scales in one row: each cell holds several spans separated by <br>, and
aroha number i goes with avaroha number i (Rageshree has 3 of each). The first extraction read only the first span of each cell, so
34 variants of 17 ragas were missing. This script appends one row per extra variant (same name, same melakarta, its own scale) at
the end of the list, so no existing row number changes. A cell with a single avaroha (Kalkada: 2 arohas, 1 avaroha) pairs every
aroha with it.

Ganavaridhi: the page prints the N2 scale and the N3 scale as two variants of the raga under melakarta 35, so the N2 scale is put
back on the first row (an earlier digit "correction" had changed it to N3, which would now duplicate the second variant).

Bhashanga: a raga whose page row carries an anya swara note is Yes on every one of its variants (the note is about the raga); the
other new rows get the swara rule. Vakra is computed by sargam_intervals.py.

    python scripts/add_wikipedia_variants.py            # dry run
    python scripts/add_wikipedia_variants.py --write
"""
import csv, html.parser, os, re, shutil, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fix_swap_rows_and_derive_bhashanga import read, write, rule  # noqa: E402
from sargam_intervals import SargamError, is_vakra  # noqa: E402
from build_master_from_clean import load_rulings, name_key  # noqa: E402
from apply_wikipedia_anya_swara import anya_text, key, scale  # noqa: E402
from fix_royal_carpet_parent import tmap  # noqa: E402

BASE = os.path.join(HERE, '..', 'raga lists')
PAGE = os.path.join(HERE, '..', 'data', 'raw-sources', 'wikipedia-list-of-janya-ragas-2026-09-21.html')
CLEAN = os.path.join(BASE, 'CLEAN-wikipedia-janya-raga-list.csv')
CHANGELOG = os.path.join(BASE, 'wikipedia-variants-changelog.csv')
DATE = '2026-09-21'


class Rows(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.cur, self.cell = [], None, None

    def handle_starttag(self, t, a):
        if t == 'tr':
            self.cur = []
        elif t in ('td', 'th') and self.cur is not None:
            self.cell = []
        elif t == 'br' and self.cell is not None:
            self.cell.append('\n')

    def handle_endtag(self, t):
        if t in ('td', 'th') and self.cell is not None and self.cur is not None:
            self.cur.append(''.join(self.cell))
            self.cell = None
        elif t == 'tr' and self.cur is not None:
            self.rows.append(self.cur)
            self.cur = None

    def handle_data(self, d):
        if self.cell is not None:
            self.cell.append(d)


def fill_bare(text, mela):
    """A bare R/G/M/D/N letter takes the parent melakarta's own variant (the rule used for every other list)."""
    t = tmap(mela)
    return ' '.join((tok[:m.end(2)] + t[m.group(2)][1] + tok[m.end(2):]) if (m := re.match(r"^([,'=]*)([RGMDN])([,'=]*)$", tok)) else tok
                    for tok in text.split())


def pieces(cell):
    return [re.sub(r'\s+', ' ', x).strip() for x in cell.split('\n') if x.strip()]


def main():
    do_write = '--write' in sys.argv
    p = Rows()
    p.feed(open(PAGE, encoding='utf-8', errors='replace').read())
    entries, mela = [], None
    for r in p.rows:
        if len(r) < 3:
            continue
        name = re.sub(r'\s+', ' ', r[0]).strip()
        m = re.match(r'^(\d+) [^\d]', name)
        if m:
            mela = int(m.group(1))
            continue
        a, v = pieces(r[1]), pieces(r[2])
        if len(a) > 1 or len(v) > 1:
            entries.append(dict(mela=mela, name=name, key=key(name), aro=[scale(x) for x in a], ava=[scale(x) for x in v],
                                anya=anya_text(a + v)))
    print('page rows with several variants:', len(entries), '| extra variants:', sum(max(len(e['aro']), len(e['ava'])) - 1 for e in entries))

    rows, crlf, endnl = read(CLEAN)
    C = {h: k for k, h in enumerate(rows[0])}
    by = {}
    for i, r in enumerate(rows):
        if i:
            by.setdefault((key(r[C['Raga Name']]), r[C['Melakarta Number']]), []).append(i)
    rulings = load_rulings()
    seq = lambda s: [re.sub(r"[',=]", '', t) for t in s.split()]
    log, new_rows = [], []
    for e in entries:
        idx = by.get((e['key'], str(e['mela'])), [])
        assert len(idx) == 1, (e['name'], e['mela'], idx)
        first = rows[idx[0]]
        n = max(len(e['aro']), len(e['ava']))
        pairs = [(e['aro'][k] if len(e['aro']) > 1 else e['aro'][0], e['ava'][k] if len(e['ava']) > 1 else e['ava'][0]) for k in range(n)]
        if (seq(first[C['Aroha']]), seq(first[C['Avaroha']])) != (seq(pairs[0][0]), seq(pairs[0][1])):
            if e['key'] == 'ganavaridhi':
                old = (first[C['Aroha']], first[C['Avaroha']])
                first[C['Aroha']], first[C['Avaroha']] = pairs[0]
                first[C['Bhashanga']] = rule(pairs[0][0], pairs[0][1], str(e['mela']))
                first[C['Notes']] = first[C['Notes']].rstrip() + (' [%s] RESTORED: the page prints this N2 scale and the N3 scale as two variants under melakarta 35, so the '
                                                                  'earlier N3 correction is undone (it would duplicate variant 2). Bhashanga %s (N2 is not melakarta 35\'s).'
                                                                  % (DATE, first[C['Bhashanga']]))
                log.append(['WIKIPEDIA', idx[0] + 1, e['name'], 'first variant restored to the page scale', 'aroha: %s | avaroha: %s' % old,
                            'aroha: %s | avaroha: %s' % pairs[0], 'Bhashanga -> %s' % first[C['Bhashanga']]])
            else:
                print('  NOTE: first variant differs from the page for', e['name'], '|', first[C['Aroha']], '||', first[C['Avaroha']], 'vs', pairs[0])
        have = {(tuple(seq(first[C['Aroha']])), tuple(seq(first[C['Avaroha']])))}
        for k in range(1, n):
            a, v = pairs[k]
            sig = (tuple(seq(a)), tuple(seq(v)))
            if sig in have:
                print('  skipped (same scale as an earlier variant of the row):', e['name'], 'variant', k + 1)
                continue
            have.add(sig)
            a0, v0 = a, v
            a, v = fill_bare(a, e['mela']), fill_bare(v, e['mela'])
            r = list(first)
            r[C['Aroha']], r[C['Avaroha']] = a, v
            r[C['Bhashanga']] = 'Yes' if e['anya'] is not None else rule(a, v, str(e['mela']))
            try:
                res = is_vakra(a, v, notation='carnatic', close=True, sa_conventions=True)
                ru = rulings.get((name_key(r[C['Raga Name']]), a.strip(), v.strip()))
                r[C['Vakra']] = ru[0] if ru else (('Yes' if res.is_vakra else 'No') if res.reliable else 'Needs Review')
            except SargamError:
                r[C['Vakra']] = 'Needs Review'
            msg = '[%s] VARIANT %d of %d on the Wikipedia page: the page lists %d scales for this raga in one row (separated by line breaks); the first extraction kept only the first.' % (DATE, k + 1, n, n)
            if e['anya'] is not None:
                msg += ' [%s] BHASHANGA: the Wikipedia page states anya swara: %s.' % (DATE, e['anya'])
            if (a, v) != (a0, v0):
                msg += " [%s] SWARA DIGITS: bare letter(s) given the parent melakarta %d's own variant (page: aroha '%s', avaroha '%s')." % (DATE, e['mela'], a0, v0)
            r[C['Notes']] = msg
            new_rows.append(r)
            log.append(['WIKIPEDIA', len(rows) + len(new_rows), e['name'], 'variant %d of %d added' % (k + 1, n), '', 'aroha: %s | avaroha: %s' % (a, v),
                        'Bhashanga %s; Vakra %s' % (r[C['Bhashanga']], r[C['Vakra']])])
    print('variant rows to add:', len(new_rows))
    for l in log:
        print('  ', l[2][:34], '|', l[3], '|', l[5][:95], '|', l[6])
    if not do_write:
        print('dry run: nothing written')
        return
    shutil.copyfile(CLEAN, CLEAN.replace('.csv', '.backup-before-variants.csv'))
    rows.extend(new_rows)
    write(CLEAN, rows, crlf, endnl)
    with open(CHANGELOG, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Source List', 'CSV Row', 'Raga Name', 'Change', 'Before', 'After', 'Detail'])
        w.writerows(log)
    print('written')


if __name__ == '__main__':
    main()
