import json, os, sys
sys.path.insert(0, os.path.expanduser("~/zgen/theory"))
import shapes_k
shapes_k.init(9)
# generic 3 x 3 product in Z^4: A = {0, e1, e2}, B = {0, e3, e4}; P = A + B, Q = A - B
e = [tuple(int(i == j) for j in range(4)) for i in range(4)]
A = [(0, 0, 0, 0), e[0], e[1]]
B = [(0, 0, 0, 0), e[2], e[3]]
P = [tuple(x + y for x, y in zip(a, b)) for a in A for b in B]
Q = [tuple(x - y for x, y in zip(a, b)) for a in A for b in B]
key, dim, rk, *_ = shapes_k.work(("gen", P, Q, 0))
cl = {json.loads(l)["key"]: json.loads(l) for l in open(os.path.expanduser("~/zruns/shapes9/k9.classes.jsonl"))}
c = cl.get(key)
print("3x3 product: dim", dim, "rank", rk, "->", f"pattern #{c['idx']} dim {c['dim']}" if c else "not among the known patterns")
