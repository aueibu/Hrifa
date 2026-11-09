"""Build the merged raga document from the master database: one row per raga variant (raga + scale), with each source's own
name, aroha and avaroha kept in per-source columns beside the merged values.

Input:  raga lists/ALL-SOURCE-ROWS-carnatic-raga-database.csv (after build_master_from_clean.py and build_raga_tables.py)
Output: raga lists/MASTERLIST-carnatic-ragas.csv

A row is a Variant ID: rows of the master that build_raga_tables.py judged to be the same raga (same mela, same name after the
merge rules) with the same scale. Nothing is dropped: the `Master IDs` column lists every master row merged into the row, and
if a source has several rows in a variant they are joined with ` || ` in that source's columns, in the same order.

Variants of one raga are shown side by side (same raga, different notes). `Variant Origin` says whether the versions come from
the same source (a source lists them together, like Pravagam's `Raga 1`, `Raga 2`) or from different sources (sources give the
raga different notes; names may be spelled differently), and `Other Variants Of This Raga` lists each sibling variant with its
sources and how its notes differ.

Single-source rows are explained rather than merged: `Single-Source Reason` says why a variant has only one source (an extra
variant of a raga that 2+ sources already list, a possible missed merge on a similar name, the same name under another mela,
a scale twin, or truly unique). For the extra variants, `Nearest Other-Source Variant`, `Swara Distance` and `Difference Detail`
say how far the scale is from the closest version another source gives (in swara edits over aroha and avaroha, octave ignored),
so the closest ones can be checked first. A variant one swara away is either a slip or a real near-variant (a note added or left
out is often a genuine audava/shadava version); the distance ranks the rows, it does not decide them.
"""
import collections, csv, difflib, os

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from canonical_chain import canonical_chain, steps as chain_steps  # noqa: E402
import raga_theory  # noqa: E402
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'raga lists')
MASTER = os.path.join(BASE, 'ALL-SOURCE-ROWS-carnatic-raga-database.csv')
OUT = os.path.join(BASE, 'MASTERLIST-carnatic-ragas.csv')
CRLF = chr(13) + chr(10)

SOURCES = ['PRAVAGAM', 'MUSICLEGATO', 'NERUR', 'WIKIPEDIA', 'RAGA-OF-THE-WEEK', 'ROYAL-CARPET', 'PASTED']
LABEL = {'PRAVAGAM': 'Pravagam', 'MUSICLEGATO': 'Musiclegato', 'NERUR': 'Nerur', 'WIKIPEDIA': 'Wikipedia',
         'RAGA-OF-THE-WEEK': 'Raga of the Week', 'ROYAL-CARPET': 'Royal Carpet', 'PASTED': 'Pasted'}
PITCH_COLUMNS = ['Aroha Pitch Binary', 'Aroha Pitch Decimal', 'Aroha Note Order', 'Avaroha Pitch Binary', 'Avaroha Pitch Decimal', 'Avaroha Note Order']
SCALE_PRIORITY = ['NERUR', 'MUSICLEGATO', 'WIKIPEDIA', 'RAGA-OF-THE-WEEK', 'ROYAL-CARPET', 'PASTED', 'PRAVAGAM']   # digit-bearing sources first
SEP = ' || '


def core_tokens(text):
    """Swara tokens of a scale, octave marks dropped: `S R2 G3 M1' P` -> ['S', 'R2', 'G3', 'M1', 'P']."""
    return [t.strip("'") for t in text.split()]


def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def describe(a, b):
    """How scale b differs from scale a, as short text: `+M2` (added), `-N3` (removed), `R1->R2` (changed)."""
    ops = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == 'replace':
            ops.append('%s->%s' % (' '.join(a[i1:i2]), ' '.join(b[j1:j2])))
        elif tag == 'delete':
            ops.append('-' + ' '.join(a[i1:i2]))
        elif tag == 'insert':
            ops.append('+' + ' '.join(b[j1:j2]))
    return ', '.join(ops)


