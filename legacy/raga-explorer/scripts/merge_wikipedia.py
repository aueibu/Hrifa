import csv, re, difflib, sys
sys.path.insert(0, '/tmp/claude-0/-home-claude/98dead27-42d9-5d43-928b-934f77d03df8/scratchpad')
from collections import defaultdict

MASTER = '/mnt/user-data/outputs/master-carnatic-raga-database.csv'
WIKI = '/mnt/user-data/outputs/wikipedia-janya-raga-list.csv'

with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    master_fields = reader.fieldnames
    master_rows = list(reader)

with open(WIKI, encoding='utf-8') as f:
    wiki_rows = list(csv.DictReader(f))

def norm(s):
    import unicodedata
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-zA-Z0-9]', '', s).lower()

new_fields = list(master_fields)
idx = new_fields.index('In Royal Carpet') + 1
new_fields.insert(idx, 'In Wikipedia')
idx2 = new_fields.index('Aroha (Royal Carpet)') + 1
new_fields.insert(idx2, 'Aroha (Wikipedia)')
idx3 = new_fields.index('Avaroha (Royal Carpet)') + 1
new_fields.insert(idx3, 'Avaroha (Wikipedia)')

for r in master_rows:
    r['In Wikipedia'] = 'N/A' if r['Row Type'] == 'Melakarta (base scale)' else 'N'
    r['Aroha (Wikipedia)'] = ''
    r['Avaroha (Wikipedia)'] = ''

wiki_primary = {}
wiki_janya = defaultdict(list)
for r in wiki_rows:
    mnum = str(int(r['Melakarta Number']))
    if r['Row Type'] == 'Melakarta (primary name)':
        wiki_primary[mnum] = r
    else:
        wiki_janya[mnum].append(r)

# ---- base melakarta rows ----
base_mismatch = 0
for r in master_rows:
    if r['Row Type'] != 'Melakarta (base scale)':
        continue
    mnum = str(int(r['Melakarta Number']))
    wp = wiki_primary.get(mnum)
    if not wp:
        continue
    r['In Wikipedia'] = 'Y'
    r['Aroha (Wikipedia)'] = wp['Aroha']
    r['Avaroha (Wikipedia)'] = wp['Avaroha']
    r['Sources Agreeing Count'] = str(int(r['Sources Agreeing Count']) + 1)
    wiki_ar = [t.upper() for t in re.findall(r'[A-Za-z]+\d*', wp['Aroha'])]
    ml_ar = [t.upper() for t in re.findall(r'[A-Za-z]+\d*', r['Aroha (Musiclegato)'])]
    if wiki_ar != ml_ar:
        base_mismatch += 1
        note = f"Y - Wikipedia primary-name scale for melakarta {mnum} differs from musiclegato/derived scale: {wp['Aroha']} vs {r['Aroha (Musiclegato)']}"
        r['Needs Review'] = note if r['Needs Review'] in ('N','') else r['Needs Review'] + ' | ' + note

print("Base melakarta mismatches vs Wikipedia:", base_mismatch)

# ---- janya rows: melakarta-bucketed exact + fuzzy match with ambiguity guard, checksum-aware ----
master_janya_buckets = defaultdict(list)
for r in master_rows:
    if r['Row Type'] == 'Janya' and r['Melakarta Number'].strip().isdigit():
        mnum = str(int(r['Melakarta Number']))
        master_janya_buckets[mnum].append(r)

def base_letters(s, syllable=False):
    if syllable:
        stoks = re.findall(r'Sa|Ri|Ga|Ma|Pa|Da|Dha|Ni|SA|S(?![a-z])', s)
        return [t[0].upper() for t in stoks if t]
    toks = re.findall(r'[A-Za-z]+\d*', s)
    return [t.upper()[0] for t in toks if t]

matched_exact = matched_fuzzy = skipped_ambiguous = added_new = 0
new_rows = []

