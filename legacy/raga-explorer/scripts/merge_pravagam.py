# -*- coding: utf-8 -*-
"""Merge Raga Pravagam (docs/raga-pravagam-full-extraction.csv) into the master
database as a 7th source ("Pravagam"), facts-only (name, mela, aroha, avaroha -
no Ref codes or other book-specific editorial columns, per the copyright
decision in docs/raga-pravagam-README.md).

Matching, per raga (mela + normalized name), against every existing master
variant row under that name+mela:
  - bare-letter match found -> attach Pravagam as a corroborating source on
    that row (In Pravagam=Y, Aroha/Avaroha (Pravagam) populated, Sources
    Agreeing Count += 1).
  - name+mela matches but no variant's pattern agrees -> genuinely new
    variant; append as a new sibling row with the next available number,
    single-source (same "split disagreement into rows" policy used for the
    490 multi-source rows earlier in this project).
  - name matches only under a *different* mela -> add as a new row under
    Pravagam's own mela (a distinct scale identity, not a conflict), noting
    the name collision for cross-reference.
  - no name match at all -> add as a brand new janya row under Pravagam's
    mela.
"""
import csv, re, unicodedata
from collections import defaultdict

MASTER = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\master-carnatic-raga-database.csv"
PRAVAGAM = r"C:\Data Files\Projects\Hrifa\raga-explorer\docs\raga-pravagam-full-extraction.csv"

SOURCES = ["Repo", "Musiclegato", "Karnatic Tutor", "Royal Carpet", "Wikipedia", "Nerur"]