def single_source_reason(rep, n_raga_sources):
    if n_raga_sources >= 2:
        return 'A. Extra variant of a raga that 2+ sources list'
    if rep['Similar Names Not Merged']:
        return 'B1. Only source for this raga; a similar name exists (possible missed merge)'
    if rep['Same Name Under Other Melas']:
        return 'B2. Only source under this mela; the same name is listed under another mela'
    if rep['Scale Twin Group']:
        return 'B3. Only source; another raga in the mela has the same scale'
    return 'B4. Only source, nothing similar anywhere'


def variant_origin(rep, vid, srcs, raga_variants, label, raga_names_merged):
    """-> (origin, other variants text) for a variant, relative to the other variants of the same raga."""
    mine = next(v for v in raga_variants[rep['Raga ID']] if v[0] == vid)
    others = [v for v in raga_variants[rep['Raga ID']] if v[0] != vid]
    if not others:
        return 'Only variant of this raga', ''
    mine_src = {s for s in SOURCES if s in mine[1]}
    shared = [bool(mine[1] & o[1]) for o in others]
    if not any(shared):
        kind = 'Cross-source variant: different sources give different notes'
    elif all(shared):
        kind = 'Same-source variant: a source lists this version and the others together'
    else:
        kind = 'Mixed: some versions share a source with this one, others come from different sources'
    if 'near scale' in raga_names_merged:
        kind += ' (names merged on a similar name and a near scale)'
    parts = []
    for ovid, osrc, oa, ov in sorted(others, key=lambda o: (edit_distance(mine[2], o[2]) + edit_distance(mine[3], o[3]), o[0]))[:6]:
        d = edit_distance(mine[2], oa) + edit_distance(mine[3], ov)
        diff = []
        da, dv = describe(mine[2], oa), describe(mine[3], ov)
        if da:
            diff.append('aroha ' + da)
        if dv:
            diff.append('avaroha ' + dv)
        parts.append('%s [%s] %s' % (ovid, ', '.join(label[x] for x in SOURCES if x in osrc),
                                     ('differs by %d: %s' % (d, '; '.join(diff))) if d else 'same swaras, different order or octave'))
    more = len(others) - len(parts)
    return kind, ' | '.join(parts) + (' | +%d more' % more if more > 0 else '')


def chain_columns(aroha, avaroha, vakra):
    """Canonical semitone chain (octave marks ignored, see canonical_chain.py) and the signed steps between neighbouring notes."""
    empty = {'Aroha Semitones': '', 'Avaroha Semitones': '', 'Aroha Steps': '', 'Avaroha Steps': '', 'Chain Note': ''}
    if not aroha.strip() or not avaroha.strip():
        return empty
    a, v, note = canonical_chain(aroha, avaroha, vakra, with_note=True)
    if a is None:
        return dict(empty, **{'Chain Note': 'no chain could be built'})
    return {'Aroha Semitones': ' '.join(map(str, a)), 'Avaroha Semitones': ' '.join(map(str, v)),
            'Aroha Steps': ' '.join(map(str, chain_steps(a))), 'Avaroha Steps': ' '.join(map(str, chain_steps(v))), 'Chain Note': note}


THEORY_FIELDS = ['Purvanga Swaras', 'Uttaranga Swaras', 'Pitch Class Set', 'Tritones', 'Aroha Intervals', 'Avaroha Intervals',
                  'Aroha Large Gaps (>=m3)', 'Avaroha Large Gaps (>=m3)', 'Gamut Large Gaps (>=m3)', 'Imperfections (no 5th above)',
                  'Detached Swaras (no 5th either way)', 'Pitches Played', 'Unique Pitches', 'Mirror Aroha', 'Mirror Avaroha',
                  'Mirror Pitch Class Set', 'Mirror Swara Set', 'Negative Pitch Class Set', 'Negative Swaras', 'Negative Aroha',
                  'Negative Avaroha']


