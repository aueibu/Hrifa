"""Set the Vakra column of every CLEAN list from scripts/sargam_intervals.py (the pitch-based turn-back rule),
plus the user's rulings in raga lists/vakra-rulings.csv for scales the module cannot settle.

Vakra = Yes when any step in the aroha falls or any step in the avaroha rises, measured in signed semitones (see
sargam_intervals.py). Options used: notation='carnatic' (all CLEAN lists are Carnatic; a bare letter is not guessed) and
close=True (a plain one-octave Sa..Sa' scale has its closing Sa as the upper Sa; skipped when it would be a guess) and
sa_conventions=True (a leap away from the opening Sa goes in the scale's direction; an Sa in the middle keeps the nearest reading).
Rows whose scale cannot be read (digit-less swaras, the invalid M3, blank scales) keep their existing Vakra. So do rows where
the module itself says the answer is not reliable (a trigger rests on an unresolved 4th/5th ambiguity, or a scale sum fails):
the module's raw answer is not used there, and the master database records the flag instead.

    python scripts/apply_vakra_module.py            # dry run: counts and the change list
    python scripts/apply_vakra_module.py --write    # back up nothing itself; make the backups first
"""
import csv, glob, io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sargam_intervals import SargamError, is_vakra  # noqa: E402
from build_master_from_clean import load_rulings, name_key  # noqa: E402

BASE = os.path.join(HERE, '..', 'raga lists')
CHANGELOG = os.path.join(BASE, 'vakra-module-switch-changelog.csv')


def main():
    write = '--write' in sys.argv
    log, summary = [], {}
    rulings = load_rulings()
    for f in sorted(glob.glob(os.path.join(BASE, 'CLEAN-*.csv'))):
        if 'backup' in f:
            continue
        raw = open(f, 'rb').read()
        crlf, endnl = b'\r\n' in raw, raw.endswith(b'\n')
        rows = list(csv.reader(io.StringIO(raw.decode('utf-8'), newline='')))
        H = rows[0]
        C = {h: i for i, h in enumerate(H)}
        n_changed = n_same = n_skipped = n_unreliable = 0
        for i, r in enumerate(rows[1:]):
            try:
                res = is_vakra(r[C['Aroha']], r[C['Avaroha']], notation='carnatic', close=True, sa_conventions=True)
            except SargamError:
                n_skipped += 1
                continue
            new = 'Yes' if res.is_vakra else 'No'
            ruling = rulings.get((name_key(r[C['Raga Name']]), r[C['Aroha']].strip(), r[C['Avaroha']].strip()))
            if ruling:
                new, ruled_why = ruling[0], "the user's ruling: " + ruling[1]
            n_unreliable += not res.reliable and not ruling
            if new != r[C['Vakra']] and (res.reliable or ruling):
                n_changed += 1
                trig = ruled_why if ruling else '; '.join('%s %s->%s %+d' % (t.part, t.from_token, t.to_token, t.step) for t in res.triggers)
                log.append([os.path.basename(f).replace('CLEAN-', '').replace('-list.csv', ''), i + 2, r[C['Raga Name']], r[C['Vakra']], new,
                            trig, 'ruled' if ruling else ('yes' if res.reliable else 'no')])
                r[C['Vakra']] = new
                why = trig if trig else 'no aroha step falls and no avaroha step rises'
                how = 'by ' + why if ruling else 'by the pitch-based rule in sargam_intervals.py (%s)' % why
                if 'Decision / Finding Notes' in C:
                    msg = '[2026-09-21] VAKRA: Vakra set to %s %s.' % (new, how)
                    r[C['Decision / Finding Notes']] = (r[C['Decision / Finding Notes']] + ' | ' + msg) if r[C['Decision / Finding Notes']] else msg
                elif 'Notes' in C:
                    msg = 'Vakra is %s %s.' % (new, how)
                    r[C['Notes']] = (r[C['Notes']].rstrip() + ' ' + msg) if r[C['Notes']] else msg
            else:
                n_same += 1
        summary[os.path.basename(f)] = (n_same, n_changed, n_skipped, n_unreliable)
        if write:
            buf = io.StringIO(newline='')
            csv.writer(buf, lineterminator='\r\n' if crlf else '\n').writerows(rows)
            b = buf.getvalue().encode('utf-8')
            if not endnl:
                b = b[:-2] if crlf else b[:-1]
            open(f, 'wb').write(b)
    for k, (s, c, sk, u) in summary.items():
        print('%-48s unchanged %5d | changed %4d | unreadable (kept) %3d | flagged unreliable %3d' % (k, s, c, sk, u))
    if write:
        with open(CHANGELOG, 'w', newline='', encoding='utf-8-sig') as fh:
            w = csv.writer(fh)
            w.writerow(['List', 'Row', 'Raga', 'Vakra before', 'Vakra after', 'Steps that trigger it', 'Reliable'])
            w.writerows(log)
    return log


if __name__ == '__main__':
    log = main()
    import collections
    print(collections.Counter((a[3], a[4]) for a in log))
