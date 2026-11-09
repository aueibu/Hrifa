import csv, re

MASTER = r'C:\Data Files\Projects\Hrifa\raga-explorer\data\master-carnatic-raga-database.csv'
OUT = r'C:\Data Files\Projects\Hrifa\raga-explorer\data\ragas-with-scale-ids.csv'

with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)

# ---- semitone map for variety-tagged tokens (standard 72-melakarta equivalences) ----
SEMITONE = {
    'S': 0,
    'R1': 1, 'R2': 2, 'R3': 3,
    'G1': 2, 'G2': 3, 'G3': 4,
    'M1': 5, 'M2': 6,
    'P': 7,
    'D1': 8, 'D2': 9, 'D3': 10,
    'N1': 9, 'N2': 10, 'N3': 11,
}

def compute_mela_varieties(mela_num):
    """Return dict letter->variety digit for R,G,M,D,N for a given melakarta (1-72)."""
    idx = mela_num - 1
    ma_group = idx // 36           # 0 -> M1, 1 -> M2
    within = idx % 36
    rg = within // 6               # 0..5 selects R/G combo
    dn = within % 6                # 0..5 selects D/N combo
    rg_map = {0:('R1','G1'), 1:('R1','G2'), 2:('R1','G3'), 3:('R2','G2'), 4:('R2','G3'), 5:('R3','G3')}
    dn_map = {0:('D1','N1'), 1:('D1','N2'), 2:('D1','N3'), 3:('D2','N2'), 4:('D2','N3'), 5:('D3','N3')}
    r, g = rg_map[rg]
    d, n = dn_map[dn]
    m = 'M1' if ma_group == 0 else 'M2'
    return {'R': r, 'G': g, 'M': m, 'D': d, 'N': n, 'S': 'S', 'P': 'P'}

MELA_VARIETIES = {n: compute_mela_varieties(n) for n in range(1, 73)}

def tokenize_variety_format(s):
    """Tokens like 'S R2 G3 M1 P D2 N3 S' -> list of (letter, digit_or_None) preserving order."""
    toks = re.findall(r"[A-Za-z]+\d*", s)
    out = []
    for t in toks:
        t = t.strip("'")
        if not t:
            continue
        m = re.match(r'^([A-Za-z])(\d?)$', t)
        if not m:
            continue
        letter, digit = m.group(1).upper(), m.group(2)
        out.append((letter, digit if digit else None))
    return out

def tokenize_syllable_format(s):
    """Carnatic-pasted concatenated syllables e.g. 'SaRiGaMaPaDaNiSA' -> list of (letter, None)"""
    stoks = re.findall(r'Sa|Ri|Ga|Ma|Pa|Da|Dha|Ni|SA|S(?![a-z])', s)
    return [(t[0].upper(), None) for t in stoks if t]

def resolve_semitones(tokens, mela_num, review_flags):
    """tokens: list of (letter, digit_or_None). Returns list of semitone ints (None entries dropped, flagged)."""
    varieties = MELA_VARIETIES.get(mela_num) if mela_num else None
    semis = []
    for letter, digit in tokens:
        if letter in ('S', 'P'):
            semis.append(0 if letter == 'S' else 7)
            continue
        if letter not in ('R', 'G', 'M', 'D', 'N'):
            review_flags.append(f"unrecognized token letter '{letter}'")
            continue
        if digit:
            key = letter + digit
            if key not in SEMITONE:
                review_flags.append(f"unrecognized variety token '{key}'")
                continue
            semis.append(SEMITONE[key])
        else:
            # bare letter - need melakarta-implied variety
            if varieties is None:
                review_flags.append(f"bare '{letter}' with no valid melakarta parent to infer variety - semitone unresolved")
                continue
            variety_token = varieties[letter]  # e.g. 'R2'
            semis.append(SEMITONE[variety_token])
    return semis

def get_best_tokens(row):
    """Returns (aroha_tokens, avaroha_tokens, source_used) preferring variety-bearing sources.
    Pravagam is checked first: a verified resource in its own right, even though (like a bare
    melakarta-implied token) it carries no explicit R/G/D/N variety digit of its own."""
    for src in ['Pravagam', 'Musiclegato', 'Nerur', 'Wikipedia', 'Repo', 'Royal Carpet']:
        a = row.get(f'Aroha ({src})')
        d = row.get(f'Avaroha ({src})')
        if a and d:
            return tokenize_variety_format(a), tokenize_variety_format(d), src
    a = row.get('Aroha (Karnatic Tutor)')
    d = row.get('Avaroha (Karnatic Tutor)')
    if a and d:
        return tokenize_syllable_format(a), tokenize_syllable_format(d), 'Karnatic Tutor'
    return None, None, None

def bits_from_semitones(semis):
    b = 0
    for s in semis:
        b |= (1 << s)
    return b

def bits_to_binstr(b):
    # musical reading order: leftmost = Sa (bit 0), rightmost = N3 (bit 11)
    return ''.join(str((b >> i) & 1) for i in range(12))

