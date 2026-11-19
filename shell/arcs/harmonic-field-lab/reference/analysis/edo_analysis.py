import re, math, collections, itertools, sys
import os
PAR=sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','chordnam.par')
cents=lambda r:1200*math.log2(r)
base=None; unit=None
edo=[]; lib=[]
for line in open(PAR,encoding='utf-8'):
    line=line.rstrip('\n')
    if not line.strip() or line.startswith('!'): continue
    if line.startswith('<'):
        m=re.match(r'<SCALA_SCALE_DEF\s+([\d/]+)\^\(1/(\d+)\)>',line)
        if m:
            b=eval(m.group(1)); n=int(m.group(2)); unit=cents(b)/n; base=(m.group(1),n)
        continue
    tok=line.split()[0]
    name=line[len(tok):].strip()
    if re.fullmatch(r'\(?\d+(:\d+)+\)?',tok):
        nums=[int(x) for x in tok.strip('()').split(':')]
        if tok.startswith('('):
            L=math.lcm(*nums); nums=sorted(L//x for x in nums)
        lib.append((name,[cents(x/nums[0]) for x in nums]))
    elif re.fullmatch(r'\d+(-\d+)+',tok) and unit:
        st=[int(x) for x in tok.split('-')]
        cs=[0.0]; 
        for s in st: cs.append(cs[-1]+s*unit)
        edo.append((name,base,unit,cs))
print('ratio library chords',len(lib),'EDO step chords',len(edo))
# candidate ratios by odd limit
def cands(L):
    out=[]
    for a in range(1,L+1,2):
        for b in range(1,L+1,2):
            if math.gcd(a,b)!=1: continue
            for k in range(-4,6):
                v=cents(a/b)+1200*k
                if -50<=v<=4300: out.append((v,a,b,k))
    return out
C15=cands(15); C9=cands(9)
def near(c,cl,T): return any(abs(v-c)<=T for v,*_ in cl)
def rounding(cs,cl,T): return all(near(c,cl,T) for c in cs)
def pcs(cs): return sorted(round(c%1200,6) for c in cs)
def libmatch(cs,T):
    p=pcs(cs); hits=[]
    for name,lc in lib:
        q=pcs(lc)
        if len(q)!=len(p): continue
        for r in range(len(q)):
            qq=q[r:]+q[:r]; base=qq[0]
            qq=[(x-base)%1200 for x in qq]
            pp=sorted(((x-p[0])%1200) for x in p)  # relative to p[0]
            # compare rotation-agnostic: try each rotation of p as well
            for s in range(len(p)):
                pr=p[s:]+p[:s]; pr=[(x-pr[0])%1200 for x in pr]
                if all(min(abs(a-b),1200-abs(a-b))<=T for a,b in zip(pr,qq)):
                    hits.append(name); break
            else: continue
            break
    return hits
byN=collections.defaultdict(lambda:[0,0])
rows=[]
for name,b,u,cs in edo:
    n=b[1]; half=u/2
    rows.append((name,b,u,cs))
print()
print('T(c)   odd<=9   odd<=15   matches a library chord')
for T in (5,10,15,20,30):
    r9=sum(rounding(cs,C9,T) for *_,cs in rows)
    r15=sum(rounding(cs,C15,T) for *_,cs in rows)
    lm=sum(1 for *_,cs in rows if libmatch(cs,T))
    print(f'{T:>4}   {r9:>5}     {r15:>5}     {lm:>5}   (of {len(rows)})')
# by EDO size at T=20 with L=15
print()
print('by EDO (steps per octave-ish) at T=20, odd<=15: rounded / total, half-step in c')
agg=collections.defaultdict(lambda:[0,0,0.0])
for name,b,u,cs in rows:
    k=f'{b[0]}^(1/{b[1]})'
    agg[k][1]+=1; agg[k][2]=u/2
    if rounding(cs,C15,20): agg[k][0]+=1
for k,v in sorted(agg.items(),key=lambda kv:kv[1][2]):
    print(f'{k:>10}: {v[0]:>3}/{v[1]:<3} half-step {v[2]:.1f} c')
# examples that fail
print()
print('EDO chords NOT a rounding of any odd<=15 chord within 20 c (first 25):')
fails=[(name,b,cs) for name,b,u,cs in rows if not rounding(cs,C15,20)]
for name,b,cs in fails[:25]:
    print(f'  {name[:44]:44} {b[0]}^(1/{b[1]})  ', ' '.join(f'{c:.0f}' for c in cs))
print(len(fails),'fail in total')
print()
print('examples that DO round at 10 c, with library match (first 12):')
n=0
for name,b,u,cs in rows:
    h=libmatch(cs,10)
    if h and n<12:
        print(f'  {name[:36]:36} {b[0]}^(1/{b[1]}) ->', '; '.join(h[:2])[:70]); n+=1
