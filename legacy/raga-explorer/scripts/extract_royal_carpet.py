import re, csv, html

F = "/mnt/user-data/uploads/Raga Explorer Project/Royal Carpet_ Expanded Reverse Raaga Janya List.html"
content = open(F, encoding='utf-8', errors='replace').read()

anchor_re = re.compile(r'<a name="(\d+)">')
matches = list(anchor_re.finditer(content))
assert len(matches) == 72

end_marker = content.find('Top of page')
assert end_marker != -1

boundary_re = re.compile(r'</b></font></p><p><font size="2"><b>\s*</b>\s*')

# For parsing header (bold) section: name+scale pairs, name may or may not be a link
# Pattern per name-entry: optional <a href="...">NAME</a> or bare NAME, followed by SCALE, ending at <br> or end of bold section
name_scale_re = re.compile(
    r'(?:<a href="([^"]*)">([^<]+)</a>|([A-Za-zĀ-ʯ\'āīūēōĀĪŪĒŌṛṝḷḹṃḥśṣñṅṇṭḍṆṢŚṬḌṄñĀ0-9\-]+))\s+((?:[SRGMPDN][0-9\']*\s*-?\s*)+S)\s*(?:<br>)?'
)

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)

def clean_ws(s):
    return re.sub(r'\s+', ' ', s).strip()

rows = []
review_notes_summary = []

for i in range(72):
    mela_num = i + 1
    start = matches[i].end()
    end = matches[i+1].start() if i+1 < 72 else end_marker
    blk = content[start:end]

    bm = boundary_re.search(blk)
    if not bm:
        print("MISSING boundary", mela_num)
        continue
    header_html = blk[:bm.start()]
    janya_html = blk[bm.end():]

    # ---- Parse header (melakarta name(s) + scale(s)) ----
    header_text = header_html
    # remove the leading "<b>N </b></a>" or similar wrapper already stripped by anchor; header still has stray tags
    # Extract entries: <a href=...>name</a> SCALE<br>  or  name SCALE (last one, no link, inside </b> closing)
    # Simplify: strip all tags except keep <br> as delimiter, then split on <br>
    tmp = header_html.replace('</b></font>', '')
    # split on <br>
    parts = re.split(r'<br\s*/?>', tmp)
    mela_names = []
    for part in parts:
        part_stripped = strip_tags(part)
        part_stripped = clean_ws(html.unescape(part_stripped))
        if not part_stripped:
            continue
        # remove leading mela number label if present e.g. "1 " duplicated - shouldn't be since we sliced after anchor end
        m = re.match(r'^(.*?)\s+((?:S\b.*|(?:[SRGMPDN][0-9\']*\s*-?\s*)+S))$', part_stripped)
        if m:
            nm = m.group(1).strip()
            sc = m.group(2).strip()
            mela_names.append((nm, sc))
        else:
            mela_names.append((part_stripped, None))

    # ---- Parse janya section ----
    janya_lines = re.split(r'<br\s*/?>', janya_html)
    janya_entries = []
    for line in janya_lines:
        line_stripped = strip_tags(line)
        line_stripped = clean_ws(html.unescape(line_stripped))
        if not line_stripped:
            continue
        # skip stray leftover markers
        if line_stripped in ('', '</b>'):
            continue
        janya_entries.append(line_stripped)

    rows.append({
        'mela_num': mela_num,
        'mela_names': mela_names,
        'janya_raw_lines': janya_entries,
    })

print("Parsed", len(rows), "melakarta blocks")
print("Sample mela 1 names:", rows[0]['mela_names'])
print("Sample mela 1 first 5 janya lines:", rows[0]['janya_raw_lines'][:5])
print("Sample mela 1 janya count:", len(rows[0]['janya_raw_lines']))
print()
print("Sample mela 72 names:", rows[71]['mela_names'])
print("Sample mela 72 janya count:", len(rows[71]['janya_raw_lines']))
print("last few janya lines mela 72:", rows[71]['janya_raw_lines'][-3:])

total_janya = sum(len(r['janya_raw_lines']) for r in rows)
print("TOTAL raw janya lines across all melas:", total_janya)

import pickle
with open('/tmp/claude-0/-home-claude/98dead27-42d9-5d43-928b-934f77d03df8/scratchpad/royal_carpet_parsed.pkl','wb') as f:
    pickle.dump(rows, f)
