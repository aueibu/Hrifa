"""Fix CLEAN-musiclegato-carnatic-raga-list.csv against the saved Musiclegato index page.

Each janya link on the page carries the raga's scale in its `rpt=` (aroha/avaroha separated by `/`, or by `SS`). Comparing the page
with the list (2026-09-21) found:
  1. Shivashakti (melakarta 10) is on the page but not in the list: added (appended, so no row number changes).
  2. Rasali and VanaVali are under melakarta 4 on the page but 22 in the list: moved to 4 (their scales are melakarta 4's).
     Bhanumati is also under 4 on the page but stays under 22 (user decision: its scale fits 22).
  3. Kalkada: the page gives two arohas and one avaroha (the second aroha had ended up inside the avaroha): now two variants.
  4. Rows where the page separates aroha and avaroha with `/` but the list split the same swaras elsewhere: the page's split is restored.
     (Where the page has no `/`, the list's split is the source's own ambiguity and is left alone.)
Vakra is recomputed for every changed scale; Bhashanga by the swara rule for every moved row.

    python scripts/fix_musiclegato_from_page.py            # dry run
    python scripts/fix_musiclegato_from_page.py --write
"""
import csv, html, os, re, shutil, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fix_swap_rows_and_derive_bhashanga import read, write, rule  # noqa: E402
from sargam_intervals import SargamError, is_vakra  # noqa: E402
from build_master_from_clean import load_rulings, name_key  # noqa: E402

BASE = os.path.join(HERE, '..', 'raga lists')
PAGE = os.path.join(HERE, '..', 'data', 'raw-sources', 'musiclegato-carnatic-ragas-index-2026-09-21.html')
CLEAN = os.path.join(BASE, 'CLEAN-musiclegato-carnatic-raga-list.csv')
CHANGELOG = os.path.join(BASE, 'musiclegato-page-fix-changelog.csv')
DATE = '2026-09-21'
TOK = re.compile(r"(Sa|[SRGMPDN])([123]?)")
MOVE = {'rasali': 4, 'vanavali': 4}


def toks(s):
    return [a.replace('Sa', 'S') + b for a, b in TOK.findall(s.replace('-', ' '))]


def norm(s):
    return re.sub(r'[^a-z]', '', s.lower())


def page_links():
    h = open(PAGE, encoding='utf-8', errors='replace').read()
    mela, out = None, []
    for m in re.finditer(r'<a class="styLK" href="([^"]*)"[^>]*>([^<]*)</a>', h):
        href, label = html.unescape(m.group(1)), html.unescape(m.group(2)).strip()
        if 'JnCarnatic' in href:
            r = re.search(r'[?&]rpt=([^&]*)', href)
            out.append(dict(mela=mela, name=re.sub(r'^\d+\.\s*', '', label), rpt=urllib.parse.unquote(r.group(1)) if r else ''))
        elif 'Carnatic.aspx' in href and re.match(r'^\d{2}\.', label):
            mela = int(label[:2])
    return out


