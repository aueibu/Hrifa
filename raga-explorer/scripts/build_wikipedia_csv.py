import pickle, csv

with open('/tmp/claude-0/-home-claude/98dead27-42d9-5d43-928b-934f77d03df8/scratchpad/wiki_html_parsed2.pkl', 'rb') as f:
    parsed_rows = pickle.load(f)

out_rows = []
for r in parsed_rows:
    row_type = 'Melakarta (primary name)' if r['is_melakarta_header'] else 'Janya'
    out_rows.append({
        'Row Type': row_type,
        'Melakarta Number': r['assigned_mnum'],
        'Raga Name': r['name'],
        'Aroha': ' '.join(r['aroha_tokens']),
        'Avaroha': ' '.join(r['avaroha_tokens']),
        'Needs Review': 'N',
    })

OUT = '/mnt/user-data/outputs/wikipedia-janya-raga-list.csv'
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['Row Type','Melakarta Number','Raga Name','Aroha','Avaroha','Needs Review'])
    w.writeheader()
    for row in out_rows:
        w.writerow(row)

print("Written:", len(out_rows), "rows")
print("Melakarta headers:", sum(1 for r in out_rows if r['Row Type']=='Melakarta (primary name)'))
print("Janyas:", sum(1 for r in out_rows if r['Row Type']=='Janya'))
