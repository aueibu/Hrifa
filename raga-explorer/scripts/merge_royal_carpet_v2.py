import csv, re, difflib
from collections import defaultdict

MASTER = '/tmp/claude-0/-home-claude/98dead27-42d9-5d43-928b-934f77d03df8/scratchpad/master-pre-rc.csv'
RC = '/mnt/user-data/outputs/royal-carpet-reverse-janya-list.csv'
OUT = '/mnt/user-data/outputs/master-carnatic-raga-database.csv'

with open(MASTER, encoding='utf-8') as f:
    reader = csv.DictReader(f)
    master_fields = reader.fieldnames
    master_rows = list(reader)

with open(RC, encoding='utf-8') as f:
    rc_rows = list(csv.DictReader(f))

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

new_fields = list(master_fields)
idx = new_fields.index('In Carnatic Pasted Dataset') + 1
new_fields.insert(idx, 'In Royal Carpet')
idx2 = new_fields.index('Aroha (Carnatic Pasted)') + 1
new_fields.insert(idx2, 'Aroha (Royal Carpet)')
idx3 = new_fields.index('Avaroha (Carnatic Pasted)') + 1
new_fields.insert(idx3, 'Avaroha (Royal Carpet)')

for r in master_rows:
    r['In Royal Carpet'] = 'N/A' if r['Row Type'] == 'Melakarta (base scale)' else 'N'
    r['Aroha (Royal Carpet)'] = ''
    r['Avaroha (Royal Carpet)'] = ''

rc_primary, rc_alt, rc_unnamed, rc_janya = {}, {}, {}, {}
for r in rc_rows:
    mnum = str(int(r['Melakarta Number']))
    if r['Row Type'] == 'Melakarta (primary name)':
        rc_primary[mnum] = r
    elif r['Row Type'] == 'Melakarta (alternate/asampoorna name)':
        rc_alt.setdefault(mnum, []).append(r)
    elif r['Row Type'] == 'Melakarta (unnamed variant scale)':
        rc_unnamed.setdefault(mnum, []).append(r)
    else:
        rc_janya.setdefault(mnum, []).append(r)

# ---- base melakarta scale rows ----
base_mismatch_notes = 0
for r in master_rows:
    if r['Row Type'] != 'Melakarta (base scale)':
        continue
    mnum = str(int(r['Melakarta Number']))
    rp = rc_primary.get(mnum)
    if rp:
        r['In Royal Carpet'] = 'Y'
        r['Aroha (Royal Carpet)'] = rp['Aroha']
        r['Avaroha (Royal Carpet)'] = rp['Avaroha']
        r['Sources Agreeing Count'] = str(int(r['Sources Agreeing Count']) + 1)
        rc_ar_u = [t.upper() for t in re.findall(r'[A-Za-z]+\d*', rp['Aroha'])]
        ml_ar_u = [t.upper() for t in re.findall(r'[A-Za-z]+\d*', r['Aroha (Musiclegato)'])]
        if rc_ar_u != ml_ar_u:
            note = f"Y - Royal Carpet primary-name scale for melakarta {mnum} ({rp['Raga Name']}) differs from musiclegato/derived scale: RC aroha \"{rp['Aroha']}\" vs musiclegato \"{r['Aroha (Musiclegato)']}\""
            r['Needs Review'] = (r['Needs Review'] + ' | ' if r['Needs Review'] not in ('N','') else '') + note
            base_mismatch_notes += 1
    alts = rc_alt.get(mnum, [])
    if alts:
        alt_desc = '; '.join(f"{a['Raga Name']} ({a['Aroha']} / {a['Avaroha']})" for a in alts)
        note = f"N - info: Royal Carpet lists alternate/asampoorna name(s) for this melakarta not otherwise flagged as a problem: {alt_desc}"
        r['Needs Review'] = note if r['Needs Review'] in ('N','') else r['Needs Review'] + ' | ' + note

print("Base melakarta mismatches vs RC primary name scale:", base_mismatch_notes)

# ---- bucket existing janya rows ----
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

matched_exact = matched_fuzzy = added_new = skipped_ambiguous = 0
new_rows_to_append = []
already_merged_target_ids = {}  # id(target) -> rc_name that claimed it, to detect "already Y" branch

