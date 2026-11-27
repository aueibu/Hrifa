import json, os, sys
sys.path.insert(0, os.path.expanduser("~/zgen/theory"))
from fractions import Fraction as F
from type_image import image

def load(p):
    return [([tuple(F(x) for x in a) for a in t["P"]], [tuple(F(x) for x in b) for b in t["Q"]]) for t in json.load(open(p))["types"]]

def img(B, A):
    try:
        return image(B, A) is not None
    except ValueError:
        return image((B[1], B[0]), A) is not None

new = load(os.path.expanduser("~/zruns/types8d2b/types8.json"))
old = load(os.path.expanduser("~/zruns/types8d2/types8.json"))
for i, A in enumerate(new):
    m = [j for j, B in enumerate(old) if img(B, A) and img(A, B)]
    print(f"new#{i} = old {m}", flush=True)
EOF_MARK = None
