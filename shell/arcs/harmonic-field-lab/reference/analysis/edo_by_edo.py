import runpy,sys,collections,io,contextlib
import os
HERE=os.path.dirname(os.path.abspath(__file__))
sys.argv=['x',os.path.join(HERE,'..','chordnam.par')]
buf=io.StringIO()
with contextlib.redirect_stdout(buf): g=runpy.run_path(os.path.join(HERE,'edo_analysis.py'))
rows=g['rows']; libmatch=g['libmatch']; C15=g['C15']
T=18
res=[(name,b,cs,libmatch(cs,T)) for name,b,u,cs in rows]
tot=len(res); hit=sum(1 for r in res if r[3]); print(f'T={T} c (the lab default): {hit}/{tot} match >=1 library chord')
amb=[len(r[3]) for r in res if r[3]]
print('matches per chord: median',sorted(amb)[len(amb)//2],'max',max(amb),' exactly one:',sum(1 for a in amb if a==1))
agg=collections.defaultdict(lambda:[0,0])
for n,b,cs,h in res:
    k=int(b[1]) if b[0]=='2' else b[0]+'^1/'+str(b[1])
    agg[k][1]+=1; agg[k][0]+=1 if h else 0
print('per EDO (hit/total):',', '.join(f'{k}:{v[0]}/{v[1]}' for k,v in sorted(agg.items(),key=lambda kv:str(kv[0]).zfill(8))))
for n,b,cs,h in res:
    if 'Neutral Triad' in n and b[1]==7: print('7-tone neutral triad ->',[round(c) for c in cs],h)
    if '31' in n and False: pass
# non-12 only
non12=[r for r in res if not(b:=r[1]) or b[1]!=12]
print('excluding 12-EDO:',sum(1 for r in non12 if r[3]),'/',len(non12))
