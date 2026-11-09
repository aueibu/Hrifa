"""Extract the Kumaran Santhanam "List of Carnatic Ragas" (nerur.com, v1.14,
mirrored on carnatic.com by Kishore Balakrishnan) into a standalone CSV.

Source layout inside the <pre> block:
  - 72 melakartha lines: "NN | name | aroha | avaroha"
  - a short raga-equivalencies section
  - janya lines grouped under "NN | melakartha_name" headers:
        "name  |NN| aroha | avaroha"
  - a janya-name -> melakartha index (redundant with the grouped section,
    used here only as a cross-check)

Variety numerals (R/G/M/D/N 1-3) already match this project's S/R1/G2/M1/...
convention directly, so no re-notation is needed - just cleanup of the
source's own transliteration quirks (apostrophes for n'/N', stray commas
used as phrase separators, doubled/typo'd tokens) and unicode normalization.
"""
import csv
import re

SRC = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\raw-sources\nerur-carnatic-raga-list.html"
OUT = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\nerur-carnatic-raga-list.csv"

content = open(SRC, encoding="utf-8", errors="replace").read()

pre_match = re.search(r"<pre>(.*?)</pre>", content, re.S)
assert pre_match
text = pre_match.group(1)
import html as htmlmod
text = htmlmod.unescape(text)
lines = text.split("\n")

def clean_scale(s):
    s = s.strip()
    s = s.replace(",", " ")          # phrase-separator commas in some avarohanams
    s = re.sub(r"\s+", " ", s)
    return s.strip()

# ---- 1. melakartha table ----
mela_re = re.compile(r"^\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$")
melas = {}   # num -> (name, aroha, avaroha)
rows = []

in_mela_section = False
for ln in lines:
    if "mElakartha rAgAs" in ln:
        in_mela_section = True
        continue
    if in_mela_section and ln.strip().startswith("---") and melas:
        in_mela_section = False
        continue
    if in_mela_section:
        m = mela_re.match(ln)
        if m:
            num = int(m.group(1))
            name = m.group(2).strip()
            aroha = clean_scale(m.group(3))
            avaroha = clean_scale(m.group(4))
            melas[num] = (name, aroha, avaroha)
            rows.append({
                "Row Type": "Melakarta (base scale)",
                "Melakarta Number": f"{num:02d}",
                "Melakarta Name": name,
                "Raga Name": name,
                "Aroha": aroha,
                "Avaroha": avaroha,
            })
assert len(melas) == 72, f"expected 72 melakarthas, got {len(melas)}"

# ---- 2. raga equivalencies (informational, kept as a side artifact) ----
equivalencies = []
eq_start = text.find("rAgA equivalencies")
janya_hdr = text.find("janya rAgAs\n")
if eq_start != -1 and janya_hdr != -1:
    eq_block = text[eq_start:janya_hdr]
    for ln in eq_block.split("\n"):
        m = re.match(r"^\s*(\S.*?)\s{2,}=\s*(\S.*?)\s*$", ln)
        if m:
            equivalencies.append((m.group(1).strip(), m.group(2).strip()))

# ---- 3. janya raga listing, grouped under "NN | mela_name" headers ----
janya_start = text.find("janya rAgAs\n")
index_start = text.find("janya rAgA index")
assert janya_start != -1 and index_start != -1
janya_block = text[janya_start:index_start]

group_hdr_re = re.compile(r"^\s*(\d{1,2})\s*\|\s*(.+?)\s*$")
# "name |NN| aroha | avaroha" - name may contain internal spaces/parens, pipes are the anchor
janya_re = re.compile(r"^(.{1,30}?)\s*\|\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$")

current_mela = None
janya_rows = []
unparsed = []
for ln in janya_block.split("\n"):
    if not ln.strip():
        continue
    if ln.strip().startswith("---"):
        continue
    if "janya rAgAs" in ln:
        continue
    hm = group_hdr_re.match(ln)
    jm = janya_re.match(ln)
    if jm:
        name = jm.group(1).strip()
        mnum = int(jm.group(2))
        aroha = clean_scale(jm.group(3))
        avaroha = clean_scale(jm.group(4))
        unverified = name.rstrip().endswith("*")
        name = name.rstrip("* ").strip()
        janya_rows.append({
            "Row Type": "Janya",
            "Melakarta Number": f"{mnum:02d}",
            "Melakarta Name": melas.get(mnum, ("",))[0],
            "Raga Name": name,
            "Aroha": aroha,
            "Avaroha": avaroha,
            "Unverified Parent (*)": "Y" if unverified else "N",
        })
    elif hm:
        current_mela = int(hm.group(1))
    else:
        unparsed.append(ln)

print(f"Melakarthas: {len(melas)}")
print(f"Janya rows parsed: {len(janya_rows)}")
print(f"Equivalencies parsed: {len(equivalencies)}")
if unparsed:
    print(f"Unparsed lines in janya block ({len(unparsed)}):")
    for ln in unparsed:
        print("  ", repr(ln))

rows.extend(janya_rows)

fields = ["Row Type", "Melakarta Number", "Melakarta Name", "Raga Name", "Aroha", "Avaroha", "Unverified Parent (*)"]
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    for r in rows:
        for fn in fields:
            r.setdefault(fn, "")
        w.writerow(r)

print("Wrote", OUT)

if equivalencies:
    EQ_OUT = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\nerur-raga-equivalencies.csv"
    with open(EQ_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Raga Name", "Equivalent To"])
        w.writerows(equivalencies)
    print("Wrote", EQ_OUT)
