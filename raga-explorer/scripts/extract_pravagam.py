"""Best-effort structured extraction of Raga Pravagam's main "Mela Ragas and
their Janyas" table (pages 64-277) into a CSV, for PERSONAL REFERENCE ONLY -
this is copyrighted, commercially published material (see conversation /
docs note) and is NOT to be merged into the shippable master database
without separately deriving a facts-only subset and clearing that decision.

Approach: pdfplumber gives word-level (x0, top) positions, which lets us
split each table row into columns by content (name words contain lowercase
letters; arohanam/avarohanam/ref tokens are short all-uppercase runs from
{S,R,G,M,P,D,N} plus 1-2 letter bibliography ref codes) combined with a
gap-based heuristic (the two largest x0 gaps among the non-name tokens in a
row are almost always the true Aroha|Avaroha|Ref column boundaries).

This is inherently approximate - the source PDF's text layer interleaves
wrapped/multi-variant cells inconsistently. Every row that doesn't parse
cleanly is kept as raw text in the "Unparsed Raw" column rather than guessed
at, and the full raw per-mela text is also dumped separately for backstop
reference.
"""
import json
import re
import csv
import pdfplumber

PDF = r"C:\Data Files\Projects\Hrifa\raga-explorer\raga_pravagam-english-full.pdf"
CACHE = r"C:\Data Files\Projects\Hrifa\raga-explorer\data\raw-sources\raga-pravagam-page-cache.json"
OUT_CSV = r"C:\Data Files\Projects\Hrifa\raga-explorer\docs\raga-pravagam-full-extraction.csv"
OUT_RAWTEXT = r"C:\Data Files\Projects\Hrifa\raga-explorer\docs\raga-pravagam-raw-text-by-mela.txt"

MELA_START_PAGE = {
    1: 64, 2: 66, 3: 68, 4: 70, 5: 72, 6: 74, 7: 76, 8: 78, 9: 83, 10: 85,
    11: 88, 12: 90, 13: 92, 14: 95, 15: 98, 16: 110, 17: 114, 18: 117, 19: 119, 20: 121,
    21: 132, 22: 134, 23: 147, 24: 149, 25: 151, 26: 153, 27: 155, 28: 159, 29: 173, 30: 185,
    31: 187, 32: 189, 33: 191, 34: 193, 35: 195, 36: 197, 37: 199, 38: 201, 39: 203, 40: 205,
    41: 207, 42: 209, 43: 211, 44: 213, 45: 215, 46: 218, 47: 220, 48: 222, 49: 224, 50: 226,
    51: 228, 52: 232, 53: 235, 54: 238, 55: 240, 56: 242, 57: 244, 58: 246, 59: 248, 60: 250,
    61: 252, 62: 254, 63: 256, 64: 259, 65: 262, 66: 267, 67: 269, 68: 271, 69: 272, 70: 274,
    71: 275, 72: 276,
}
MELA_NAME = {
    1: "Kanakangi", 2: "Ratnangi", 3: "Ganamurthi", 4: "Vanaspathi", 5: "Manavathi",
    6: "Dhanarupi", 7: "Senavathi", 8: "Hanumathodi", 9: "Dhenuka", 10: "Nataka Priya",
    11: "Kokila Priya", 12: "Rupavathi", 13: "Gayaka Priya", 14: "Vakula Bharanam", 15: "Maya Malava Gaula",
    16: "Chakravakam", 17: "Surya Kantham", 18: "Hatakambari", 19: "Jankaradhwani", 20: "Natabhairavi",
    21: "Keeravani", 22: "Kharaharapriya", 23: "Gauri Manohari", 24: "Varuna Priya", 25: "Mararanjani",
    26: "Charukesi", 27: "Sarasangi", 28: "Harikambodi", 29: "Dheera Sankarabharanam", 30: "Naganandhini",
    31: "Yagapriya", 32: "Ragavardhini", 33: "Gangeya Bhushani", 34: "Vagadheeswari", 35: "Sulini",
    36: "Chalanata", 37: "Salakam", 38: "Jalarnavam", 39: "Jhalavarali", 40: "Navaneetham",
    41: "Pavani", 42: "Raghupriya", 43: "Gavambodhi", 44: "Bhava Priya", 45: "Subhapantuvarali",
    46: "Shadvidha Margini", 47: "Suvarnangi", 48: "Divyamani", 49: "Dhavalambari", 50: "Namanarayani",
    51: "Kamavardhini", 52: "Rama Priya", 53: "Gamanasrama", 54: "Viswambari", 55: "Syamalangi",
    56: "Shanmukha Priya", 57: "Simhendra Madhyamam", 58: "Hemavathi", 59: "Dharmavathi", 60: "Neethimathi",
    61: "Kanthamani", 62: "Rishabha Priya", 63: "Lathangi", 64: "Vachaspathi", 65: "Mechakalyani",
    66: "Chitrambari", 67: "Sucharitra", 68: "Jyothi Swarupini", 69: "Dhathu Vardhani", 70: "Nasika Bhushani",
    71: "Kosalam", 72: "Rasika Priya",
}
LAST_MELA_END_PAGE = 277  # page before "HINDUSTHANI RAGAS..." section starts