def main():
    do_write = '--write' in sys.argv
    links = page_links()
    rows, crlf, endnl = read(CLEAN)
    C = {h: k for k, h in enumerate(rows[0])}
    rulings = load_rulings()
    by = {}
    for i, r in enumerate(rows):
        if i and r[C['Row Type']] == 'Janya':
            by.setdefault((int(r[C['Melakarta Number']]), norm(r[C['Raga Name']])), []).append(i)
    log, new_rows = [], []

    def vakra(r):
        try:
            res = is_vakra(r[C['Aroha']], r[C['Avaroha']], notation='carnatic', close=True, sa_conventions=True)
        except SargamError:
            return r[C['Vakra']]
        ru = rulings.get((name_key(r[C['Raga Name']]), r[C['Aroha']].strip(), r[C['Avaroha']].strip()))
        return ru[0] if ru else (('Yes' if res.is_vakra else 'No') if res.reliable else r[C['Vakra']])

    def note(r, msg):
        r[C['Notes']] = (r[C['Notes']].rstrip() + ' ' + msg) if r[C['Notes']] else msg

    seen = {}
    for x in links:
        key = (x['mela'], norm(x['name']))
        seen[key] = seen.get(key, 0) + 1
        rpt = x['rpt']
        if not rpt:
            continue
        pa, pv = ([toks(z) for z in rpt.split('/', 1)] if '/' in rpt else [toks(rpt), []])
        # 1. Shivashakti: on the page, not in the list
        if key == (10, 'shivashakti') and key not in by:
            src = next(r for r in rows[1:] if r[C['Melakarta Number']] == '10' and r[C['Row Type']] == 'Janya')
            r = list(src)
            r[C['Raga Name']], r[C['Aroha']], r[C['Avaroha']] = x['name'], ' '.join(pa), ' '.join(pv)
            r[C['Bhashanga']], r[C['Notes']] = rule(r[C['Aroha']], r[C['Avaroha']], '10'), ''
            r[C['Vakra']] = vakra(r)
            note(r, '[%s] ADDED: Shivashakti is on the Musiclegato index page under melakarta 10 but was missing from this list.' % DATE)
            new_rows.append(r)
            log.append(['MUSICLEGATO', len(rows) + len(new_rows), x['name'], 'row added', '', '%s / %s' % (r[C['Aroha']], r[C['Avaroha']]), 'Vakra %s; Bhashanga %s' % (r[C['Vakra']], r[C['Bhashanga']])])
            continue
        # 2. moved to melakarta 4
        base = norm(x['name'])
        if base in MOVE and x['mela'] == MOVE[base] and (22, base) in by:
            i = by[(22, base)][0]
            r = rows[i]
            old = (r[C['Melakarta Number']], r[C['Melakarta Name']], r[C['Bhashanga']])
            r[C['Melakarta Number']], r[C['Melakarta Name']] = '4', 'VANASPATHI'
            r[C['Bhashanga']] = rule(r[C['Aroha']], r[C['Avaroha']], '4')
            note(r, '[%s] PARENT CHANGED: the Musiclegato index page lists %s under melakarta 4 (VANASPATHI), not 22; its scale is melakarta 4\'s. Bhashanga %s -> %s.'
                 % (DATE, x['name'], old[2], r[C['Bhashanga']]))
            log.append(['MUSICLEGATO', i + 1, x['name'], 'parent melakarta changed', 'melakarta 22', 'melakarta 4', 'Bhashanga %s -> %s' % (old[2], r[C['Bhashanga']])])
            continue
        if base == 'bhanumati' and x['mela'] == 4 and (22, base) in by:
            r = rows[by[(22, base)][0]]
            note(r, '[%s] NOTE: the Musiclegato index page lists Bhanumati under melakarta 4, but its scale (G2 R2 in the avaroha) fits melakarta 22, so it stays under 22 (user decision).' % DATE)
            log.append(['MUSICLEGATO', by[(22, base)][0] + 1, x['name'], 'note added (mela kept)', 'melakarta 22', 'melakarta 22', 'the page says 4; the scale fits 22'])
            continue
        rowsx = by.get(key)
        if not rowsx:
            continue
        i = rowsx[min(seen[key] - 1, len(rowsx) - 1)]
        r = rows[i]
        ca, cv = toks(r[C['Aroha']]), toks(r[C['Avaroha']])
        if (ca, cv) == (pa, pv) or '/' not in rpt:
            continue
        # 3. Kalkada: two arohas on the page
        if key == (13, 'kalkada'):
            a1, a2 = pa[:7], pa[7:]
            old = (r[C['Aroha']], r[C['Avaroha']])
            r[C['Aroha']], r[C['Avaroha']] = ' '.join(a1), ' '.join(pv)
            r[C['Vakra']] = vakra(r)
            note(r, '[%s] SPLIT: the page gives two arohas and one avaroha; the second aroha had ended up inside the avaroha (was aroha "%s", avaroha "%s"). This is variant 1 of 2.' % (DATE, old[0], old[1]))
            r2 = list(r)
            r2[C['Aroha']], r2[C['Avaroha']] = ' '.join(a2), ' '.join(pv)
            r2[C['Vakra']] = vakra(r2)
            r2[C['Notes']] = '[%s] VARIANT 2 of 2 on the Musiclegato page: the page gives two arohas for Kalkada with one avaroha.' % DATE
            new_rows.append(r2)
            log.append(['MUSICLEGATO', i + 1, x['name'], 'variant 1 of 2 restored', 'aroha: %s | avaroha: %s' % old, 'aroha: %s | avaroha: %s' % (r[C['Aroha']], r[C['Avaroha']]), ''])
            log.append(['MUSICLEGATO', len(rows) + len(new_rows), x['name'], 'variant 2 of 2 added', '', 'aroha: %s | avaroha: %s' % (r2[C['Aroha']], r2[C['Avaroha']]), ''])
            continue
        # 4. the page's own split
        if ca + cv == pa + pv and '?' not in rpt:
            old = (r[C['Aroha']], r[C['Avaroha']], r[C['Vakra']])
            r[C['Aroha']], r[C['Avaroha']] = ' '.join(pa), ' '.join(pv)
            r[C['Vakra']] = vakra(r)
            note(r, '[%s] SPLIT RESTORED: the page separates aroha and avaroha here with a slash (aroha "%s", avaroha "%s"); the list had the same swaras split elsewhere. Vakra %s -> %s.'
                 % (DATE, r[C['Aroha']], r[C['Avaroha']], old[2], r[C['Vakra']]))
            log.append(['MUSICLEGATO', i + 1, x['name'], 'page split restored', 'aroha: %s | avaroha: %s' % old[:2], 'aroha: %s | avaroha: %s' % (r[C['Aroha']], r[C['Avaroha']]), 'Vakra %s -> %s' % (old[2], r[C['Vakra']])])
    print('changes:', len(log), '| new rows:', len(new_rows))
    for l in log:
        print('  ', l[2][:24], '|', l[3], '|', l[4][:70], '->', l[5][:80], '|', l[6])
    if not do_write:
        print('dry run: nothing written')
        return
    shutil.copyfile(CLEAN, CLEAN.replace('.csv', '.backup-before-page-fix.csv'))
    rows.extend(new_rows)
    write(CLEAN, rows, crlf, endnl)
    with open(CHANGELOG, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['Source List', 'CSV Row', 'Raga Name', 'Change', 'Before', 'After', 'Detail'])
        w.writerows(log)
    print('written')


if __name__ == '__main__':
    main()