def theory_columns(aroha, avaroha, aroha_steps, avaroha_steps):
    """Set-theory / structural columns from raga_theory.py; see that module for what each one means. `aroha_steps`/`avaroha_steps`
    are the canonical-chain step lists already computed by chain_columns, reused here so the two never disagree."""
    empty = {f: '' for f in THEORY_FIELDS}
    if not aroha.strip() or not avaroha.strip():
        return empty
    t = raga_theory
    tm = t.token_map(aroha, avaroha)
    lower, upper = t.purvanga_uttaranga(aroha, avaroha)
    pcset, pcset_str = t.pitch_class_set(aroha, avaroha)
    a_tok, v_tok = t.toks(aroha), t.toks(avaroha)
    played, unique = t.pitch_counts(aroha, avaroha)
    mirror_pcs, mirror_str, mirror_names = t.mirror_gamut(pcset)
    neg_pcs, neg_str, neg_names = t.negative_gamut(pcset)
    neg_asc, neg_desc = t.negative_seq(neg_pcs)
    return {
        'Purvanga Swaras': lower, 'Uttaranga Swaras': upper, 'Pitch Class Set': pcset_str, 'Tritones': t.tritones(pcset, tm),
        'Aroha Intervals': t.interval_listing(a_tok, aroha_steps), 'Avaroha Intervals': t.interval_listing(v_tok, avaroha_steps),
        'Aroha Large Gaps (>=m3)': t.large_gaps(a_tok, aroha_steps), 'Avaroha Large Gaps (>=m3)': t.large_gaps(v_tok, avaroha_steps),
        'Gamut Large Gaps (>=m3)': t.gamut_large_gaps(pcset, tm),
        'Imperfections (no 5th above)': t.imperfections(pcset, tm), 'Detached Swaras (no 5th either way)': t.detached_swaras(pcset, tm),
        'Pitches Played': str(played), 'Unique Pitches': str(unique),
        'Mirror Aroha': t.mirror_seq(a_tok), 'Mirror Avaroha': t.mirror_seq(v_tok),
        'Mirror Pitch Class Set': mirror_str, 'Mirror Swara Set': mirror_names,
        'Negative Pitch Class Set': neg_str, 'Negative Swaras': neg_names,
        'Negative Aroha': neg_asc, 'Negative Avaroha': neg_desc,
    }


def merged_bhashanga(rows):
    """A row whose source states Bhashanga outright (a page's own anya-swara note) beats one that only derived 'No' from its own
    printed scale not happening to show the extra note: that is an absence of evidence in that one scale, not evidence the raga
    isn't bhashanga. So a stated Yes/No wins a conflict against a derived value; two stated values that disagree still conflict,
    and so does a derived Yes against a derived No (both are read from real pitch content, just contradictory)."""
    vals = {r['Bhashanga'] for r in rows}
    real = vals & {'Yes', 'No'}
    if len(real) == 2:
        stated = {r['Bhashanga'] for r in rows if r['Bhashanga'] in real and r['Bhashanga Basis'] == 'stated by source'}
        if len(stated) == 1:
            return stated.pop()
        return 'Conflict'
    if real:
        return real.pop()
    return 'Needs Review' if 'Needs Review' in vals else 'Unknown'


def merged_basis(rows):
    value = merged_bhashanga(rows)
    if value in ('Yes', 'No'):
        stated = {r['Bhashanga Basis'] for r in rows if r['Bhashanga'] == value and r['Bhashanga Basis'] == 'stated by source'}
        if stated:
            return 'stated by source'
    b = {r['Bhashanga Basis'] for r in rows} - {''}
    return ' + '.join(sorted(b, reverse=True))



