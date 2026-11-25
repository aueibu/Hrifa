import csv

MASTER = '/mnt/user-data/outputs/master-carnatic-raga-database.csv'
with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)

# 1) remove the 11 unscaled rows added from the lossy AI-summarized extraction
before = len(rows)
rows = [r for r in rows if 'no aroha/avaroha given by that source' not in r['Needs Review']]
print("Removed unscaled placeholder rows:", before - len(rows))

# 2) strip the 5 cross-melakarta-attribution note segments (superseded by the full re-extraction)
stripped = 0
for r in rows:
    nr = r['Needs Review']
    if 'attributes this raga to melakarta' not in nr:
        continue
    segs = [s.strip() for s in nr.split('|')]
    segs = [s for s in segs if 'attributes this raga to melakarta' not in s]
    r['Needs Review'] = ' | '.join(segs) if segs else 'N'
    stripped += 1
print("Stripped cross-attribution notes from rows:", stripped)

with open(MASTER, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
print("Final row count:", len(rows))
