import csv, re, sys
sys.path.insert(0, '/tmp/claude-0/-home-claude/98dead27-42d9-5d43-928b-934f77d03df8/scratchpad')
import build_scale_ids as B
from collections import defaultdict

MASTER = '/mnt/user-data/outputs/master-carnatic-raga-database.csv'
with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def compute_bits_vakra(r):
    mela_str = r['Melakarta Number'].strip()
    mela_num = int(mela_str) if mela_str.isdigit() else None
    ar_tokens, av_tokens, src = B.get_best_tokens(r)
    if ar_tokens is None:
        return None
    review = []
    ar_semis = B.resolve_semitones(ar_tokens, mela_num, review)
    av_semis = B.resolve_semitones(av_tokens, mela_num, review)
    ar_bits = B.bits_to_binstr(B.bits_from_semitones(ar_semis) | 1)
    av_bits = B.bits_to_binstr(B.bits_from_semitones(av_semis) | 1)
    vakra = B.is_vakra(ar_semis, True) or B.is_vakra(av_semis, False)
    return ar_bits, av_bits, vakra

buckets = defaultdict(list)
for i, r in enumerate(rows):
    if r['Row Type'].startswith('Janya'):
        buckets[(r['Melakarta Number'], norm(r['Raga Name']))].append(i)

to_delete = set()
groups_touched = 0
rows_folded = 0

for key, idxs in buckets.items():
    if len(idxs) < 2:
        continue
    rs = [rows[i] for i in idxs]
    all_rc_only = all(r['In Royal Carpet']=='Y' and r['In Repo']=='N' and r['In Musiclegato']=='N' and r['In Carnatic Pasted Dataset']=='N' for r in rs)
    if not all_rc_only:
        continue

    # sub-bucket by (bits, vakra) signature - only collapse WITHIN a signature
    sig_buckets = defaultdict(list)
    for i in idxs:
        sig = compute_bits_vakra(rows[i])
        if sig is None:
            continue
        sig_buckets[sig].append(i)

    group_had_a_merge = False
    for sig, sub_idxs in sig_buckets.items():
        if len(sub_idxs) < 2:
            continue
        primary_idx = sub_idxs[0]
        primary = rows[primary_idx]
        n_folded = 0
        for i in sub_idxs[1:]:
            r = rows[i]
            same_text = (r['Aroha (Royal Carpet)'] == primary['Aroha (Royal Carpet)'] and
                         r['Avaroha (Royal Carpet)'] == primary['Avaroha (Royal Carpet)'])
            to_delete.add(i)
            n_folded += 1
            rows_folded += 1
        note = (f"N - info: Royal Carpet's own janya list under this melakarta listed \"{primary['Raga Name']}\" "
                f"{n_folded + 1} times with melodically-identical content (same notes, same aroha/avaroha direction-pattern) "
                f"- consolidated to one row; {n_folded} redundant listing(s) removed")
        primary['Needs Review'] = note if primary['Needs Review'] in ('N', '') else primary['Needs Review'] + ' | ' + note
        group_had_a_merge = True

    if group_had_a_merge:
        groups_touched += 1

print("Same-name-same-mela RC-only groups with a genuine (bits+vakra)-identical redundancy collapsed:", groups_touched)
print("Rows folded away:", rows_folded)

new_rows = [r for i, r in enumerate(rows) if i not in to_delete]
print("Final row count:", len(new_rows), "(was", len(rows), ")")

with open(MASTER, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in new_rows:
        writer.writerow(r)

print("Master file consolidated (structure-aware) and rewritten.")
