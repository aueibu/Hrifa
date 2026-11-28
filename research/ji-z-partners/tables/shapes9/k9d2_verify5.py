import json, re, collections
from fractions import Fraction as F
d = json.load(open("partial9.json"))["types"]
img = set(int(m) for m in re.findall(r"found#(\d+) \(dim \d\) IS an image", open("cmp.log").read()))
maxi = [i for i in range(len(d)) if i not in img]
print("maximal found classes:", [(i, d[i]["dim"]) for i in maxi])
def pts(S): return [tuple(int(F(x)) for x in p) for p in S]
def diffs(S): return collections.Counter(tuple(a-b for a, b in zip(x, y)) for x in S for y in S if x != y)
def same_up_to(P, Q):
    for s in (1, -1):
        for q in Q:
            for p0 in P:
                t = tuple(qq - s*pp for qq, pp in zip(q, p0))
                if set(tuple(s*a+b for a, b in zip(p, t)) for p in P) == set(Q): return True
    return False
for i in [35, 54, 56, 57, 80]:
    P, Q = pts(d[i]["P"]), pts(d[i]["Q"])
    print(f"found#{i} dim {d[i]['dim']} count {d[i]['count']}: distinct {len(set(P))},{len(set(Q))} homometric {diffs(P)==diffs(Q)} trivial {same_up_to(P,Q)}")
    print("   P", P); print("   Q", Q)
