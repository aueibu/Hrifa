"""Merge the Nerur (Kumaran Santhanam) list into the master as a 6th source,
following the same melakarta-bucketed exact/fuzzy matching + ambiguity guard
used for the other sources.
"""
import csv, re, difflib, unicodedata
from collections import defaultdict

MASTER = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\master-carnatic-raga-database.csv"
NERUR = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\nerur-carnatic-raga-list.csv"

with open(MASTER, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    master_fields = reader.fieldnames
    master_rows = list(reader)

with open(NERUR, encoding="utf-8") as f:
    nerur_rows = list(csv.DictReader(f))

def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-zA-Z0-9]", "", s).lower()

new_fields = list(master_fields)
idx = new_fields.index("In Wikipedia") + 1
new_fields.insert(idx, "In Nerur")
idx2 = new_fields.index("Aroha (Wikipedia)") + 1
new_fields.insert(idx2, "Aroha (Nerur)")
idx3 = new_fields.index("Avaroha (Wikipedia)") + 1
new_fields.insert(idx3, "Avaroha (Nerur)")

for r in master_rows:
    r["In Nerur"] = "N/A" if r["Row Type"] == "Melakarta (base scale)" else "N"
    r["Aroha (Nerur)"] = ""
    r["Avaroha (Nerur)"] = ""

nerur_mela = {}
nerur_janya = defaultdict(list)
for r in nerur_rows:
    mnum = str(int(r["Melakarta Number"]))
    if r["Row Type"] == "Melakarta (base scale)":
        nerur_mela[mnum] = r
    else:
        nerur_janya[mnum].append(r)

def base_letters(s):
    toks = re.findall(r"[A-Za-z]+\d*", s)
    return [t.upper()[0] for t in toks if t]

# ---- base melakarta rows ----
base_mismatch = 0
for r in master_rows:
    if r["Row Type"] != "Melakarta (base scale)":
        continue
    mnum = str(int(r["Melakarta Number"]))
    nr = nerur_mela.get(mnum)
    if not nr:
        continue
    r["In Nerur"] = "Y"
    r["Aroha (Nerur)"] = nr["Aroha"]
    r["Avaroha (Nerur)"] = nr["Avaroha"]
    r["Sources Agreeing Count"] = str(int(r["Sources Agreeing Count"]) + 1)
    nerur_ar = [t.upper() for t in re.findall(r"[A-Za-z]+\d*", nr["Aroha"])]
    ml_ar = [t.upper() for t in re.findall(r"[A-Za-z]+\d*", r["Aroha (Musiclegato)"])]
    if nerur_ar != ml_ar:
        base_mismatch += 1
        note = f"Y - Nerur list scale for melakarta {mnum} differs from musiclegato/derived scale: {nr['Aroha']} vs {r['Aroha (Musiclegato)']}"
        r["Needs Review"] = note if r["Needs Review"] in ("N", "") else r["Needs Review"] + " | " + note
    mel_name_nerur = norm(nr["Melakarta Name"])
    mel_name_master = norm(r["Melakarta Name"])
    if mel_name_nerur != mel_name_master and difflib.SequenceMatcher(None, mel_name_nerur, mel_name_master).ratio() < 0.87:
        note = f"Y - Nerur list names melakarta {mnum} \"{nr['Melakarta Name']}\" vs master \"{r['Melakarta Name']}\""
        r["Needs Review"] = note if r["Needs Review"] in ("N", "") else r["Needs Review"] + " | " + note

print("Base melakarta mismatches vs Nerur:", base_mismatch)

# ---- janya rows ----
master_janya_buckets = defaultdict(list)
for r in master_rows:
    if r["Row Type"] == "Janya" and r["Melakarta Number"].strip().isdigit():
        mnum = str(int(r["Melakarta Number"]))
        master_janya_buckets[mnum].append(r)

matched_exact = matched_fuzzy = skipped_ambiguous = added_new = 0
new_rows = []
unverified_notes = []

