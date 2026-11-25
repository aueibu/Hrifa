import csv, re, sys
sys.path.insert(0, '/tmp/claude-0/-home-claude/98dead27-42d9-5d43-928b-934f77d03df8/scratchpad')
import build_scale_ids as B

MASTER = '/mnt/user-data/outputs/master-carnatic-raga-database.csv'
with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def compute_bits_and_raw(r):
    mela_str = r['Melakarta Number'].strip()
    mela_num = int(mela_str) if mela_str.isdigit() else None
    ar_tokens, av_tokens, src = B.get_best_tokens(r)
    if ar_tokens is None:
        return None
    review = []
    ar_semis = B.resolve_semitones(ar_tokens, mela_num, review)
    av_semis = B.resolve_semitones(av_tokens, mela_num, review)
    ar_bits = B.bits_from_semitones(ar_semis) | 1
    av_bits = B.bits_from_semitones(av_semis) | 1
    raw = (r.get(f'Aroha ({src})',''), r.get(f'Avaroha ({src})','')) if src else (None, None)
    return B.bits_to_binstr(ar_bits), B.bits_to_binstr(av_bits), raw, review

from collections import defaultdict
groups = defaultdict(list)
computed = {}
for i, r in enumerate(rows):
    res = compute_bits_and_raw(r)
    if res is None:
        continue
    ar_bits, av_bits, raw, review = res
    computed[i] = (ar_bits, av_bits, raw)
    key = (r['Melakarta Number'], r['Raga Name'], ar_bits, av_bits)
    groups[key].append(i)

to_delete = set()
merge_notes = defaultdict(list)  # idx -> list of notes to append

for key, idxs in groups.items():
    if len(idxs) < 2:
        continue
    mela_num, raga_name = key[0], key[1]
    # find raw-string duplicates within group
    raw_map = defaultdict(list)
    for i in idxs:
        raw_map[computed[i][2]].append(i)

    parent_idx = next((i for i in idxs if rows[i]['Row Type'] == 'Melakarta (base scale)'), None)

    if parent_idx is not None:
        # merge all non-parent rows in this group into the parent row (they're the melakarta re-listed as its own janya)
        for i in idxs:
            if i == parent_idx:
                continue
            # carry forward any source flags the janya-row had that the parent doesn't
            jr = rows[i]
            pr = rows[parent_idx]
            changed_sources = []
            for src in ['Repo', 'Musiclegato', 'Royal Carpet', 'Carnatic Pasted Dataset']:
                col = f'In {src}'
                if jr.get(col) == 'Y' and pr.get(col) != 'Y':
                    pr[col] = 'Y'
                    # also copy aroha/avaroha for that source if parent lacks it
                    a_col, d_col = f'Aroha ({src.replace(" Dataset","")})', f'Avaroha ({src.replace(" Dataset","")})'
                    if not pr.get(a_col) and jr.get(a_col):
                        pr[a_col] = jr[a_col]
                        pr[d_col] = jr[d_col]
                    changed_sources.append(src)
            if changed_sources:
                merge_notes[parent_idx].append(f"absorbed source attestation(s) {changed_sources} from a redundant separate \"Janya\" row also named \"{jr['Raga Name']}\" (the melakarta's own name trivially re-listed as its own janya by one of the sources)")
            else:
                merge_notes[parent_idx].append(f"removed a redundant duplicate \"Janya\" row also named \"{jr['Raga Name']}\" (the melakarta's own name trivially re-listed as its own janya, fully redundant with this row)")
            to_delete.add(i)
    else:
        # no parent row in group - collapse exact raw-string duplicates (same source repeating itself)
        for raw, dup_idxs in raw_map.items():
            if len(dup_idxs) < 2:
                continue
            keep = dup_idxs[0]
            n_extra = len(dup_idxs) - 1
            merge_notes[keep].append(f"Royal Carpet's own source page listed this raga {len(dup_idxs)}x under melakarta {mela_num} with byte-identical scale text; collapsed to one row ({n_extra} redundant duplicate line(s) removed)")
            for i in dup_idxs[1:]:
                to_delete.add(i)

print("Rows to delete:", len(to_delete))
print("Rows receiving merge notes:", len(merge_notes))

for i, notes in merge_notes.items():
    r = rows[i]
    combined = '; '.join(notes)
    note = f"N - info: {combined}"
    r['Needs Review'] = note if r['Needs Review'] in ('N','') else r['Needs Review'] + ' | ' + note

new_rows = [r for i, r in enumerate(rows) if i not in to_delete]
print("Final row count:", len(new_rows), "(was", len(rows), ")")

with open(MASTER, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in new_rows:
        writer.writerow(r)

print("Master file deduplicated and rewritten.")
