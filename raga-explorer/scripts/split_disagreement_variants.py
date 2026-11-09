# -*- coding: utf-8 -*-
"""One-time pass: split janya rows where sources disagree on the swara
sequence into separate numbered-variant rows (e.g. "Kannada 1", "Kannada 2"),
instead of collapsing them into one row plus a `Needs Review` disagreement
note. See README.md "Key design decisions" for the rationale.
"""
import csv, re, json
from collections import defaultdict

MASTER = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\master-carnatic-raga-database.csv"
SPLIT_LOG_OUT = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\backups\variant-split-log.json"

SOURCES = ["Repo", "Musiclegato", "Royal Carpet", "Wikipedia", "Nerur"]  # variety-tagged sources
PRIORITY = ["Musiclegato", "Nerur", "Wikipedia", "Repo", "Royal Carpet", "Karnatic Tutor"]  # matches build_scale_ids.get_best_tokens, KT last

BURIED_VARIANT_RE = re.compile(r"additional scale variant[^:]*field:\s*([^|]+)")

def variety_pattern(s):
    """'S -R1- M1- P- D1- S' / "S' N1 D1 P M1 G1 R1 S" -> normalized 'S R1 M1 P D1 S' style string."""
    if not s:
        return ""
    toks = re.findall(r"[A-Za-z]+\d*", s)
    out = []
    for t in toks:
        t = t.strip("'")
        if not t:
            continue
        out.append(t.upper())
    return " ".join(out)

def bare_pattern(s):
    return re.sub(r"\d", "", variety_pattern(s)).replace(" ", "")

def kt_bare_pattern(s):
    """Karnatic Tutor's syllable format carries no variety info (just 'Ri', not R1/R2/R3)."""
    if not s:
        return ""
    toks = re.findall(r"Sa|Ri|Ga|Ma|Pa|Da|Dha|Ni|SA|S(?![a-z])", s)
    return "".join(t[0].upper() for t in toks if t)

def buried_variants(needs_review):
    """Extract Royal Carpet's own footnoted extra variants (previously invisible
    text in Needs Review) as first-class (aroha, avaroha) pattern pairs."""
    out = []
    for seg in BURIED_VARIANT_RE.findall(needs_review or ""):
        seg = seg.strip()
        if "/" not in seg:
            continue
        a, v = seg.split("/", 1)
        out.append((variety_pattern(a), variety_pattern(v)))
    return out

def main():
    with open(MASTER, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    out_rows = []
    n_split_rows = 0
    n_examined = 0
    split_log = []

    for r in rows:
        if r["Row Type"] != "Janya":
            out_rows.append(r)
            continue

        # gather (aroha_pattern, avaroha_pattern) -> set of source labels
        groups = defaultdict(set)
        group_data = {}  # key -> {source: (araw, vraw)} raw text actually used for that source in that group

        has_any = False
        for src in SOURCES:
            araw = r.get(f"Aroha ({src})", "")
            vraw = r.get(f"Avaroha ({src})", "")
            if not araw and not vraw:
                continue
            has_any = True
            key = (variety_pattern(araw), variety_pattern(vraw))
            groups[key].add(src)
            group_data.setdefault(key, {})[src] = (araw, vraw)

        # buried Royal Carpet variants: extra evidence, may match an existing group or form a new one
        for araw_n, vraw_n in buried_variants(r.get("Needs Review", "")):
            key = (araw_n, vraw_n)
            groups[key].add("Royal Carpet")
            group_data.setdefault(key, {})["Royal Carpet"] = (araw_n, vraw_n)
            has_any = True

        # Karnatic Tutor: fold into a matching bare-letter group, else its own (unresolved-variety) group
        kt_a = r.get("Aroha (Karnatic Tutor)", "")
        kt_v = r.get("Avaroha (Karnatic Tutor)", "")
        if kt_a or kt_v:
            has_any = True
            kt_bare_a = kt_bare_pattern(kt_a)
            kt_bare_v = kt_bare_pattern(kt_v)
            matched_key = None
            for key in list(groups.keys()):
                a_pat, v_pat = key
                if bare_pattern(a_pat) == kt_bare_a and bare_pattern(v_pat) == kt_bare_v:
                    matched_key = key
                    break
            if matched_key is not None:
                groups[matched_key].add("Karnatic Tutor")
                group_data[matched_key]["Karnatic Tutor"] = (kt_a, kt_v)
            else:
                key = (f"__KT__{kt_bare_a}", f"__KT__{kt_bare_v}")
                groups[key].add("Karnatic Tutor")
                group_data.setdefault(key, {})["Karnatic Tutor"] = (kt_a, kt_v)

        if not has_any:
            out_rows.append(r)
            continue

        n_examined += 1

        if len(groups) <= 1:
            out_rows.append(r)
            continue

        # genuine multi-variant row -> split, ordered by (most sources first, then get_best_tokens priority)
        def sort_key(item):
            key, srcs = item
            best_priority = min(PRIORITY.index(s) for s in srcs if s in PRIORITY)
            return (-len(srcs), best_priority)

        ordered = sorted(groups.items(), key=sort_key)
        total = len(ordered)
        sibling_names = [f"{r['Raga Name']} {i+1}" for i in range(total)]

        for i, (key, srcs) in enumerate(ordered):
            n_split_rows += 1
            new_row = {fn: r.get(fn, "") for fn in fieldnames}
            new_row["Raga Name"] = f"{r['Raga Name']} {i+1}"
            for src in SOURCES + ["Karnatic Tutor"]:
                if src in srcs:
                    araw, vraw = group_data[key][src]
                    new_row[f"In {src}"] = "Y"
                    new_row[f"Aroha ({src})"] = araw
                    new_row[f"Avaroha ({src})"] = vraw
                else:
                    new_row[f"In {src}"] = "N"
                    new_row[f"Aroha ({src})"] = ""
                    new_row[f"Avaroha ({src})"] = ""
            new_row["Sources Agreeing Count"] = str(len(srcs))
            others = ", ".join(n for j, n in enumerate(sibling_names) if j != i)
            notes = [f"N - info: split from a {total}-way source disagreement under \"{r['Raga Name']}\" (mela {r['Melakarta Number']}); see also: {others}"]
            if len(srcs) == 1:
                notes.append(f"Y - single-source entry (only {next(iter(srcs))}); not corroborated by any other source in this database")
            new_row["Needs Review"] = " | ".join(notes)
            out_rows.append(new_row)
            split_log.append((r["Melakarta Number"], r["Raga Name"], new_row["Raga Name"], sorted(srcs), len(srcs)))

    print("janya rows examined (had any source data):", n_examined)
    print("rows split into multiple variants:", n_split_rows, "new rows, from", len({(m, n) for m, n, _, _, _ in split_log}), "original ragas")
    print("total output rows:", len(out_rows), "(was", len(rows), ")")

    with open(MASTER, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out_rows)

    json.dump(split_log, open(SPLIT_LOG_OUT, "w", encoding="utf-8"), indent=1)
    print("saved split log to", SPLIT_LOG_OUT)

if __name__ == "__main__":
    main()