for mnum, rc_list in rc_janya.items():
    bucket = master_janya_buckets.get(mnum, [])
    bucket_norm_pairs = [(br, norm(br['Raga Name'])) for br in bucket]
    mel_name_row = next((r for r in master_rows if r['Row Type']=='Melakarta (base scale)' and str(int(r['Melakarta Number']))==mnum), None)
    mel_name = mel_name_row['Melakarta Name'] if mel_name_row else ''

    for rc_r in rc_list:
        rn = norm(rc_r['Raga Name'])
        exact_targets = [br for br, bnn in bucket_norm_pairs if bnn == rn]
        target = None
        is_fuzzy = False
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
                    # ambiguous - do not auto-merge
                    skipped_ambiguous += 1
                    contenders = ', '.join(f"\"{b['Raga Name']}\" ({round(rt,3)})" for rt, b in scored[:3] if rt >= 0.80)
                    row = {fn: '' for fn in new_fields}
                    row['Row Type'] = 'Janya'
                    row['Melakarta Number'] = f"{int(mnum):02d}"
                    row['Melakarta Name'] = mel_name
                    row['Raga Name'] = rc_r['Raga Name']
                    row['In Repo'] = 'N'; row['In Musiclegato'] = 'N'; row['In Carnatic Pasted Dataset'] = 'N'
                    row['In Royal Carpet'] = 'Y'
                    row['Aroha (Repo)'] = ''; row['Aroha (Musiclegato)'] = ''; row['Aroha (Carnatic Pasted)'] = ''
                    row['Avaroha (Repo)'] = ''; row['Avaroha (Musiclegato)'] = ''; row['Avaroha (Carnatic Pasted)'] = ''
                    row['Aroha (Royal Carpet)'] = rc_r['Aroha']
                    row['Avaroha (Royal Carpet)'] = rc_r['Avaroha']
                    row['Sources Agreeing Count'] = '1'
                    row['Needs Review'] = f"Y - kept as separate entry: name is ambiguously close to existing bucket entries under melakarta {mnum} and could not be confidently auto-matched to one: {contenders}. Manual review needed to confirm whether this is the same raga as one of those or a genuinely distinct one."
                    new_rows_to_append.append(row)
                    continue
                target = top_br
                matched_fuzzy += 1

        if target is not None:
            if target['In Royal Carpet'] == 'Y':
                note = f"Y - Royal Carpet lists an additional scale variant for \"{rc_r['Raga Name']}\" under melakarta {mnum} not captured in the single Aroha/Avaroha (Royal Carpet) field: {rc_r['Aroha']} / {rc_r['Avaroha']}"
                target['Needs Review'] = (target['Needs Review'] + ' | ' if target['Needs Review'] not in ('N','') else '') + note
                continue
            target['In Royal Carpet'] = 'Y'
            target['Aroha (Royal Carpet)'] = rc_r['Aroha']
            target['Avaroha (Royal Carpet)'] = rc_r['Avaroha']
            target['Sources Agreeing Count'] = str(int(target['Sources Agreeing Count']) + 1)
            rc_letters = base_letters(rc_r['Aroha'])
            disagreements = []
            for src_label, col, syl in [('Repo','Aroha (Repo)', False), ('Musiclegato','Aroha (Musiclegato)', False), ('Carnatic Pasted','Aroha (Carnatic Pasted)', True)]:
                val = target.get(col, '')
                if val:
                    other_letters = base_letters(val, syllable=syl)
                    if other_letters != rc_letters:
                        disagreements.append(src_label)
            if disagreements:
                note = f"Y - Royal Carpet note-sequence for \"{rc_r['Raga Name']}\" (mela {mnum}) differs from: {', '.join(disagreements)}"
                target['Needs Review'] = (target['Needs Review'] + ' | ' if target['Needs Review'] not in ('N','') else '') + note
        else:
            added_new += 1
            row = {fn: '' for fn in new_fields}
            row['Row Type'] = 'Janya'
            row['Melakarta Number'] = f"{int(mnum):02d}"
            row['Melakarta Name'] = mel_name
            row['Raga Name'] = rc_r['Raga Name']
            row['In Repo'] = 'N'; row['In Musiclegato'] = 'N'; row['In Carnatic Pasted Dataset'] = 'N'
            row['In Royal Carpet'] = 'Y'
            row['Aroha (Repo)'] = ''; row['Aroha (Musiclegato)'] = ''; row['Aroha (Carnatic Pasted)'] = ''
            row['Avaroha (Repo)'] = ''; row['Avaroha (Musiclegato)'] = ''; row['Avaroha (Carnatic Pasted)'] = ''
            row['Aroha (Royal Carpet)'] = rc_r['Aroha']
            row['Avaroha (Royal Carpet)'] = rc_r['Avaroha']
            row['Sources Agreeing Count'] = '1'
            row['Needs Review'] = rc_r['Needs Review'] if rc_r['Needs Review'] != 'N' else 'N'
            new_rows_to_append.append(row)

print("Matched exact:", matched_exact, "fuzzy:", matched_fuzzy, "skipped as ambiguous (kept separate+flagged):", skipped_ambiguous, "brand-new:", added_new)

unnamed_added = 0
for mnum, ulist in rc_unnamed.items():
    mel_name_row = next((r for r in master_rows if r['Row Type']=='Melakarta (base scale)' and str(int(r['Melakarta Number']))==mnum), None)
    mel_name = mel_name_row['Melakarta Name'] if mel_name_row else ''
    for u in ulist:
        unnamed_added += 1
        row = {fn: '' for fn in new_fields}
        row['Row Type'] = 'Janya (unnamed - Royal Carpet variant scale)'
        row['Melakarta Number'] = f"{int(mnum):02d}"
        row['Melakarta Name'] = mel_name
        row['Raga Name'] = '(unnamed)'
        row['In Repo'] = 'N'; row['In Musiclegato'] = 'N'; row['In Carnatic Pasted Dataset'] = 'N'
        row['In Royal Carpet'] = 'Y'
        row['Aroha (Repo)'] = ''; row['Aroha (Musiclegato)'] = ''; row['Aroha (Carnatic Pasted)'] = ''
        row['Avaroha (Repo)'] = ''; row['Avaroha (Musiclegato)'] = ''; row['Avaroha (Carnatic Pasted)'] = ''
        row['Aroha (Royal Carpet)'] = u['Aroha']
        row['Avaroha (Royal Carpet)'] = u['Avaroha']
        row['Sources Agreeing Count'] = '1'
        row['Needs Review'] = u['Needs Review']
        new_rows_to_append.append(row)

print("Unnamed variant rows appended:", unnamed_added)

all_rows = master_rows + new_rows_to_append
print("Final row count:", len(all_rows))

with open(OUT, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=new_fields)
    writer.writeheader()
    for r in all_rows:
        for fn in new_fields:
            r.setdefault(fn, '')
        writer.writerow(r)

print("Master database rebuilt with Royal Carpet as 4th source (ambiguity-guarded).")
