import csv, re

MASTER = '/mnt/user-data/outputs/master-carnatic-raga-database.csv'
with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)

target_idx = None
dup_idx = None
for i, r in enumerate(rows):
    if r['Melakarta Number'] == '20' and r['Raga Name'] == 'Jingaḷa':
        target_idx = i
    if r['Melakarta Number'] == '20' and r['Raga Name'] == 'Jinga%e1%b8%b7a':
        dup_idx = i

assert target_idx is not None and dup_idx is not None
target = rows[target_idx]
dup = rows[dup_idx]

print("Before merge:")
print(" target:", {k: target[k] for k in ['In Repo','In Musiclegato','In Royal Carpet','In Carnatic Pasted Dataset','Sources Agreeing Count']})
print(" dup:", {k: dup[k] for k in ['In Repo','In Musiclegato','In Royal Carpet','In Carnatic Pasted Dataset','Sources Agreeing Count']})

# merge musiclegato data from dup into target
assert target['In Musiclegato'] == 'N'
assert dup['Aroha (Musiclegato)']
target['In Musiclegato'] = 'Y'
target['Aroha (Musiclegato)'] = dup['Aroha (Musiclegato)']
target['Avaroha (Musiclegato)'] = dup['Avaroha (Musiclegato)']
target['Sources Agreeing Count'] = str(int(target['Sources Agreeing Count']) + 1)

# base-letter comparison note: check musiclegato aroha vs repo/pasted aroha already flagged as disagreeing with RC;
# add a note that musiclegato's raw scraped raga-name link was percent-encoded and has now been decoded+merged
merge_note = 'N - info: this raga name was scraped from musiclegato as the URL-encoded string "Jinga%e1%b8%b7a" (a source-page encoding artifact); decoded to "Jingaḷa" and merged into this existing row as the Musiclegato attestation rather than kept as a separate duplicate raga'
target['Needs Review'] = merge_note if target['Needs Review'] in ('N','') else target['Needs Review'] + ' | ' + merge_note

print("\nAfter merge target:", {k: target[k] for k in ['In Repo','In Musiclegato','In Royal Carpet','In Carnatic Pasted Dataset','Sources Agreeing Count']})

# remove the duplicate row
rows.pop(dup_idx)

with open(MASTER, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in rows:
        writer.writerow(r)

print("\nMaster file rewritten:", len(rows), "rows (was", len(rows)+1, ")")