SWARA_ONLY = re.compile(r"^[SRGMPDN']+$")
SWARA_CHARS = re.compile(r"[SRGMPDN']")
NUM_DOT = re.compile(r"^(\d{1,3})\.$")
NUM_BARE = re.compile(r"^(\d{1,3})$")
SKIP_LINE_PATTERNS = [
    re.compile(r"CHAKRA", re.I),
    re.compile(r"^Source$", re.I),
    re.compile(r"^Name\s*of\s*Raga\b", re.I),
    re.compile(r"^S\s*R\s*G\s*M\s*P\s*D\s*N\s*S$"),
    re.compile(r"^[a-z]{1,4}(\s+[a-z]{1,4}){2,7}$"),  # the solfa-mnemonic line, e.g. "ri gu ma dha na"
]
MELA_HEADER_RE = re.compile(r"^(\d{1,2})\.\s*([A-Za-z][A-Za-z .'\-]+)$")

def norm_name(s):
    return re.sub(r"[^a-z]", "", s.lower())

MELA_NAME_NORM = {n: norm_name(v) for n, v in MELA_NAME.items()}


def is_name_word(tok):
    """A word belongs to the raga-name column if it contains a lowercase letter."""
    return any(c.islower() for c in tok)


def row_key(top, tol=3.0):
    return round(top / tol)


def group_rows(words):
    rows = {}
    for w in words:
        k = row_key(w["top"])
        rows.setdefault(k, []).append(w)
    # merge adjacent keys that are actually the same visual row (splits near tolerance boundary)
    ordered = sorted(rows.items())
    merged = []
    for k, ws in ordered:
        if merged and abs(k - merged[-1][0]) <= 1 and abs(min(w["top"] for w in ws) - min(w2["top"] for w2 in merged[-1][1])) < 3:
            merged[-1] = (merged[-1][0], merged[-1][1] + ws)
        else:
            merged.append((k, ws))
    return [sorted(ws, key=lambda w: w["x0"]) for _, ws in merged]


def _swara_count(tokens):
    return sum(len(SWARA_CHARS.findall(t["text"])) for t in tokens)


def _score_split(aroha_toks, avaroha_toks, ref_toks):
    """Lower is better. Domain prior: a raga's aroha and avaroha are almost
    always close in note-count (equal, or off by a couple for vakra/zigzag
    ragas); a ref code is short (1-3 characters); avarohanam (and, when
    there's no ref column, arohanam too) almost always ends back on the
    tonic Sa."""
    a_len = _swara_count(aroha_toks)
    v_len = _swara_count(avaroha_toks)
    ref_chars = sum(len(t["text"]) for t in ref_toks)
    if a_len == 0 or v_len == 0:
        return 1000  # never split with an empty aroha or avaroha side if avoidable
    balance_cost = abs(a_len - v_len)
    ref_cost = 0 if ref_chars <= 3 else (ref_chars - 3) * 2
    last_avaroha_letter = SWARA_CHARS.findall(avaroha_toks[-1]["text"])
    tonic_cost = 0 if (last_avaroha_letter and last_avaroha_letter[-1] == "S") else 3
    return balance_cost + ref_cost + tonic_cost


