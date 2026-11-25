import json, sys
from fractions import Fraction
from math import gcd
def odd(n):
    while n % 2 == 0: n //= 2
    return n
def iol(rs):
    fs=[Fraction(r) for r in rs]; m=1
    for a in fs:
        for b in fs:
            if a<b:
                x=b/a; m=max(m,odd(x.numerator),odd(x.denominator))
    return m
for p in sys.argv[1:]:
    for l in open(p):
        f=json.loads(l); ms=f["members"]
        u=[any(len(v)>3 and v[3]!=0 for v in m["lattice"]) for m in ms]
        q=max(iol(m["ratios"]) for m in ms)
        print(f["notes"], "q=%d"%q, "uses11=%s"%("".join("Y" if x else "n" for x in u)), " ~ ".join(" ".join(m["ratios"]) for m in ms))