def is_vakra(semis, ascending):
    """Detect non-monotonic movement. semis: sequence in melodic order.
    The closing return to Sa (tonic, semitone 0) at the very end of an ascending
    phrase is the normal octave completion, not a backward step, so it's excluded
    from the check."""
    seq = list(semis)
    if ascending and len(seq) > 1 and seq[-1] == 0:
        # closing return to the upper tonic (S') at end of ascent - normal octave completion
        seq = seq[:-1]
    if not ascending and len(seq) > 1 and seq[0] == 0:
        # descent starts from the upper tonic (S'), which sits an octave above everything else
        seq = [12] + seq[1:]
    if len(seq) < 2:
        return False
    prev = None
    for s in seq:
        if prev is not None:
            if ascending:
                if s < prev:
                    return True
            else:
                if s > prev:
                    return True
        prev = s
    return False

def melodic_order_semis(semis, ascending):
    """Same octave-completion normalization as is_vakra, used so the checksum's
    order-suffix reflects real melodic movement, not the raw closing-tonic restatement."""
    seq = list(semis)
    if ascending and len(seq) > 1 and seq[-1] == 0:
        seq = seq[:-1]
    if not ascending and len(seq) > 1 and seq[0] == 0:
        seq = [12] + seq[1:]
    return seq

def raga_checksum(ar_bits, av_bits, vakra, ar_semis, av_semis):
    """aroha_bits + avaroha_bits + vakra flag; if vakra, append the actual melodic
    order (semitone index sequence) for both aroha and avaroha, so two entries that
    share a note-set AND a vakra flag but move through it differently still get
    distinct checksums."""
    parts = [ar_bits, av_bits, 'Y' if vakra else 'N']
    if vakra:
        ar_order = '-'.join(str(s) for s in melodic_order_semis(ar_semis, True))
        av_order = '-'.join(str(s) for s in melodic_order_semis(av_semis, False))
        parts.append('A:' + ar_order)
        parts.append('D:' + av_order)
    return '|'.join(parts)

out_rows = []
mismatch_with_derived = 0
unresolved_count = 0

for r in rows:
    review = []
    mela_str = r['Melakarta Number'].strip()
    mela_num = int(mela_str) if mela_str.isdigit() else None

    ar_tokens, av_tokens, src_used = get_best_tokens(r)
    if ar_tokens is None:
        out_rows.append({**r, 'Aroha Bits (binary)': '', 'Aroha Bits (int)': '', 'Avaroha Bits (binary)': '', 'Avaroha Bits (int)': '',
                          'Vakra': '', 'Scale Source Used': '', 'Scale ID Review': 'Y - no usable aroha/avaroha string found'})
        unresolved_count += 1
        continue

    ar_semis_raw = resolve_semitones(ar_tokens, mela_num, review)
    av_semis_raw = resolve_semitones(av_tokens, mela_num, review)

    ar_bits = bits_from_semitones(ar_semis_raw) | 1  # ensure Sa bit set
    av_bits = bits_from_semitones(av_semis_raw) | 1

    vakra = is_vakra(ar_semis_raw, ascending=True) or is_vakra(av_semis_raw, ascending=False)

    review_note = '; '.join(sorted(set(review))) if review else ''
    if review_note:
        unresolved_count += 1

    checksum = raga_checksum(bits_to_binstr(ar_bits), bits_to_binstr(av_bits), vakra, ar_semis_raw, av_semis_raw)

    out_rows.append({
        **r,
        'Aroha Bits (binary)': bits_to_binstr(ar_bits),
        'Aroha Bits (int)': str(ar_bits),
        'Avaroha Bits (binary)': bits_to_binstr(av_bits),
        'Avaroha Bits (int)': str(av_bits),
        'Vakra': 'Y' if vakra else 'N',
        'Raga Checksum': checksum,
        'Scale Source Used': src_used,
        'Scale ID Review': ('Y - ' + review_note) if review_note else 'N',
    })

new_fields = fields + ['Aroha Bits (binary)', 'Aroha Bits (int)', 'Avaroha Bits (binary)', 'Avaroha Bits (int)', 'Vakra', 'Raga Checksum', 'Scale Source Used', 'Scale ID Review']

with open(OUT, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=new_fields)
    writer.writeheader()
    for r in out_rows:
        for fn in new_fields:
            r.setdefault(fn, '')
        writer.writerow(r)

print("Total rows:", len(out_rows))
print("Rows with unresolved/flagged scale ID:", unresolved_count)
print("Vakra count:", sum(1 for r in out_rows if r.get('Vakra') == 'Y'))
print("Sample rows:")
for r in out_rows[:3]:
    print(r['Melakarta Number'], r['Raga Name'], r.get('Aroha Bits (binary)'), r.get('Avaroha Bits (binary)'), r.get('Vakra'), r.get('Scale ID Review'))
