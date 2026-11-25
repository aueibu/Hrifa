"""Extract Raga Pravagam's Bibliography (ref-code -> source) and Synonyms
sections into supporting CSVs. Same personal-reference-only status as the
main table extraction - see docs/raga-pravagam-README.md.
"""
import json
import re
import csv

CACHE = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\raw-sources\raga-pravagam-page-cache.json"
BIB_OUT = r"C:\Data Files\Projects\Hrifa\raga-explorer\docs\raga-pravagam-bibliography.csv"
SYN_OUT = r"C:\Data Files\Projects\Hrifa\raga-explorer\docs\raga-pravagam-synonyms.csv"

pages = json.load(open(CACHE, encoding="utf-8"))
by_page = {p["page"]: p["plain"] for p in pages}

# ---- Bibliography: ref-code lines of the form "CODE. Title ... Author" ----
bib_line_re = re.compile(r"^([A-Z]{1,2}(?:-\d)?)\.\s*(.+)$")
bib_rows = []
pending = None  # (code, text-so-far) for entries wrapping onto a following line
for pg in range(312, 314):  # the bibliography proper - confirmed clean on these 2 pages
    text = by_page.get(pg, "")
    for ln in text.split("\n"):
        ln = ln.strip()
        if not ln or ln.upper() == "BIBLIOGRAPHY":
            continue
        m = bib_line_re.match(ln)
        if m and len(ln) < 90:
            if pending:
                bib_rows.append(pending)
            pending = [m.group(1), m.group(2)]
        elif pending and len(ln) < 60:
            pending[1] += " " + ln
if pending:
    bib_rows.append(pending)

with open(BIB_OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Ref Code", "Source"])
    for code, entry in bib_rows:
        w.writerow([code, re.sub(r"\s+", " ", entry).strip()])

print(f"Bibliography: {len(bib_rows)} entries -> {BIB_OUT}")

# ---- Synonyms: numbered items "NN. Name1-Name2, Name3 ..." (two columns per line, merged) ----
syn_start, syn_end = 283, 290
syn_text = ""
for pg in range(syn_start, syn_end + 1):
    syn_text += by_page.get(pg, "") + "\n"

# drop everything before the section title itself
idx = syn_text.upper().find("SYNONYMS OF KARNATAK RAGAS")
if idx != -1:
    syn_text = syn_text[idx + len("SYNONYMS OF KARNATAK RAGAS"):]

item_re = re.compile(r"(\d{1,3})\.\s*")
positions = [(m.start(1), m.group(1)) for m in item_re.finditer(syn_text)]
syn_rows = []
for i, (pos, num) in enumerate(positions):
    end = positions[i + 1][0] if i + 1 < len(positions) else len(syn_text)
    chunk = syn_text[pos:end]
    chunk = re.sub(r"^\d{1,3}\.\s*", "", chunk)
    chunk = re.sub(r"\s+", " ", chunk).strip(" -,.")
    if chunk:
        syn_rows.append((num, chunk))

with open(SYN_OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Item #", "Raw Text (name1-name2 style equivalence group)"])
    for num, chunk in syn_rows:
        w.writerow([num, chunk])

print(f"Synonyms: {len(syn_rows)} entries -> {SYN_OUT}")
