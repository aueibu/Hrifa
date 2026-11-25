# -*- coding: utf-8 -*-
"""One-time fix for a Raga Pravagam extraction bug: when the PDF's raw text
had zero whitespace between a raga's name and the first token of its own
Arohanam (e.g. "SamanthaDeepakamSR GM PN S..."), extract_pravagam.py's
name-detection heuristic (any token containing a lowercase letter = part of
the name) swallowed the opening swara letters into the Raga Name field,
truncating that row's own Arohanam by the same amount. Multi-variant ragas
also copy the (then-contaminated) name onto sibling continuation rows that
never had the bug themselves, so the aroha fix must only apply to the one
row whose own Raw Row Text shows the glued name+fragment - siblings only
need the cosmetic name fixed.

Fixes docs/raga-pravagam-full-extraction.csv (the source of truth) first,
then propagates the same correction into data/master-carnatic-raga-database.csv
wherever the (now-stale) contaminated name/aroha was already merged in as
the Pravagam source column.
"""
import csv, re

PRAVAGAM = r"C:\Data Files\Projects\Hrifa\raga-explorer\docs\raga-pravagam-full-extraction.csv"
MASTER = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\master-carnatic-raga-database.csv"

CONTAM_GLUED = re.compile(r"^(.*[a-z])([SRGMPDN]{1,4})$")
CONTAM_SPACED = re.compile(r"^(.*[a-z])\s+([SRGMPDN]{1,4})$")

def fix_pravagam_source():
    with open(PRAVAGAM, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    frag_by_name = {}
    for r in rows:
        m = CONTAM_GLUED.match(r["Raga Name"])
        if not m:
            continue
        base = m.group(1)
        raw = r["Raw Row Text"]
        rest = re.sub(r"^\s*\d{1,3}\.?\s*", "", raw)
        if not rest.startswith(r["Raga Name"]):
            continue  # sibling row that only inherited the contaminated name cosmetically
        after = rest[len(r["Raga Name"]):]
        fm = re.match(r"^([SRGMPDN]+)", after)
        if fm:
            frag_by_name[r["Raga Name"]] = fm.group(1)

    fixed = 0
    for r in rows:
        m = CONTAM_GLUED.match(r["Raga Name"])
        if not m:
            continue
        base = m.group(1)
        old_name = r["Raga Name"]
        raw = r["Raw Row Text"]
        rest = re.sub(r"^\s*\d{1,3}\.?\s*", "", raw)
        is_true_source = rest.startswith(old_name)
        r["Raga Name"] = base
        if r["Title"].startswith(old_name):
            r["Title"] = base + r["Title"][len(old_name):]
        if is_true_source and old_name in frag_by_name:
            frag = frag_by_name[old_name]
            r["Arohanam"] = (" ".join(frag) + " " + r["Arohanam"]).strip()
            r["Confidence"] = (r["Confidence"] + " " if r["Confidence"] else "") + \
                "[name/aroha fix: name column absorbed the aroha-opening swara token with no space in source text]"
        fixed += 1

    print("Pravagam source rows fixed:", fixed)
    with open(PRAVAGAM, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    return frag_by_name

def fix_master(frag_by_name):
    frag_by_name_nospace = {k.replace(" ", "").lower(): " ".join(v) for k, v in frag_by_name.items()}

    with open(MASTER, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    fixed = 0
    for r in rows:
        full = r["Raga Name"]
        m = re.match(r"^(.*?)(\s+\d+)?$", full)
        namepart, suffix = m.group(1), m.group(2) or ""
        m2 = CONTAM_GLUED.match(namepart) or CONTAM_SPACED.match(namepart)
        if not m2:
            continue
        base = m2.group(1)
        key = base.replace(" ", "").lower()
        if key not in frag_by_name_nospace:
            continue
        frag = frag_by_name_nospace[key]
        r["Raga Name"] = base + suffix
        old_aroha = r["Aroha (Pravagam)"]
        if old_aroha and old_aroha.strip().split(" ")[0] not in ("S", "N"):
            r["Aroha (Pravagam)"] = frag + " " + old_aroha
        fixed += 1

    print("Master DB rows fixed:", fixed)
    with open(MASTER, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

if __name__ == "__main__":
    frag_by_name = fix_pravagam_source()
    fix_master(frag_by_name)
