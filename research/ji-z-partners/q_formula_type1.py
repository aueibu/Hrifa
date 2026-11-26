import numpy as np, json, itertools, math
P=[(0,0),(2,0),(0,2),(1,-1),(-1,2),(2,1)]
V=set()
for u,v in itertools.combinations(P,2):
    d=(u[0]-v[0],u[1]-v[1])
    if d<(0,0): d=(-d[0],-d[1])
    V.add(d)
V=sorted(V); print(len(V),"interval vectors",V)
primes=[3,5,7]; LP=np.log(primes); QMAX=531441
def ratios():
    out=[]
    lim=int(math.log(QMAX)/math.log(3))
    rng=range(-12,13)
    for e in itertools.product(range(-12,13),range(-7,8),range(-6,7)):
        num=den=1.0
        ln=sum(max(x,0)*l for x,l in zip(e,LP)); ld=sum(max(-x,0)*l for x,l in zip(e,LP))
        if max(ln,ld)<=math.log(QMAX)+1e-9: out.append(e)
    return np.array(out,dtype=np.int64)
R=ratios(); print("ratios",len(R))
best=np.zeros((len(R),len(R)),dtype=np.float64); ok=np.ones((len(R),len(R)),dtype=bool)
for x,y in V:
    E=x*R[:,None,:]+y*R[None,:,:]
    ln=(np.maximum(E,0)*LP).sum(-1); ld=(np.maximum(-E,0)*LP).sum(-1)
    best=np.maximum(best,np.maximum(ln,ld)); ok&=(E!=0).any(-1)
sel=ok&(best<=math.log(QMAX)+1e-9)
qs=sorted({int(round(math.exp(v))) for v in best[sel]})
print("formula distinct q (7-limit, k6, nondegenerate-by-distinctness):",len(qs))
j=json.load(open("/home/apoorbaugh_gmail_com/zruns/zexp/out/final/explorer_all.json"))
data=sorted({q for q,k,p,lb in zip(j["q"],j["k"],j["p"],j["lb"]) if k==6 and p<=7 and lb!=1 and q<=QMAX})
print("data distinct q (6 notes, p<=7):",len(data))
print("in data not formula:",[q for q in data if q not in set(qs)][:20])
print("in formula not data:",[q for q in qs if q not in set(data)][:40])
print("formula first 25:",qs[:25]); print("data first 25:",data[:25])
