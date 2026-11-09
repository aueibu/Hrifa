import csv, unicodedata, re
from collections import defaultdict

def norm(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]', '', s.lower())
    return s

with open('/mnt/user-data/outputs/ragas-with-scale-ids.csv', newline='', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

print(f"Total rows: {len(rows)}")

# 1. checksum-based full duplicate sweep: group by (Melakarta Number, norm(name), checksum)
groups = defaultdict(list)
for r in rows:
    if not r.get('Raga Checksum'):
        continue
    key = (r['Melakarta Number'].strip(), norm(r['Raga Name']), r['Raga Checksum'])
    groups[key].append(r)

dupe_groups = {k: v for k, v in groups.items() if len(v) > 1}
print(f"\nTrue duplicate groups (same mela, same normalized name, same checksum): {len(dupe_groups)}")
for k, v in list(dupe_groups.items())[:20]:
    print(f"  mela={k[0]} name={k[1]} checksum={k[2][:40]}... -> {len(v)} rows: {[r['Raga Name'] for r in v]}")

# 2. mixed-vakra groups: same mela+name, different checksums, at least one differs in vakra or bits
name_groups = defaultdict(list)
for r in rows:
    if not r.get('Raga Checksum'):
        continue
    key = (r['Melakarta Number'].strip(), norm(r['Raga Name']))
    name_groups[key].append(r)

mixed = 0
for k, v in name_groups.items():
    checksums = set(r['Raga Checksum'] for r in v)
    if len(checksums) > 1:
        mixed += 1

print(f"\nGroups (same mela+name) with genuinely different checksums (distinct melodic variants preserved): {mixed}")

# 3. Wikipedia source usage stats
src_counts = defaultdict(int)
for r in rows:
    src_counts[r.get('Scale Source Used', '')] += 1
print("\nScale Source Used breakdown:")
for src, cnt in sorted(src_counts.items(), key=lambda x: -x[1]):
    print(f"  {src or '(none/unresolved)'}: {cnt}")

# 4. rows still flagged for review
flagged = [r for r in rows if r.get('Scale ID Review','').startswith('Y')]
print(f"\nRows flagged for Scale ID Review: {len(flagged)}")
for r in flagged[:20]:
    print(f"  {r['Melakarta Number']} {r['Raga Name']}: {r['Scale ID Review']}")