def norm_name(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    return re.sub(r"[^a-z]", "", s)

KT_SYL = [("sa", "S"), ("ri", "R"), ("ga", "G"), ("ma", "M"), ("pa", "P"), ("da", "D"), ("ni", "N")]

def bare_letters(s, is_karnatic_tutor=False):
    if not s:
        return ""
    if is_karnatic_tutor:
        t = s.lower().replace("[", "").replace("]", "").replace(".", "").replace("'", "").replace(",", " ")
        out, i = [], 0
        while i < len(t):
            matched = False
            for syl, letter in KT_SYL:
                if t[i:i+2] == syl:
                    out.append(letter)
                    i += 2
                    matched = True
                    break
            if not matched:
                i += 1
        return "".join(out)
    return re.sub(r"[^SRGMPDN]", "", s.upper())

def main():
    with open(MASTER, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    # insert Pravagam columns after Nerur, matching existing column grouping
    new_fields = []
    for fn in fieldnames:
        new_fields.append(fn)
    idx_in = new_fields.index("In Nerur") + 1
    new_fields.insert(idx_in, "In Pravagam")
    idx_ar = new_fields.index("Aroha (Nerur)") + 1
    new_fields.insert(idx_ar, "Aroha (Pravagam)")
    idx_av = new_fields.index("Avaroha (Nerur)") + 1
    new_fields.insert(idx_av, "Avaroha (Pravagam)")

    for r in rows:
        r["In Pravagam"] = "N/A" if r["Row Type"] == "Melakarta (base scale)" else "N"
        r["Aroha (Pravagam)"] = ""
        r["Avaroha (Pravagam)"] = ""

    # index master janya rows by (mela, normalized name) -> list of row refs
    by_mela_name = defaultdict(list)
    by_name_any_mela = defaultdict(list)
    for r in rows:
        if r["Row Type"] != "Janya":
            continue
        mela = str(int(r["Melakarta Number"])) if r["Melakarta Number"].strip().isdigit() else r["Melakarta Number"]
        key = norm_name(r["Raga Name"])
        by_mela_name[(mela, key)].append(r)
        by_name_any_mela[key].append(r)

    # find highest existing numeric suffix for a base name under a mela, so new
    # variants continue the sequence instead of colliding
    NUM_SUFFIX = re.compile(r"^(.*?)\s+(\d+)$")
    def base_and_num(name):
        m = NUM_SUFFIX.match(name.strip())
        if m:
            return m.group(1), int(m.group(2))
        return name.strip(), None

    with open(PRAVAGAM, encoding="utf-8") as f:
        prav_rows = list(csv.DictReader(f))

    n_attached = n_new_variant = n_mela_mismatch_new = n_brand_new = 0
    new_rows = []

    for pr in prav_rows:
        pname = pr["Raga Name"].strip()
        pkey = norm_name(pname)
        pmela = str(int(pr["Melakarta Number"])) if pr["Melakarta Number"].strip().isdigit() else pr["Melakarta Number"]
        p_aroha_raw = pr["Arohanam"]
        p_avaroha_raw = pr["Avarohanam"]
        p_aroha = bare_letters(p_aroha_raw)
        p_avaroha = bare_letters(p_avaroha_raw)

        same_mela_rows = by_mela_name.get((pmela, pkey), [])

        if same_mela_rows:
            # try to attach to an existing variant with a matching bare pattern
            attached = None
            for mrow in same_mela_rows:
                matched_here = False
                for src in SOURCES:
                    a_val, v_val = mrow.get(f"Aroha ({src})", ""), mrow.get(f"Avaroha ({src})", "")
                    if not a_val and not v_val:
                        continue
                    is_kt = (src == "Karnatic Tutor")
                    if bare_letters(a_val, is_kt) == p_aroha and bare_letters(v_val, is_kt) == p_avaroha:
                        matched_here = True
                        break
                if matched_here:
                    attached = mrow
                    break

            if attached is not None:
                if attached["In Pravagam"] != "Y":
                    attached["In Pravagam"] = "Y"
                    attached["Aroha (Pravagam)"] = p_aroha_raw
                    attached["Avaroha (Pravagam)"] = p_avaroha_raw
                    attached["Sources Agreeing Count"] = str(int(attached["Sources Agreeing Count"] or 0) + 1)
                    n_attached += 1
                # else: already attached to this exact variant by an earlier Pravagam row - skip duplicate
                continue

            # name+mela matches but no variant agrees -> new sibling variant, numbered to continue the sequence
            existing_names = {r["Raga Name"] for r in same_mela_rows}
            bases_nums = [base_and_num(n) for n in existing_names]
            base = bases_nums[0][0]
            next_num = max((n for _, n in bases_nums if n is not None), default=1) + 1
            new_name = f"{base} {next_num}"
            new_row = {fn: "" for fn in new_fields}
            new_row["Row Type"] = "Janya"
            new_row["Melakarta Number"] = same_mela_rows[0]["Melakarta Number"]
            new_row["Melakarta Name"] = same_mela_rows[0]["Melakarta Name"]
            new_row["Raga Name"] = new_name
            for src in SOURCES:
                new_row[f"In {src}"] = "N"
            new_row["In Pravagam"] = "Y"
            new_row["Aroha (Pravagam)"] = p_aroha_raw
            new_row["Avaroha (Pravagam)"] = p_avaroha_raw
            new_row["Sources Agreeing Count"] = "1"
            new_row["Needs Review"] = (
                f"N - info: new variant added from Raga Pravagam under \"{base}\" (mela {new_row['Melakarta Number']}); "
                f"did not match any existing variant ({', '.join(sorted(existing_names))}) | "
                f"Y - single-source entry (only Pravagam); not corroborated by any other source in this database"
            )
            new_rows.append(new_row)
            by_mela_name[(pmela, pkey)].append(new_row)
            n_new_variant += 1
            continue

        # no same-mela match - check for a name match under a different mela
        other_mela_rows = by_name_any_mela.get(pkey, [])
        new_row = {fn: "" for fn in new_fields}
        new_row["Row Type"] = "Janya"
        new_row["Melakarta Number"] = pr["Melakarta Number"]
        new_row["Melakarta Name"] = pr["Melakarta Name"]
        new_row["Raga Name"] = pname
        for src in SOURCES:
            new_row[f"In {src}"] = "N"
        new_row["In Pravagam"] = "Y"
        new_row["Aroha (Pravagam)"] = p_aroha_raw
        new_row["Avaroha (Pravagam)"] = p_avaroha_raw
        new_row["Sources Agreeing Count"] = "1"

        if other_mela_rows:
            other_melas = sorted(set(r["Melakarta Number"] for r in other_mela_rows))
            new_row["Needs Review"] = (
                f"Y - name collision: Raga Pravagam lists \"{pname}\" under mela {pr['Melakarta Number']}, "
                f"but the master database already has this name under mela {', '.join(other_melas)} - likely a "
                f"distinct raga that happens to share a name, kept as a separate entry | "
                f"Y - single-source entry (only Pravagam); not corroborated by any other source in this database"
            )
            n_mela_mismatch_new += 1
        else:
            new_row["Needs Review"] = (
                "N - info: new raga added from Raga Pravagam, not present in any other source in this database | "
                "Y - single-source entry (only Pravagam); not corroborated by any other source in this database"
            )
            n_brand_new += 1

        new_rows.append(new_row)
        by_mela_name[(pmela, pkey)].append(new_row)
        by_name_any_mela[pkey].append(new_row)

    all_rows = rows + new_rows

    print("attached to an existing variant:", n_attached)
    print("new sibling variant (same name+mela, new pattern):", n_new_variant)
    print("new row, name collision under a different mela:", n_mela_mismatch_new)
    print("brand new raga (no name match anywhere):", n_brand_new)
    print("total Pravagam rows processed:", len(prav_rows))
    print("total master rows:", len(rows), "->", len(all_rows))

    with open(MASTER, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=new_fields)
        w.writeheader()
        w.writerows(all_rows)

if __name__ == "__main__":
    main()
