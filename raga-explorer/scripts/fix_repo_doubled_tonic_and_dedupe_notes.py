import csv, re

MASTER = '/mnt/user-data/outputs/master-carnatic-raga-database.csv'
with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)

pat_end_ss = re.compile(r"\bS\s+S'\s*$")
pat_start_ss = re.compile(r"^\s*S'\s+S\b")

fixed_count = 0
for r in rows:
    ar, av = r['Aroha (Repo)'], r['Avaroha (Repo)']
    if not ar or not pat_end_ss.search(ar):
        continue
    old_ar, old_av = ar, av
    new_ar = pat_end_ss.sub("S'", ar)
    new_av = pat_start_ss.sub("S'", av)
    r['Aroha (Repo)'] = new_ar
    r['Avaroha (Repo)'] = new_av

    # replace the old "duplicate order values" flag with a fixed-note, drop other segments unchanged
    segs = [s.strip() for s in r['Needs Review'].split('|')] if r['Needs Review'] not in ('N','') else []
    new_segs = []
    replaced = False
    for s in segs:
        if "duplicate 'order' values" in s:
            new_segs.append(
                f'N - info: source repo data originally had duplicate \'order\' values in arohanas/avarohanas '
                f'(both S and S\' listed at the same position: was "{old_ar}" / "{old_av}") - cleaned to a single '
                f'closing S\' ("{new_ar}" / "{new_av}")'
            )
            replaced = True
        else:
            new_segs.append(s)
    if not replaced:
        # shouldn't happen given our earlier flagging, but handle gracefully
        new_segs.append(f'N - info: repo doubled tonic (S S\') cleaned to a single S\'')
    r['Needs Review'] = ' | '.join(new_segs) if new_segs else 'N'
    fixed_count += 1

print("Repo doubled-tonic rows fixed:", fixed_count)

# ---- dedupe repeated segments within Needs Review across ALL rows ----
dedupe_count = 0
for r in rows:
    nr = r['Needs Review']
    if not nr or nr == 'N':
        continue
    segs = [s.strip() for s in nr.split('|')]
    seen = []
    for s in segs:
        if s not in seen:
            seen.append(s)
    if len(seen) != len(segs):
        dedupe_count += 1
    r['Needs Review'] = ' | '.join(seen) if seen else 'N'

print("Rows with duplicated Needs Review segments deduped:", dedupe_count)

with open(MASTER, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
print("Master file rewritten.")
