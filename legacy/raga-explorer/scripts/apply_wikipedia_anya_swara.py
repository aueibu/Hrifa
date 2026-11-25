"""Apply what the Wikipedia "List of Janya ragas" page states about anya swaras to CLEAN-wikipedia-janya-raga-list.csv.

The page prints "(Anya swara* : R2 D2)" beside 50 rows. The earlier extraction kept the scales and dropped that text. This script:
  1. sets Bhashanga = Yes on those 50 rows and records the stated anya swaras in Notes;
  2. restores Atana's page scale (an earlier digit "correction" had replaced its stated anya swaras G2 N2) and keeps Navaroj's N2
     (stated anya) while its G1 R3 stay corrected (user decision, 2026-09-21);
  3. restores the six scales that were cut short (Bhimsen, Bhakthirasa, Rudra Panchami, Sri Tyagaraja, Amritha Kalyani, Kedar);
  4. recomputes Vakra for every changed scale.
Source: data/raw-sources/wikipedia-list-of-janya-ragas-2026-09-21.html (the live page saved that day).

    python scripts/apply_wikipedia_anya_swara.py            # dry run
    python scripts/apply_wikipedia_anya_swara.py --write    # backs up the CLEAN list itself
"""
import csv, html.parser, os, re, shutil, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fix_swap_rows_and_derive_bhashanga import read, write, rule  # noqa: E402
from sargam_intervals import SargamError, is_vakra  # noqa: E402
from build_master_from_clean import load_rulings, name_key  # noqa: E402

BASE = os.path.join(HERE, '..', 'raga lists')
PAGE = os.path.join(HERE, '..', 'data', 'raw-sources', 'wikipedia-list-of-janya-ragas-2026-09-21.html')
CLEAN = os.path.join(BASE, 'CLEAN-wikipedia-janya-raga-list.csv')
CHANGELOG = os.path.join(BASE, 'wikipedia-anya-swara-changelog.csv')
DATE = '2026-09-21'
SUB = str.maketrans('₁₂₃', '123')
REPAIR = ('bhimsen', 'bhakthirasa', 'rudrapanchami', 'srityagaraja', 'amrithakalyani', 'kedar')


