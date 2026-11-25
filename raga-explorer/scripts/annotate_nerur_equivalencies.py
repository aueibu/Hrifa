"""Fold the Nerur list's small raga-equivalencies section (asampoorna/alternate
names, e.g. "panthuvarALi = kAmavardhini") into Needs Review as cross-reference
notes on the affected rows. Informational only - no auto-merging, consistent
with how alternate-name info from other sources is already handled.
"""
import csv, re, unicodedata
from collections import defaultdict

MASTER = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\master-carnatic-raga-database.csv"
EQ = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\nerur-raga-equivalencies.csv"

with open(MASTER, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)

with open(EQ, encoding="utf-8") as f:
    eq_rows = list(csv.DictReader(f))

def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-zA-Z0-9]", "", s).lower()

by_norm_name = defaultdict(list)
for r in rows:
    by_norm_name[norm(r["Raga Name"])].append(r)

def add_note(r, note):
    r["Needs Review"] = note if r["Needs Review"] in ("N", "") else r["Needs Review"] + " | " + note

applied = 0
for eq in eq_rows:
    lhs, rhs = eq["Raga Name"], eq["Equivalent To"]
    lhs_matches = by_norm_name.get(norm(lhs), [])
    rhs_matches = by_norm_name.get(norm(rhs), [])
    note = f"N - info: Nerur list equivalency - \"{lhs}\" = \"{rhs}\" (not auto-merged; verify before treating as duplicate)"
    targets = lhs_matches + rhs_matches
    if not targets:
        print(f"UNRESOLVED equivalency, no matching row for either side: {lhs} = {rhs}")
        continue
    for r in targets:
        add_note(r, note)
        applied += 1
    print(f"Annotated {len(targets)} row(s) for: {lhs} = {rhs}")

print("Total annotations applied:", applied)

with open(MASTER, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
print("Master updated with equivalency cross-reference notes.")