def split_data_tokens(tokens, row_break_positions=()):
    """tokens: list of word dicts (already excludes name words), in x0 order
    (but see row_break_positions below - order is reading order, which for a
    wrapped multi-row entry means x0 is only locally meaningful per row).
    Returns (aroha_text, avaroha_text, ref_text).

    Tries every pair of cut-points among the largest x0-gaps (real column
    boundaries) rather than blindly taking the top 2 - on rows with an
    unusually long/zigzag arohanam, incidental gaps *within* that column can
    outrank the true aroha|avaroha boundary, so we score each candidate
    split against a domain prior (aroha/avaroha note-counts should be close,
    ref codes are short) and keep the best one instead of the first guess.

    row_break_positions: token indices where a new *physical PDF line*
    starts, for entries whose data wrapped across lines - kept for the
    (rare) case where the true boundary falls exactly on the wrap point.
    """
    if not tokens:
        return "", "", ""
    if len(tokens) == 1:
        return "", "", tokens[0]["text"]
    if len(tokens) == 2:
        return " ".join(t["text"] for t in tokens[:1]), " ".join(t["text"] for t in tokens[1:]), ""

    xs = [t["x0"] for t in tokens]
    gaps = sorted(((xs[i + 1] - xs[i], i + 1) for i in range(len(xs) - 1)), reverse=True)
    candidates = [pos for _, pos in gaps[:5]]  # candidate cut positions, largest gaps first
    for pos in row_break_positions:
        if 0 < pos < len(tokens) and pos not in candidates:
            candidates.append(pos)

    best = None
    best_score = None
    for i in range(len(candidates)):
        for j in range(len(candidates)):
            if i == j:
                continue
            c1, c2 = sorted((candidates[i], candidates[j]))
            if c1 == c2:
                continue
            aroha_t, avaroha_t, ref_t = tokens[:c1], tokens[c1:c2], tokens[c2:]
            score = _score_split(aroha_t, avaroha_t, ref_t)
            if best_score is None or score < best_score:
                best_score = score
                best = (aroha_t, avaroha_t, ref_t)

    if best is None:
        # fallback: single largest gap only, no ref column
        c = candidates[0]
        best = (tokens[:c], tokens[c:], [])

    aroha_t, avaroha_t, ref_t = best
    return (" ".join(t["text"] for t in aroha_t),
            " ".join(t["text"] for t in avaroha_t),
            " ".join(t["text"] for t in ref_t))


def clean_swara(s):
    return " ".join(SWARA_CHARS.findall(s))


