"""Tabulate factor_struct.py output: per list, number of irreducible factors of P, and whether some
factor (flipped or kept) is a plain chord (all coefficients 1), by size of the smallest such chord.
A family may flip either of two factors (flipping A ~ flipping B then inverting), so 'plain chord
available' means: some irreducible factor of P has only coefficient 1.
usage: python3 fs_tab.py DIR   (reads DIR/*.tsv)"""
import collections, csv, glob, os, sys

order = ["5q729", "5q2187", "5q3645", "7q243", "7q315", "11q135", "13q135", "17q135", "19q135"]
for lab in order:
    p = os.path.join(sys.argv[1], lab + ".tsv")
    if not os.path.exists(p):
        continue
    nf = collections.Counter()
    chord = collections.Counter()
    noch = []
    n = 0
    for r in csv.DictReader(open(p), delimiter="\t"):
        n += 1
        nf[r["n_factors"]] += 1
        # kept part U is a product of the kept factors; with 2 factors U is itself irreducible
        sizes = []
        if r["V_coeffs"] == "1..1":
            sizes.append(int(r["V_shape"].split(",")[0]))
        if r["U_min"] == "1" and r["U_max"] == "1":
            sizes.append(int(r["U_terms"]))
        if r["n_factors"] == "2" and sizes:
            chord[min(sizes)] += 1
        elif r["n_factors"] == "2":
            chord["none"] += 1; noch.append((r["k"], r["q"], r["factors"], r["V_shape"], r["U_min"], r["U_max"]))
        else:
            chord[f"{r['n_factors']} factors"] += 1
    print(f"{lab}: {n} families; irreducible factors of P: " + ", ".join(f"{k}: {v}" for k, v in sorted(nf.items())))
    print("   smallest plain-chord factor: " + ", ".join(f"{k}: {v}" for k, v in sorted(chord.items(), key=lambda t: str(t[0]))))
    if noch:
        ex = collections.Counter((k, q) for k, q, *_ in noch)
        print(f"   no plain-chord factor: {len(noch)} (k, q): " + ", ".join(f"{k}/{q} x{v}" for (k, q), v in sorted(ex.items())[:12]))
