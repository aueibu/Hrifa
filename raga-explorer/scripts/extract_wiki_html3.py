import re, json, html, pickle

F = "/root/.claude/uploads/98dead27-42d9-5d43-928b-934f77d03df8/f18e2bc0-List_of_Janya_ragas_-_Wikipedia.html"
content = open(F, encoding='utf-8', errors='replace').read()
table = content[50684:884917]

row_pattern = re.compile(r'<tr([^>]*)>(.*?)</tr>', re.S)
rows_html = row_pattern.findall(table)[1:]  # skip header row
print("Total <tr> rows:", len(rows_html))

def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)
def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()

td_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.S)
datamw_pattern = re.compile(r"data-mw='({.*?})'", re.S)

def parse_svara_span(td_html):
    m = datamw_pattern.search(td_html)
    if not m:
        return None, 'no data-mw span found'
    raw = html.unescape(m.group(1))
    try:
        data = json.loads(raw)
    except Exception as e:
        return None, f'json parse error: {e}'
    try:
        params = data['parts'][0]['template']['params']
    except Exception:
        return None, 'unexpected data-mw structure'
    tokens = []
    i = 1
    while str(i) in params:
        tok = params[str(i)]['wt'].replace('&apos;', "'")
        tokens.append(tok)
        i += 1
    return tokens, None

parsed_rows = []
errs = 0
for attrs, rh in rows_html:
    is_header = 'background-color:#ebebeb' in attrs
    tds = td_pattern.findall(rh)
    if len(tds) < 3:
        continue
    name_td, aroha_td, avaroha_td = tds[0], tds[1], tds[2]
    name_raw = clean(strip_tags(name_td))
    is_janaka_annotated = '(Janaka raga)' in name_raw
    name_clean = name_raw.replace('(Janaka raga)', '').strip()
    mnum_match = re.match(r'^(\d+)\s+(.*)$', name_clean)
    explicit_mnum = int(mnum_match.group(1)) if mnum_match else None
    if mnum_match:
        name_clean = mnum_match.group(2).strip()

    ar_tokens, ar_err = parse_svara_span(aroha_td)
    av_tokens, av_err = parse_svara_span(avaroha_td)
    if ar_err or av_err:
        errs += 1

    parsed_rows.append({
        'is_melakarta_header': is_header,
        'explicit_mnum': explicit_mnum,
        'name': name_clean,
        'aroha_tokens': ar_tokens,
        'avaroha_tokens': av_tokens,
        'ar_err': ar_err, 'av_err': av_err,
    })

print("Parsed rows:", len(parsed_rows))
print("Melakarta header rows:", sum(1 for r in parsed_rows if r['is_melakarta_header']))
print("Rows with span errors:", errs)

# assign melakarta numbers by counting header rows sequentially
mnum = 0
for r in parsed_rows:
    if r['is_melakarta_header']:
        mnum += 1
    r['assigned_mnum'] = mnum

print("Final running melakarta count:", mnum)
janya_count = sum(1 for r in parsed_rows if not r['is_melakarta_header'])
print("Total janya rows:", janya_count)

for r in parsed_rows[:3]:
    print(r)
print("...")
for r in parsed_rows[-3:]:
    print(r)

with open('/tmp/claude-0/-home-claude/98dead27-42d9-5d43-928b-934f77d03df8/scratchpad/wiki_html_parsed2.pkl', 'wb') as f:
    pickle.dump(parsed_rows, f)