class Rows(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.cur, self.cell = [], None, None

    def handle_starttag(self, t, a):
        if t == 'tr':
            self.cur = []
        elif t in ('td', 'th') and self.cur is not None:
            self.cell = []

    def handle_endtag(self, t):
        if t in ('td', 'th') and self.cell is not None and self.cur is not None:
            self.cur.append(re.sub(r'\s+', ' ', ''.join(self.cell)).strip())
            self.cell = None
        elif t == 'tr' and self.cur is not None:
            self.rows.append(self.cur)
            self.cur = None

    def handle_data(self, d):
        if self.cell is not None:
            self.cell.append(d)


def key(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.combining(c))
    return re.sub(r'[^a-z]', '', re.sub(r'\{.*?\}|\(.*?\)|\[.*?\]', '', s).lower())


def scale(cell):
    s = re.sub(r'\(\s*Anya swara.*$', '', cell, flags=re.I).translate(SUB).replace('Ṡ', "S'")
    s = s.replace('*', '').replace('(', ' ').replace(')', ' ')
    return ' '.join(s.split())


def anya_text(cells):
    for c in cells:
        m = re.search(r'\(\s*Anya swara\**\s*(\{[^}]*\})?\s*:?\s*([^)]*)\)', c, re.I)
        if m:
            t = ' '.join(m.group(2).translate(SUB).split())
            return t + (' (rarely)' if m.group(1) and 'rare' in m.group(1) else '')
    return None


def main():
    do_write = '--write' in sys.argv
    p = Rows()
    p.feed(open(PAGE, encoding='utf-8', errors='replace').read())
    page, mela = [], None
    for r in p.rows:
        if len(r) < 3:
            continue
        m = re.match(r'^(\d+) [^\d]', r[0])
        if m:
            mela = int(m.group(1))
            continue
        page.append(dict(mela=mela, key=key(r[0]), aroha=scale(r[1]), avaroha=scale(r[2]), anya=anya_text(r[1:3])))
    annotated = [x for x in page if x['anya'] is not None]
    print('page janya rows %d, with an anya swara note %d' % (len(page), len(annotated)))

    rows, crlf, endnl = read(CLEAN)
    C = {h: k for k, h in enumerate(rows[0])}
    by = {}
    for i, r in enumerate(rows):
        if i:
            by.setdefault((key(r[C['Raga Name']]), r[C['Melakarta Number']]), []).append(i)
    rulings = load_rulings()
    log = []

    def find(k, mela_no):
        idx = by.get((k, str(mela_no)), [])
        assert len(idx) == 1, (k, mela_no, idx)
        return idx[0]

    def note(i, msg):
        r = rows[i]
        r[C['Notes']] = (r[C['Notes']].rstrip() + ' ' + msg) if r[C['Notes']] else msg

    def refresh(i):
        r = rows[i]
        try:
            res = is_vakra(r[C['Aroha']], r[C['Avaroha']], notation='carnatic', close=True, sa_conventions=True)
        except SargamError:
            return
        ru = rulings.get((name_key(r[C['Raga Name']]), r[C['Aroha']].strip(), r[C['Avaroha']].strip()))
        new = ru[0] if ru else (('Yes' if res.is_vakra else 'No') if res.reliable else r[C['Vakra']])
        if new != r[C['Vakra']]:
            log.append(['WIKIPEDIA', i + 1, r[C['Raga Name']], 'Vakra recomputed', r[C['Vakra']], new, ''])
            r[C['Vakra']] = new

    # 3. truncated scales restored from the page
    for x in page:
        if x['key'] in REPAIR and x['mela'] and (x['key'], str(x['mela'])) in by:
            i = find(x['key'], x['mela'])
            r = rows[i]
            if (r[C['Aroha']], r[C['Avaroha']]) == (x['aroha'], x['avaroha']):
                continue
            old = (r[C['Aroha']], r[C['Avaroha']])
            if len(old[0].split()) >= len(x['aroha'].split()) - 1 and len(old[1].split()) >= len(x['avaroha'].split()) - 1:
                continue
            r[C['Aroha']], r[C['Avaroha']] = x['aroha'], x['avaroha']
            old_b = r[C['Bhashanga']]
            r[C['Bhashanga']] = rule(x['aroha'], x['avaroha'], str(x['mela']))
            note(i, '[%s] SCALE RESTORED from the Wikipedia page: the list held aroha "%s" and avaroha "%s", which had been cut short.' % (DATE, old[0], old[1]))
            log.append(['WIKIPEDIA', i + 1, r[C['Raga Name']], 'truncated scale restored', 'aroha: %s | avaroha: %s' % old,
                        'aroha: %s | avaroha: %s' % (x['aroha'], x['avaroha']), 'Bhashanga %s -> %s' % (old_b, r[C['Bhashanga']])])
            refresh(i)

    # 2. Atana and Navaroj
    for k, new_v, why in (
            ('atana', None, 'the earlier digit correction (G2 N2 to G3 N3) is undone: the page states G2 and N2 as anya swaras of Atana (melakarta 29).'),
            ('navaroj', 'M1 G3 R2 S N2 D2 P', "N2 is kept: the page states N2 as Navaroj's anya swara. The G1 and R3 stay corrected to G3 and R2 (user ruling: "
                                              "they are not swaras of melakarta 29 and are not stated as anya).")):
        i = find(k, 29)
        x = next(y for y in page if y['key'] == k and y['mela'] == 29)
        r = rows[i]
        old = (r[C['Aroha']], r[C['Avaroha']])
        if k == 'atana':
            r[C['Aroha']] = x['aroha']
        r[C['Avaroha']] = new_v or x['avaroha']
        note(i, '[%s] RESTORED: %s' % (DATE, why))
        log.append(['WIKIPEDIA', i + 1, r[C['Raga Name']], 'anya swara restored', 'aroha: %s | avaroha: %s' % old,
                    'aroha: %s | avaroha: %s' % (r[C['Aroha']], r[C['Avaroha']]), ''])
        refresh(i)

    # 1. Bhashanga = Yes on all annotated rows, with the stated anya swaras
    for x in annotated:
        i = find(x['key'], x['mela'])
        r = rows[i]
        old = r[C['Bhashanga']]
        r[C['Bhashanga']] = 'Yes'
        note(i, '[%s] BHASHANGA: the Wikipedia page states anya swara: %s.' % (DATE, x['anya']))
        log.append(['WIKIPEDIA', i + 1, r[C['Raga Name']], 'Bhashanga set from the page', 'Bhashanga %s' % old, 'Bhashanga Yes', 'anya swara: %s' % x['anya']])

    print('changes logged:', len(log), '| Wikipedia Bhashanga=Yes rows after:', sum(1 for r in rows[1:] if r[C['Bhashanga']] == 'Yes'))
    for l in log:
        if l[3] not in ('Bhashanga set from the page',):
            print('  ', l[2], '|', l[3], '|', l[4][:80], '->', l[5][:80], '|', l[6])
    if not do_write:
        print('dry run: nothing written')
        return
    shutil.copyfile(CLEAN, CLEAN.replace('.csv', '.backup-before-anya-swara.csv'))
    write(CLEAN, rows, crlf, endnl)
    with open(CHANGELOG, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Source List', 'CSV Row', 'Raga Name', 'Change', 'Before', 'After', 'Detail'])
        w.writerows(log)
    print('written')


if __name__ == '__main__':
    main()