def main():
    with open(MASTER, encoding='utf-8', newline='') as f:
        rows = list(csv.DictReader(f))
    by_variant = collections.OrderedDict()
    for r in rows:
        by_variant.setdefault(r['Variant ID'], []).append(r)
    sorder = {s: i for i, s in enumerate(SCALE_PRIORITY)}

    fields = ['Raga ID', 'Variant ID', 'Type', 'Melakarta Number', 'Melakarta Name', 'Raga Name (Merged)', 'Aroha (Merged)', 'Avaroha (Merged)',
              'Aroha Semitones', 'Avaroha Semitones', 'Aroha Steps', 'Avaroha Steps', 'Chain Note', *PITCH_COLUMNS, *THEORY_FIELDS,
              'Vakra', 'Vakra Basis', 'Bhashanga (Merged)', 'Bhashanga Basis', 'Status', 'Single-Source Reason', 'Resolution', 'Unique Check', 'Variant Origin', 'Other Variants Of This Raga', 'Nearest Other-Source Variant',
              'Swara Distance', 'Difference Detail', 'Sources', 'Source Count', 'Rows Merged', 'Name Match', 'All Spellings',
              'Alias Names', 'Scale Twin Group', 'Ragas Sharing This Scale', 'Similar Names Not Merged', 'Same Name Under Other Melas', 'Multi-Parent Group', 'Also Listed Under Melas']
    for s in SOURCES:
        fields += ['Name (%s)' % LABEL[s], 'Aroha (%s)' % LABEL[s], 'Avaroha (%s)' % LABEL[s], 'Rows (%s)' % LABEL[s]]
    fields += ['Pravagam Page', 'Pravagam Item', 'Master IDs']

    raga_info = {}
    for r in rows:
        d = raga_info.setdefault(r['Raga ID'], {'name': r['Raga Name (Merged)'], 'mela': r['Melakarta Number'], 'sources': set(), 'variants': {}})
        d['sources'].add(r['Source List'])
        d['variants'].setdefault(r['Variant ID'], (r['Aroha Pitch Binary'], r['Aroha Note Order'], r['Avaroha Pitch Binary'], r['Avaroha Note Order'],
                                                    core_tokens(r['Aroha']), core_tokens(r['Avaroha'])))

    def closest(rid_a, rid_b):
        best = 99
        for va in raga_info[rid_a]['variants'].values():
            for vb in raga_info[rid_b]['variants'].values():
                best = min(best, edit_distance(va[4], vb[4]) + edit_distance(va[5], vb[5]))
        return best

    def resolution(rep, reason):
        rid = rep['Raga ID']
        me = raga_info[rid]
        if reason.startswith('B1'):
            parts = []
            for sid in rep['Similar Names Not Merged'].split()[:3]:
                o = raga_info[sid]
                why = 'a source lists both names' if me['sources'] & o['sources'] else 'the scales differ by %d swaras' % closest(rid, sid)
                parts.append('%s %s: %s' % (sid, o['name'], why))
            return 'Kept separate from ' + '; '.join(parts)
        if reason.startswith('B2'):
            mine = raga_info[rid]['variants'][rep['Variant ID']][:4]
            parts = []
            for oid in rep['Same Name Under Other Melas'].split()[:3]:
                o = raga_info[oid]
                if any(v[:4] == mine for v in o['variants'].values()):
                    parts.append('same raga under mela %s (%s): same name and scale' % (o['mela'], oid))
                else:
                    parts.append('different scale under mela %s (%s, %d swaras apart): a different raga' % (o['mela'], oid, closest(rid, oid)))
            text = '; '.join(parts)
            return text[:1].upper() + text[1:]
        return ''

    # Unique Check (B4 rows): is the name found under another mela? does this scale also fit that mela?
    from build_raga_tables import split_name, name_key, fold_more      # imported here: build_raga_tables imports this module
    from fix_royal_carpet_parent import tmap
    name_index = collections.defaultdict(dict)                          # folded name -> {Raga ID: mela}
    for r in rows:
        if r['Raga Type'] == 'Janya':
            name_index[fold_more(name_key(split_name(r['Raga Name'])[0]))][r['Raga ID']] = r['Melakarta Number']

    def fits_mela(aroha, avaroha, mela):
        if not mela.isdigit():
            return False
        d = tmap(int(mela))
        return all(t in ('S', 'P') or len(t) == 1 or d[t[0]] == t for t in core_tokens(aroha + ' ' + avaroha))

    def unique_check(rep):
        key = fold_more(name_key(split_name(rep['Raga Name (Merged)'])[0]))
        here = {rid: m for rid, m in name_index[key].items() if m != rep['Melakarta Number']}
        if not here:
            return 'Checked: no similar name in this mela or under another mela'
        parts = []
        for rid, m in list(here.items())[:3]:
            parts.append('same name under mela %s (%s), different scale; this scale %s mela %s' % (
                m, rid, 'also fits' if fits_mela(rep['Aroha'], rep['Avaroha'], m) else 'does not fit', m))
        return 'Checked in this mela: no similar name. Under other melas: ' + '; '.join(parts)

    raga_variants = collections.defaultdict(list)     # Raga ID -> [(variant id, sources, aroha tokens, avaroha tokens)]
    for vid, vrs in by_variant.items():
        rep0 = sorted(vrs, key=lambda r: (sorder.get(r['Source List'], 9), r['Master ID']))[0]
        raga_variants[rep0['Raga ID']].append((vid, {r['Source List'] for r in vrs}, core_tokens(rep0['Aroha']), core_tokens(rep0['Avaroha'])))

    out = []
    for vid, rs in by_variant.items():
        rs = sorted(rs, key=lambda r: (sorder.get(r['Source List'], 9), r['Master ID']))
        rep = rs[0]
        srcs = [s for s in SOURCES if any(r['Source List'] == s for r in rs)]
        n_src = len(srcs)
        status = 'Confirmed by %d sources' % n_src if n_src >= 2 else ('Repeated within one source' if len(rs) > 1 else 'Single source')
        reason = nearest = dist = detail = resolved = unique = ''
        if status == 'Single source':
            reason = single_source_reason(rep, int(rep['Raga Source Count']))
            if reason.startswith('A.'):
                mine = ({r['Source List'] for r in rs}, core_tokens(rep['Aroha']), core_tokens(rep['Avaroha']))
                best = None
                for ovid, osrc, oa, ov in raga_variants[rep['Raga ID']]:
                    if ovid == vid or not (osrc - mine[0]):
                        continue                                # only compare with versions that another source gives
                    d = edit_distance(mine[1], oa) + edit_distance(mine[2], ov)
                    key = (d, -len(osrc), ovid)
                    if best is None or key < best[0]:
                        best = (key, ovid, d, oa, ov)
                if best:
                    nearest, dist = best[1], best[2]
                    parts = []
                    da, dv = describe(mine[1], best[3]), describe(mine[2], best[4])
                    if da:
                        parts.append('aroha ' + da)
                    if dv:
                        parts.append('avaroha ' + dv)
                    detail = '; '.join(parts) or 'same swaras, different order or octave'
            resolved = resolution(dict(rep, **{'Variant ID': vid}), reason)
            unique = unique_check(dict(rep, **{'Raga Name (Merged)': rep['Raga Name (Merged)']})) if reason.startswith('B4') else ''
        elif status.startswith('Repeated'):
            reason = 'Repeat of the same scale inside one source'
        origin, others_text = variant_origin(rep, vid, srcs, raga_variants, LABEL, raga_names_merged=rep['Names Merged On'])
        merged_on = rep['Names Merged On']
        name_match = ('Names merged on ' + merged_on) if merged_on and n_src >= 2 else ('Same name' if n_src >= 2 else '')
        vak = {r['Vakra'] for r in rs if r['Vakra']}
        vakra_value = next(iter(vak)) if len(vak) == 1 else ''
        rel = {r['Vakra Reliable'] for r in rs}
        basis = 'Ruled by the user' if 'ruled' in rel else ('Unreliable' if 'no' in rel else ('' if not vak else 'Pitch rule'))
        chain = chain_columns(rep['Aroha'], rep['Avaroha'], vakra_value)
        a_steps = [int(x) for x in chain['Aroha Steps'].split()]
        v_steps = [int(x) for x in chain['Avaroha Steps'].split()]
        row = {
            'Raga ID': rep['Raga ID'], 'Variant ID': vid, 'Type': rep['Raga Type'], 'Melakarta Number': rep['Melakarta Number'],
            'Melakarta Name': rep['Melakarta Name'], 'Raga Name (Merged)': rep['Raga Name (Merged)'],
            'Aroha (Merged)': rep['Aroha'], 'Avaroha (Merged)': rep['Avaroha'],
            **{c: rep[c] for c in PITCH_COLUMNS}, **chain,
            **theory_columns(rep['Aroha'], rep['Avaroha'], a_steps, v_steps),
            'Vakra': vak.pop() if len(vak) == 1 else ('Mixed' if vak else ''), 'Vakra Basis': basis,
            'Single-Source Reason': reason, 'Resolution': resolved, 'Unique Check': unique, 'Variant Origin': origin, 'Other Variants Of This Raga': others_text,
            'Nearest Other-Source Variant': nearest, 'Swara Distance': dist, 'Difference Detail': detail,
            'Bhashanga (Merged)': merged_bhashanga(rs), 'Bhashanga Basis': merged_basis(rs), 'Status': status, 'Sources': ', '.join(LABEL[s] for s in srcs),
            'Source Count': n_src, 'Rows Merged': len(rs), 'Name Match': name_match, 'All Spellings': rep['Raga All Names'],
            'Alias Names': rep['Raga Alias Names'], 'Scale Twin Group': rep['Scale Twin Group'],
            'Ragas Sharing This Scale': rep['Ragas Sharing This Scale'], 'Similar Names Not Merged': rep['Similar Names Not Merged'],
            'Same Name Under Other Melas': rep['Same Name Under Other Melas'], 'Multi-Parent Group': rep['Multi-Parent Group'],
            'Also Listed Under Melas': rep['Also Listed Under Melas'], 'Master IDs': ' '.join(r['Master ID'] for r in rs),
        }
        for s in SOURCES:
            sr = [r for r in rs if r['Source List'] == s]
            row['Name (%s)' % LABEL[s]] = SEP.join(r['Raga Name'] for r in sr)
            row['Aroha (%s)' % LABEL[s]] = SEP.join(r['Aroha'] for r in sr)
            row['Avaroha (%s)' % LABEL[s]] = SEP.join(r['Avaroha'] for r in sr)
            row['Rows (%s)' % LABEL[s]] = SEP.join(r['Source Row'] for r in sr)
        prav = [r for r in rs if r['Source List'] == 'PRAVAGAM']
        row['Pravagam Page'] = SEP.join(r['Source Page'] for r in prav)
        row['Pravagam Item'] = SEP.join(r['Source Item Number'] for r in prav)
        out.append(row)

    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator=CRLF)
        w.writeheader()
        w.writerows(out)

    c = collections.Counter(r['Status'].split(' by')[0] for r in out)
    print('merged rows (variants): %d | master rows covered: %d' % (len(out), sum(r['Rows Merged'] for r in out)))
    print('status:', dict(c))
    print('confirmed by 2+ sources: %d | 3+: %d | 5+: %d' % (sum(1 for r in out if r['Source Count'] >= 2), sum(1 for r in out if r['Source Count'] >= 3),
                                                            sum(1 for r in out if r['Source Count'] >= 5)))
    reasons = collections.Counter(r['Single-Source Reason'].split('.')[0] for r in out if r['Single-Source Reason'])
    print('single-source reasons:', dict(sorted(reasons.items())))
    dist = collections.Counter(r['Swara Distance'] for r in out if r['Swara Distance'] != '')
    print('case A distance to the nearest other-source variant:', dict(sorted(dist.items())[:8]), '| no comparable variant:',
          sum(1 for r in out if r['Single-Source Reason'].startswith('A.') and r['Swara Distance'] == ''))
    return out


if __name__ == '__main__':
    main()