for mnum, nlist in nerur_janya.items():
    bucket = master_janya_buckets.get(mnum, [])
    bucket_norm_pairs = [(br, norm(br["Raga Name"])) for br in bucket]
    mel_name_row = next((r for r in master_rows if r["Row Type"] == "Melakarta (base scale)" and str(int(r["Melakarta Number"])) == mnum), None)
    mel_name = mel_name_row["Melakarta Name"] if mel_name_row else ""

    for nr in nlist:
        rn = norm(nr["Raga Name"])
        exact_targets = [br for br, bnn in bucket_norm_pairs if bnn == rn]
        target = None
        if exact_targets:
            target = exact_targets[0]
            matched_exact += 1
        else:
            scored = sorted(
                ((difflib.SequenceMatcher(None, rn, bnn).ratio(), i, br) for i, (br, bnn) in enumerate(bucket_norm_pairs)),
                key=lambda x: x[0], reverse=True,
            )
            scored = [(rt, br) for rt, i, br in scored]
            if scored and scored[0][0] >= 0.87:
                top_ratio, top_br = scored[0]
                second_ratio = scored[1][0] if len(scored) > 1 else 0
                if top_ratio - second_ratio < 0.04 and second_ratio >= 0.80:
                    skipped_ambiguous += 1
                    contenders = ", ".join(f"\"{b['Raga Name']}\" ({round(rt,3)})" for rt, b in scored[:3] if rt >= 0.80)
                    row = {fn: "" for fn in new_fields}
                    row["Row Type"] = "Janya"
                    row["Melakarta Number"] = f"{int(mnum):02d}"
                    row["Melakarta Name"] = mel_name
                    row["Raga Name"] = nr["Raga Name"]
                    for src in ["Repo", "Musiclegato", "Royal Carpet", "Karnatic Tutor", "Wikipedia"]:
                        row[f"In {src}"] = "N"
                    row["In Nerur"] = "Y"
                    row["Aroha (Nerur)"] = nr["Aroha"]
                    row["Avaroha (Nerur)"] = nr["Avaroha"]
                    row["Sources Agreeing Count"] = "1"
                    note = f"Y - kept as separate entry: name is ambiguously close to existing bucket entries under melakarta {mnum} and could not be confidently auto-matched to one: {contenders}"
                    if nr.get("Unverified Parent (*)") == "Y":
                        note += " | source flags this raga's parent melakarta/scale as unverified (*)"
                    row["Needs Review"] = note
                    new_rows.append(row)
                    continue
                target = top_br
                matched_fuzzy += 1

        if target is not None:
            if target["In Nerur"] == "Y":
                note = f"Y - Nerur list has a second entry for \"{nr['Raga Name']}\" under melakarta {mnum}: {nr['Aroha']} / {nr['Avaroha']}"
                target["Needs Review"] = (target["Needs Review"] + " | " if target["Needs Review"] not in ("N", "") else "") + note
                continue
            target["In Nerur"] = "Y"
            target["Aroha (Nerur)"] = nr["Aroha"]
            target["Avaroha (Nerur)"] = nr["Avaroha"]
            target["Sources Agreeing Count"] = str(int(target["Sources Agreeing Count"]) + 1)
            nerur_letters = base_letters(nr["Aroha"])
            disagreements = []
            for src_label, col in [("Repo", "Aroha (Repo)"), ("Musiclegato", "Aroha (Musiclegato)"),
                                     ("Royal Carpet", "Aroha (Royal Carpet)"), ("Wikipedia", "Aroha (Wikipedia)")]:
                val = target.get(col, "")
                if val:
                    other = base_letters(val)
                    if other != nerur_letters:
                        disagreements.append(src_label)
            if disagreements:
                note = f"Y - Nerur note-sequence for \"{nr['Raga Name']}\" (mela {mnum}) differs from: {', '.join(disagreements)}"
                target["Needs Review"] = (target["Needs Review"] + " | " if target["Needs Review"] not in ("N", "") else "") + note
            if nr.get("Unverified Parent (*)") == "Y":
                note = f"Y - Nerur list flags \"{nr['Raga Name']}\"'s parent melakarta/scale as unverified (*)"
                target["Needs Review"] = (target["Needs Review"] + " | " if target["Needs Review"] not in ("N", "") else "") + note
                unverified_notes.append(nr["Raga Name"])
        else:
            added_new += 1
            row = {fn: "" for fn in new_fields}
            row["Row Type"] = "Janya"
            row["Melakarta Number"] = f"{int(mnum):02d}"
            row["Melakarta Name"] = mel_name
            row["Raga Name"] = nr["Raga Name"]
            for src in ["Repo", "Musiclegato", "Royal Carpet", "Karnatic Tutor", "Wikipedia"]:
                row[f"In {src}"] = "N"
            row["In Nerur"] = "Y"
            row["Aroha (Nerur)"] = nr["Aroha"]
            row["Avaroha (Nerur)"] = nr["Avaroha"]
            row["Sources Agreeing Count"] = "1"
            note = "N"
            if nr.get("Unverified Parent (*)") == "Y":
                note = f"Y - Nerur list flags \"{nr['Raga Name']}\"'s parent melakarta/scale as unverified (*)"
                unverified_notes.append(nr["Raga Name"])
            row["Needs Review"] = note
            new_rows.append(row)

print(f"Matched exact: {matched_exact}, fuzzy: {matched_fuzzy}, ambiguous-kept-separate: {skipped_ambiguous}, brand-new: {added_new}")
print(f"Unverified-parent flags carried over: {len(unverified_notes)}")

all_rows = master_rows + new_rows
print("Final row count:", len(all_rows))

with open(MASTER, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=new_fields)
    writer.writeheader()
    for r in all_rows:
        for fn in new_fields:
            r.setdefault(fn, "")
        writer.writerow(r)
print("Master rewritten with Nerur as 6th source.")
