import pickle, re, csv, html

F = "/mnt/user-data/uploads/Raga Explorer Project/Royal Carpet_ Expanded Reverse Raaga Janya List.html"
content = open(F, encoding='utf-8', errors='replace').read()

anchor_re = re.compile(r'<a name="(\d+)">')
matches = list(anchor_re.finditer(content))
end_marker = content.find('Top of page')
boundary_re = re.compile(r'</b></font></p><p><font size="2"><b>\s*</b>\s*')

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)
def clean_ws(s):
    return re.sub(r'\s+', ' ', s).strip()

SWARA_TOK = re.compile(r"^[SRGMPDN][0-9']*$")

def split_name_and_scale(line):
    """Token-based split: name = leading tokens that are NOT bare swara tokens (or '-'),
    scale = remainder. Returns (name_or_None, scale_string)."""
    tokens = line.split()
    i = 0
    while i < len(tokens) and not (SWARA_TOK.match(tokens[i]) or tokens[i] == '-'):
        i += 1
    if i == 0:
        return None, ' '.join(tokens)  # no name found - pure scale line
    name = ' '.join(tokens[:i])
    scale = ' '.join(tokens[i:])
    return name, scale

def split_swara_string(s):
    if '-' in s:
        parts = s.split('-')
        if len(parts) == 2:
            return parts[0].strip(), parts[1].strip(), None
        else:
            return s, '', f"Y - multiple '-' delimiters found ({len(parts)-1}), could not reliably split aroha/avaroha"
    else:
        tokens = s.split()
        ss_idx = None
        for idx, t in enumerate(tokens):
            if t == 'SS':
                ss_idx = idx
                break
        if ss_idx is not None:
            aroha = ' '.join(tokens[:ss_idx] + ['S'])
            avaroha = ' '.join(['S'] + tokens[ss_idx+1:])
            return aroha, avaroha, None
        for idx in range(len(tokens)-1):
            if tokens[idx] == 'S' and tokens[idx+1] == 'S':
                aroha = ' '.join(tokens[:idx+1])
                avaroha = ' '.join(tokens[idx+1:])
                return aroha, avaroha, None
        return s, '', "Y - no '-' or SS turn-marker found, could not split aroha/avaroha"

out_rows = []

for i in range(72):
    mela_num = i + 1
    start = matches[i].end()
    end = matches[i+1].start() if i+1 < 72 else end_marker
    blk = content[start:end]
    bm = boundary_re.search(blk)
    header_html = blk[:bm.start()]
    janya_html = blk[bm.end():]

    # ---- header (melakarta name/scale entries) ----
    tmp = header_html.replace('</b></font>', '')
    parts = re.split(r'<br\s*/?>', tmp)
    last_named = None
    entry_idx = 0
    for part in parts:
        part_stripped = clean_ws(html.unescape(strip_tags(part)))
        if not part_stripped:
            continue
        # strip leading duplicated mela number label e.g. "19 jhankaaradhwani ..."
        part_stripped = re.sub(r'^\d+\s+', '', part_stripped)
        name, scale = split_name_and_scale(part_stripped)
        aroha, avaroha, review = split_swara_string(scale) if scale else ('', '', "Y - no scale string found")
        if name is not None:
            row_type = 'Melakarta (primary name)' if entry_idx == 0 else 'Melakarta (alternate/asampoorna name)'
            last_named = name
            out_rows.append({
                'Row Type': row_type,
                'Melakarta Number': mela_num,
                'Raga Name': name,
                'Aroha': aroha, 'Avaroha': avaroha,
                'Raw Scale String': scale,
                'Needs Review': review or 'N',
            })
        else:
            # unnamed alternate scale variant - do not guess whose name it belongs to
            note = "Y - unnamed alternate scale variant listed for this melakarta in source (no raga name given; likely another variant of \"%s\" or an unlabeled asampoorna scale, but source does not specify)" % (last_named or "the melakarta")
            if review:
                note += " | " + review
            out_rows.append({
                'Row Type': 'Melakarta (unnamed variant scale)',
                'Melakarta Number': mela_num,
                'Raga Name': '',
                'Aroha': aroha, 'Avaroha': avaroha,
                'Raw Scale String': scale,
                'Needs Review': note,
            })
        entry_idx += 1

    # ---- janya lines ----
    janya_lines = re.split(r'<br\s*/?>', janya_html)
    for line in janya_lines:
        line_stripped = clean_ws(html.unescape(strip_tags(line)))
        if not line_stripped or line_stripped == '</b>':
            continue
        name, scale = split_name_and_scale(line_stripped)
        if name is None:
            out_rows.append({
                'Row Type': 'Janya',
                'Melakarta Number': mela_num,
                'Raga Name': '',
                'Aroha': '', 'Avaroha': '',
                'Raw Scale String': line_stripped,
                'Needs Review': "Y - could not identify a raga name in this line (line begins directly with swara tokens)",
            })
            continue
        aroha, avaroha, review = split_swara_string(scale)
        out_rows.append({
            'Row Type': 'Janya',
            'Melakarta Number': mela_num,
            'Raga Name': name,
            'Aroha': aroha, 'Avaroha': avaroha,
            'Raw Scale String': scale,
            'Needs Review': review or 'N',
        })

print("Total rows:", len(out_rows))
flagged = [r for r in out_rows if r['Needs Review'] != 'N']
print("Flagged:", len(flagged))
import collections
print(collections.Counter(r['Row Type'] for r in out_rows))
for f in flagged[:30]:
    print(f['Melakarta Number'], '|', f['Row Type'],'|', repr(f['Raga Name']), '|', f['Raw Scale String'][:60], '|', f['Needs Review'][:90])

with open('/mnt/user-data/outputs/royal-carpet-reverse-janya-list.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['Row Type','Melakarta Number','Raga Name','Aroha','Avaroha','Raw Scale String','Needs Review'])
    writer.writeheader()
    for row in out_rows:
        writer.writerow(row)
print("CSV written:", len(out_rows), "rows")
