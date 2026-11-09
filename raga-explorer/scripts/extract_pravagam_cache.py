"""Cache Raga Pravagam PDF page text (both plain and layout-mode extraction)
to a local JSON file so downstream parsing scripts don't have to re-run
pypdf's slow extraction on all 313 pages every time.
"""
import json
import pypdf

SRC = r"C:\Data Files\Projects\Hrifa\raga-explorer\raga_pravagam-english-full.pdf"
OUT = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\raw-sources\raga-pravagam-page-cache.json"

r = pypdf.PdfReader(SRC)
n = len(r.pages)
print("pages:", n)

pages = []
for i in range(n):
    p = r.pages[i]
    plain = p.extract_text()
    pages.append({"page": i + 1, "plain": plain})
    if (i + 1) % 25 == 0:
        print("extracted", i + 1)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(pages, f, ensure_ascii=False)

print("Wrote", OUT)
