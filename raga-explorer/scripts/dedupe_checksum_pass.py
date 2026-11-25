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

def compute_all(r):
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
    checksum = B.raga_checksum(ar_bits, av_bits, vakra, ar_semis, av_semis)
    return checksum, src

buckets = defaultdict(list)
computed = {}
for i, r in enumerate(rows):
    res = compute_all(r)
    if res is None:
        continue
    computed[i] = res
    checksum, src = res
    buckets[(r['Melakarta Number'], norm(r['Raga Name']), checksum)].append(i)

to_delete = set()
merged = 0
for key, idxs in buckets.items():
    if len(idxs) < 2:
        continue
    parent_idx = next((i for i in idxs if rows[i]['Row Type'] == 'Melakarta (base scale)'), None)
    if parent_idx is None:
        continue  # different case (e.g. two janya-only rows with same checksum) - handle separately if found
    parent = rows[parent_idx]
    for i in idxs:
        if i == parent_idx:
            continue
        jr = rows[i]
        changed = []
        for src_label, cols in [('Repo', ('Aroha (Repo)','Avaroha (Repo)')),
                                  ('Musiclegato', ('Aroha (Musiclegato)','Avaroha (Musiclegato)')),
                                  ('Royal Carpet', ('Aroha (Royal Carpet)','Avaroha (Royal Carpet)')),
                                  ('Carnatic Pasted Dataset', ('Aroha (Carnatic Pasted)','Avaroha (Carnatic Pasted)'))]:
            col = f'In {src_label}'
            if jr.get(col) == 'Y' and parent.get(col) != 'Y':
                parent[col] = 'Y'
                a_col, d_col = cols
                if not parent.get(a_col) and jr.get(a_col):
                    parent[a_col] = jr[a_col]
                    parent[d_col] = jr[d_col]
                changed.append(src_label)
        note = (f"N - info: merged redundant \"Janya\" row spelled \"{jr['Raga Name']}\" (normalizes to the same name as this melakarta) "
                f"with identical checksum - it was the melakarta's own name re-listed as its own janya" +
                (f"; absorbed source attestation(s) {changed}" if changed else "; fully redundant, no new source data"))
        parent['Needs Review'] = note if parent['Needs Review'] in ('N','') else parent['Needs Review'] + ' | ' + note
        to_delete.add(i)
        merged += 1

print("Rows merged via checksum-based normalized-name sweep:", merged)
new_rows = [r for i, r in enumerate(rows) if i not in to_delete]
print("Final row count:", len(new_rows), "(was", len(rows), ")")

with open(MASTER, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in new_rows:
        writer.writerow(r)
print("Master file rewritten.")