for mnum, wlist in wiki_janya.items():
    bucket = master_janya_buckets.get(mnum, [])
    bucket_norm_pairs = [(br, norm(br['Raga Name'])) for br in bucket]
    mel_name_row = next((r for r in master_rows if r['Row Type']=='Melakarta (base scale)' and str(int(r['Melakarta Number']))==mnum), None)
    mel_name = mel_name_row['Melakarta Name'] if mel_name_row else ''

    for wr in wlist:
        rn = norm(wr['Raga Name'])
        exact_targets = [br for br, bnn in bucket_norm_pairs if bnn == rn]
        target = None
        if exact_targets:
            target = exact_targets[0]
            matched_exact += 1
        else:
            scored = sorted(((difflib.SequenceMatcher(None, rn, bnn).ratio(), i, br) for i, (br, bnn) in enumerate(bucket_norm_pairs)), key=lambda x: x[0], reverse=True)
            scored = [(rt, br) for rt, i, br in scored]
            if scored and scored[0][0] >= 0.87:
                top_ratio, top_br = scored[0]
                second_ratio = scored[1][0] if len(scored) > 1 else 0
                if top_ratio - second_ratio < 0.04 and second_ratio >= 0.80:
                    skipped_ambiguous += 1
                    contenders = ', '.join(f"\"{b['Raga Name']}\" ({round(rt,3)})" for rt, b in scored[:3] if rt >= 0.80)
                    row = {fn: '' for fn in new_fields}
                    row['Row Type'] = 'Janya'
                    row['Melakarta Number'] = f"{int(mnum):02d}"
                    row['Melakarta Name'] = mel_name
                    row['Raga Name'] = wr['Raga Name']
                    for src in ['Repo','Musiclegato','Royal Carpet','Carnatic Pasted Dataset']:
                        row[f'In {src}'] = 'N'
                    row['In Wikipedia'] = 'Y'
                    row['Aroha (Wikipedia)'] = wr['Aroha']
                    row['Avaroha (Wikipedia)'] = wr['Avaroha']
                    row['Sources Agreeing Count'] = '1'
                    row['Needs Review'] = f"Y - kept as separate entry: name is ambiguously close to existing bucket entries under melakarta {mnum} and could not be confidently auto-matched to one: {contenders}"
                    new_rows.append(row)
                    continue
                target = top_br
                matched_fuzzy += 1

        if target is not None:
            if target['In Wikipedia'] == 'Y':
                note = f"Y - Wikipedia lists an additional scale variant for \"{wr['Raga Name']}\" under melakarta {mnum}: {wr['Aroha']} / {wr['Avaroha']}"
                target['Needs Review'] = (target['Needs Review'] + ' | ' if target['Needs Review'] not in ('N','') else '') + note
                continue
            target['In Wikipedia'] = 'Y'
            target['Aroha (Wikipedia)'] = wr['Aroha']
            target['Avaroha (Wikipedia)'] = wr['Avaroha']
            target['Sources Agreeing Count'] = str(int(target['Sources Agreeing Count']) + 1)
            wiki_letters = base_letters(wr['Aroha'])
            disagreements = []
            for src_label, col, syl in [('Repo','Aroha (Repo)', False), ('Musiclegato','Aroha (Musiclegato)', False),
                                          ('Royal Carpet','Aroha (Royal Carpet)', False), ('Carnatic Pasted','Aroha (Carnatic Pasted)', True)]:
                val = target.get(col, '')
                if val:
                    other = base_letters(val, syllable=syl)
                    if other != wiki_letters:
                        disagreements.append(src_label)
            if disagreements:
                note = f"Y - Wikipedia note-sequence for \"{wr['Raga Name']}\" (mela {mnum}) differs from: {', '.join(disagreements)}"
                target['Needs Review'] = (target['Needs Review'] + ' | ' if target['Needs Review'] not in ('N','') else '') + note
        else:
            added_new += 1
            row = {fn: '' for fn in new_fields}
            row['Row Type'] = 'Janya'
            row['Melakarta Number'] = f"{int(mnum):02d}"
            row['Melakarta Name'] = mel_name
            row['Raga Name'] = wr['Raga Name']
            for src in ['Repo','Musiclegato','Royal Carpet','Carnatic Pasted Dataset']:
                row[f'In {src}'] = 'N'
            row['In Wikipedia'] = 'Y'
            row['Aroha (Wikipedia)'] = wr['Aroha']
            row['Avaroha (Wikipedia)'] = wr['Avaroha']
            row['Sources Agreeing Count'] = '1'
            row['Needs Review'] = 'N'
            new_rows.append(row)

print(f"Matched exact: {matched_exact}, fuzzy: {matched_fuzzy}, ambiguous-kept-separate: {skipped_ambiguous}, brand-new: {added_new}")

all_rows = master_rows + new_rows
print("Final row count:", len(all_rows))

with open(MASTER, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=new_fields)
    writer.writeheader()
    for r in all_rows:
        for fn in new_fields:
            r.setdefault(fn, '')
        writer.writerow(r)
print("Master rewritten with Wikipedia as 5th source.")