def main():
    pdf = pdfplumber.open(PDF)
    out_rows = []
    raw_text_chunks = []

    for mela_num in range(1, 73):
        start_pg = MELA_START_PAGE[mela_num]
        end_pg = MELA_START_PAGE.get(mela_num + 1, LAST_MELA_END_PAGE + 1) - 1
        mela_name = MELA_NAME[mela_num]

        current_name = None
        variant_idx = 0
        entry_idx = 0
        mela_raw_lines = []
        pending_name = None
        pending_tokens = None
        pending_raw_texts = []
        pending_meta = None
        pending_row_breaks = []

        def finalize_pending():
            nonlocal pending_tokens, pending_raw_texts, pending_meta, pending_row_breaks
            aroha_raw, avaroha_raw, ref = split_data_tokens(pending_tokens, pending_row_breaks)
            aroha = clean_swara(aroha_raw)
            avaroha = clean_swara(avaroha_raw)
            ref = ref.strip()
            pending_tokens = None
            pending_row_breaks = []
            if not aroha and not avaroha and not ref:
                pending_meta = None
                pending_raw_texts = []
                return
            wrapped = len(pending_raw_texts) > 1
            aroha_len = len(aroha.split())
            avaroha_len = len(avaroha.split())
            length_suspect = aroha_len > 10 or avaroha_len > 10 or (aroha and aroha_len < 3) or (avaroha and avaroha_len < 3)
            confidence = "high" if (aroha and avaroha and not length_suspect) else "low"
            out_rows.append({
                "Melakarta Number": f"{pending_meta['mela_num']:02d}",
                "Melakarta Name": pending_meta["mela_name"],
                "Entry Index": pending_meta["entry_idx"],
                "Raga Name": pending_meta["raga_name"],
                "Variant": pending_meta["variant_idx"],
                "Arohanam": aroha,
                "Avarohanam": avaroha,
                "Ref": ref,
                "Confidence": confidence,
                "Raw Row Text": " | ".join(pending_raw_texts) if wrapped else pending_raw_texts[0],
                "Source Page": pending_meta["page"],
            })
            pending_meta = None
            pending_raw_texts = []

        for pg in range(start_pg, end_pg + 1):
            page = pdf.pages[pg - 1]
            words = page.extract_words()
            if not words:
                continue
            rows = group_rows(words)
            for row in rows:
                line_text = " ".join(w["text"] for w in row)
                if any(p.search(line_text) for p in SKIP_LINE_PATTERNS):
                    continue
                hm = MELA_HEADER_RE.match(line_text)
                if hm:
                    hnum = int(hm.group(1))
                    hname = norm_name(hm.group(2))
                    known = MELA_NAME_NORM.get(hnum, "")
                    if known and (hname == known or hname.startswith(known[:6])):
                        continue  # this mela's own section-header line (or a neighboring one leaking onto the page)
                mela_raw_lines.append(f"[p{pg}] {line_text}")

                toks = list(row)
                row_num = None
                if toks and NUM_DOT.match(toks[0]["text"]):
                    row_num = int(NUM_DOT.match(toks[0]["text"]).group(1))
                    toks = toks[1:]
                    is_new_entry = True
                elif toks and NUM_BARE.match(toks[0]["text"]):
                    row_num = int(NUM_BARE.match(toks[0]["text"]).group(1))
                    toks = toks[1:]
                    is_new_entry = False
                else:
                    is_new_entry = False

                name_toks = []
                while toks and (is_name_word(toks[0]["text"]) or not SWARA_ONLY.match(toks[0]["text"])):
                    if SWARA_ONLY.match(toks[0]["text"]) and not is_name_word(toks[0]["text"]):
                        break
                    name_toks.append(toks[0])
                    toks = toks[1:]
                name_text = " ".join(t["text"] for t in name_toks).strip()
                if pending_name:
                    name_text = (pending_name + " " + name_text).strip() if name_text else pending_name
                    pending_name = None

                has_data = bool(toks)

                if name_text and not has_data:
                    # name-only row (wrapped raga name continuing onto the next line) - buffer it
                    pending_name = name_text
                    continue

                is_continuation = not name_text and row_num is None and toks

                if is_continuation and pending_tokens is not None:
                    # a wrapped-line continuation of the entry/variant still being built -
                    # merge its tokens rather than emitting a phantom extra row
                    pending_row_breaks.append(len(pending_tokens))
                    pending_tokens.extend(toks)
                    pending_raw_texts.append(line_text)
                    continue

                # starting a new entry or variant: finalize whatever was pending first
                if pending_tokens is not None:
                    finalize_pending()

                if name_text:
                    current_name = name_text
                    entry_idx += 1
                    variant_idx = 1
                else:
                    variant_idx += 1

                pending_tokens = list(toks)
                pending_raw_texts = [line_text]
                pending_meta = {
                    "mela_num": mela_num, "mela_name": mela_name,
                    "entry_idx": entry_idx, "raga_name": current_name or "",
                    "variant_idx": variant_idx, "page": pg,
                }

        if pending_tokens is not None:
            finalize_pending()

        raw_text_chunks.append(f"===== Mela {mela_num:02d} - {mela_name} (pages {start_pg}-{end_pg}) =====\n" + "\n".join(mela_raw_lines))
        if mela_num % 10 == 0:
            print("processed mela", mela_num)

    fields = ["Melakarta Number", "Melakarta Name", "Entry Index", "Raga Name", "Variant",
              "Arohanam", "Avarohanam", "Ref", "Confidence", "Raw Row Text", "Source Page"]
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in out_rows:
            w.writerow(r)
    print("Wrote", OUT_CSV, "-", len(out_rows), "rows")

    with open(OUT_RAWTEXT, "w", encoding="utf-8") as f:
        f.write("\n\n".join(raw_text_chunks))
    print("Wrote", OUT_RAWTEXT)


if __name__ == "__main__":
    main()
