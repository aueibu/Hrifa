(()=>{
  const svg=document.getElementById('canvas'), browser=document.getElementById('browser'), status=document.getElementById('status'), summary=document.getElementById('summary'), hud=document.getElementById('hud');
  // Chrome (buttons/checkboxes/selects) reads --chrome-accent directly via
  // CSS; this map covers only the work-surface/derived colors the canvas
  // (SVG) draws with — see THEME_ARCHIVE.md for the palette this replaced.
  const colors={polygon:'var(--work-surface-idle)',crease:'var(--line)',mid:'var(--line)',plus:'var(--fold-plus)',minus:'var(--fold-minus)',selected:'var(--work-surface-active)',text:'var(--neutral-text)',muted:'var(--neutral-text-muted)'};
  let vertices=[],closed=true,history=[],model=null,selected=null,selectedInsertion=null,drag=null;
  let mode='freeform', latticeSpacing=40, latticeOrigin=null, minRadius=0, maxRadius=6, convexHullOnly=false;
  let sortKey='default', sortDir='asc', filterStar=false, filterConvex=false;
  const EPS=1e-7, add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}), sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), mul=(a,s)=>({x:a.x*s,y:a.y*s}), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), mid=(a,b)=>mul(add(a,b),.5);
  const cross=(a,b)=>a.x*b.y-a.y*b.x, orient=(a,b,c)=>cross(sub(b,a),sub(c,a));
  function area(p){return p.length<3?0:Math.abs(p.reduce((s,a,i)=>s+cross(a,p[(i+1)%p.length]),0))/2}
  function signedArea(p){return p.reduce((s,a,i)=>s+cross(a,p[(i+1)%p.length]),0)/2}
  function perimeter(p){return p.reduce((s,a,i)=>s+dist(a,p[(i+1)%p.length]),0)}
  function onSegment(a,b,p){return Math.abs(orient(a,b,p))<1e-6&&p.x>=Math.min(a.x,b.x)-1e-6&&p.x<=Math.max(a.x,b.x)+1e-6&&p.y>=Math.min(a.y,b.y)-1e-6&&p.y<=Math.max(a.y,b.y)+1e-6}
  function segIntersect(a,b,c,d){const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);if(((o1>EPS&&o2<-EPS)||(o1<-EPS&&o2>EPS))&&((o3>EPS&&o4<-EPS)||(o3<-EPS&&o4>EPS)))return true;return (Math.abs(o1)<EPS&&onSegment(a,b,c))||(Math.abs(o2)<EPS&&onSegment(a,b,d))||(Math.abs(o3)<EPS&&onSegment(c,d,a))||(Math.abs(o4)<EPS&&onSegment(c,d,b))}
  function intersections(p){let n=0;for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){if(j===i+1||(i===0&&j===p.length-1))continue;if(segIntersect(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))n++}return n}
  function simple(p){return intersections(p)===0&&!p.some((a,i)=>dist(a,p[(i+1)%p.length])<1e-5)}
  function convex(p){let signs=[];for(let i=0;i<p.length;i++){const z=orient(p[i],p[(i+1)%p.length],p[(i+2)%p.length]);if(Math.abs(z)>1e-6)signs.push(Math.sign(z))}return signs.length>0&&signs.every(s=>s===signs[0])}
  function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(onSegment(a,b,p))return 'boundary';if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit}return hit?'inside':'outside'}
  function reflect(p,a,b){const d=sub(b,a),t=((p.x-a.x)*d.x+(p.y-a.y)*d.y)/(d.x*d.x+d.y*d.y||1);const q=add(a,mul(d,t));return sub(mul(q,2),p)}

  // --- Lattice-space helpers (Lattice-Seed mode) ---
  const toLattice=(p)=>({x:Math.round((p.x-latticeOrigin.x)/latticeSpacing),y:Math.round((p.y-latticeOrigin.y)/latticeSpacing)});
  const toPixel=(lp)=>({x:latticeOrigin.x+lp.x*latticeSpacing,y:latticeOrigin.y+lp.y*latticeSpacing});
  function initLatticeOrigin(){const vb=svg.viewBox.baseVal;latticeOrigin={x:vb.x+vb.width/2,y:vb.y+vb.height/2}}
  function eligiblePoints(){const pts=[];for(let x=-maxRadius;x<=maxRadius;x++)for(let y=-maxRadius;y<=maxRadius;y++){const r2=x*x+y*y;if(r2>=minRadius*minRadius&&r2<=maxRadius*maxRadius)pts.push({x,y})}return pts}
  function nearestEligibleLatticePoint(p){const cx=(p.x-latticeOrigin.x)/latticeSpacing,cy=(p.y-latticeOrigin.y)/latticeSpacing;let best=null,bestD=Infinity;for(const lp of eligiblePoints()){const d=(lp.x-cx)*(lp.x-cx)+(lp.y-cy)*(lp.y-cy);if(d<bestD){bestD=d;best=lp}}return best}
  function centroidOf(points){const n=points.length;return {x:points.reduce((s,p)=>s+p.x,0)/n,y:points.reduce((s,p)=>s+p.y,0)/n}}
  function angularSort(points){const c=centroidOf(points);return points.slice().sort((a,b)=>Math.atan2(a.y-c.y,a.x-c.x)-Math.atan2(b.y-c.y,b.x-c.x))}
  function collinearFilter(points){let pts=points.slice(),changed=true;while(changed&&pts.length>=3){changed=false;for(let i=0;i<pts.length;i++){const a=pts[(i-1+pts.length)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];if(Math.abs(orient(a,b,c))<1e-9){pts.splice(i,1);changed=true;break}}}return pts}
  function convexHull(points){const pts=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);if(pts.length<3)return pts.slice();const lower=[];for(const p of pts){while(lower.length>=2&&orient(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p)}const upper=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>=2&&orient(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p)}upper.pop();lower.pop();return lower.concat(upper)}

  // --- Analytical metrics (metrics layer) ---
  function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b]}return a}
  function reflexCount(poly){const refSign=Math.sign(signedArea(poly))||1,n=poly.length;let r=0;for(let i=0;i<n;i++){const a=poly[(i-1+n)%n],b=poly[i],c=poly[(i+1)%n],o=orient(a,b,c);if(Math.abs(o)>1e-9&&Math.sign(o)!==refSign)r++}return r}
  function exteriorAngleSum(poly){const n=poly.length;let sum=0;for(let i=0;i<n;i++){const a=poly[(i-1+n)%n],b=poly[i],c=poly[(i+1)%n],d1=sub(b,a),d2=sub(c,b);sum+=Math.atan2(cross(d1,d2),d1.x*d2.x+d1.y*d2.y)}return sum*180/Math.PI}
  function lineIntersect(p1,p2,a,b){const d1=sub(p2,p1),d2=sub(b,a),denom=cross(d1,d2);if(Math.abs(denom)<1e-12)return null;const t=cross(sub(a,p1),d2)/denom;return add(p1,mul(d1,t))}
  function isStarShaped(poly){const n=poly.length;if(n<3)return false;const sign=Math.sign(signedArea(poly))||1,M=1e6;let clip=[{x:-M,y:-M},{x:M,y:-M},{x:M,y:M},{x:-M,y:M}];for(let i=0;i<n&&clip.length;i++){const a=poly[i],b=poly[(i+1)%n],out=[];for(let j=0;j<clip.length;j++){const cur=clip[j],prev=clip[(j-1+clip.length)%clip.length],curIn=orient(a,b,cur)*sign>=-1e-9,prevIn=orient(a,b,prev)*sign>=-1e-9;if(curIn){if(!prevIn){const ip=lineIntersect(prev,cur,a,b);if(ip)out.push(ip)}out.push(cur)}else if(prevIn){const ip=lineIntersect(prev,cur,a,b);if(ip)out.push(ip)}}clip=out}return clip.length>0&&area(clip)>1e-6}
  function boundaryLatticePoints(poly){const n=poly.length;let B=0;for(let i=0;i<n;i++){const a=poly[i],b=poly[(i+1)%n];B+=gcd(b.x-a.x,b.y-a.y)-1}return B+n}
  function pickTheorem(poly){const B=boundaryLatticePoints(poly),polyArea=area(poly),I=polyArea-B/2+1;return {I,B,area:polyArea}}
  function metrics(poly,isLatticePoly,latticeSpacePoly){
    const n=poly.length,r=reflexCount(poly),hull=convexHull(poly),hullArea=area(hull),polyArea=area(poly);
    const concavityRatio=hullArea>0?(hullArea-polyArea)/hullArea:0, starShaped=isStarShaped(poly), angleSum=exteriorAngleSum(poly), decompositionBound=r+1;
    const result={n,r,concavityRatio,starShaped,angleSum,decompositionBound};
    if(isLatticePoly&&latticeSpacePoly)result.pick=pickTheorem(latticeSpacePoly);
    return result;
  }

  function build(){
    if(vertices.length<3){model={sourcePolygon:{vertices,isLatticeSeed:mode==='lattice'},folds:[]};return}
    const n=vertices.length,k=Math.floor(n/2),folds=[];
    for(let i=0;i<n;i++){
      const edge=(i+k)%n, crease={a:vertices[i],b:mid(vertices[edge],vertices[(edge+1)%n]),vertexIndex:i,midpointEdgeIndex:edge};
      for(const direction of ['+','-']){
        const chain=[];for(let s=1;s<=k;s++)chain.push((i+(direction==='+'?s:-s)+n*2)%n);
        const reflections=chain.map((sourceVertexIndex,j)=>{
          const point=reflect(vertices[sourceVertexIndex],crease.a,crease.b);
          const insertions=vertices.map((_,e)=>{
            const poly=vertices.slice(0,e+1).concat([point],vertices.slice(e+1));
            const self=intersections(poly), simpleValue=simple(poly), deg=poly.some((a,z)=>dist(a,poly[(z+1)%poly.length])<1e-5);
            return {edgeIndex:e,polygonVertices:poly,isSimple:simpleValue,selfIntersectionCount:self,isDegenerate:deg,isConvex:convex(poly),area:area(poly),perimeter:perimeter(poly),orientationPreserved:Math.sign(signedArea(poly))===Math.sign(signedArea(vertices)),metrics:metrics(poly,false)};
          });
          return {reflectedIndex:j,sourceVertexIndex,reflectedPoint:point,locationClass:inside(point,vertices),insertions};
        });
        folds.push({creaseIndex:i,direction,crease,chainVertices:chain,reflections});
      }
    }
    const isLatticeSeed=mode==='lattice'&&vertices.every(p=>p.lat);
    const latticeSpaceVertices=isLatticeSeed?vertices.map(p=>p.lat):undefined;
    const sourcePolygon={vertices,isLatticeSeed,metrics:metrics(vertices,isLatticeSeed,latticeSpaceVertices)};
    if(isLatticeSeed)sourcePolygon.latticeSpaceVertices=latticeSpaceVertices;
    model={sourcePolygon,folds};
  }
  function el(tag,attrs={},text=''){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;return e}
  function drawLatticeGrid(g){
    if(mode!=='lattice'||!latticeOrigin||selected||selectedInsertion)return;
    if(!document.getElementById('showLatticeGrid').checked)return;
    const vb=svg.viewBox.baseVal;
    const x0=Math.floor((vb.x-latticeOrigin.x)/latticeSpacing)-1, x1=Math.ceil((vb.x+vb.width-latticeOrigin.x)/latticeSpacing)+1;
    const y0=Math.floor((vb.y-latticeOrigin.y)/latticeSpacing)-1, y1=Math.ceil((vb.y+vb.height-latticeOrigin.y)/latticeSpacing)+1;
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const r2=x*x+y*y, eligible=r2>=minRadius*minRadius&&r2<=maxRadius*maxRadius, p=toPixel({x,y});
      g.append(el('circle',{cx:p.x,cy:p.y,r:eligible?3:1.4,fill:eligible?'var(--work-surface-idle)':'var(--soft-line)',opacity:eligible?.85:.3,'pointer-events':'none'}));
    }
  }
  function draw(){svg.replaceChildren();const all=vertices.concat(model?model.folds.flatMap(f=>f.reflections.map(r=>r.reflectedPoint)):[]);if(!all.length){svg.setAttribute('viewBox','0 0 1000 700');status.textContent='Click the canvas to place vertices.';summary.textContent='No polygon yet';if(mode==='lattice'){const g=el('g');svg.append(g);drawLatticeGrid(g)}return}if(!closed){svg.setAttribute('viewBox','0 0 1000 700')}else{const minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y)),pad=50;svg.setAttribute('viewBox',`${minX-pad} ${minY-pad} ${Math.max(200,maxX-minX+pad*2)} ${Math.max(160,maxY-minY+pad*2)}`)}const g=el('g');svg.append(g);drawLatticeGrid(g);if(model){for(const f of model.folds){const c=f.crease,active=selected&&selected.fold===f,dim=selected&&!active,foldColor=f.direction==='+'?colors.plus:colors.minus;if(document.getElementById('showCreases').checked){g.append(el('line',{x1:c.a.x,y1:c.a.y,x2:c.b.x,y2:c.b.y,stroke:active?foldColor:colors.crease,'stroke-width':active?3.2:1.2,'stroke-dasharray':active?'none':'7 5',opacity:dim?.18:active?1:.75}));if(active&&document.getElementById('showLabels').checked)g.append(el('text',{x:c.a.x+10,y:c.a.y-12,fill:foldColor,'font-size':13,'font-weight':'700','font-family':'"DM Mono",monospace'},`F${f.creaseIndex}${f.direction}`))}if(document.getElementById('showMidpoints').checked)g.append(el('circle',{cx:c.b.x,cy:c.b.y,r:active?5:3,fill:active?foldColor:colors.mid,opacity:dim?.25:1}));if(document.getElementById('showChains').checked){const chain=f.chainVertices.map(i=>vertices[i]);g.append(el('polyline',{points:chain.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:foldColor,'stroke-width':active?6:3,opacity:dim?.12:active?.8:.42}))}if(document.getElementById('showReflections').checked)f.reflections.forEach(r=>{const p=r.reflectedPoint,sel=active&&selected.reflection===r;g.append(el('circle',{cx:p.x,cy:p.y,r:sel?7:active?5:4,fill:foldColor,stroke:sel?colors.selected:'var(--neutral-surface-bg)','stroke-width':sel?3:1,cursor:'pointer',opacity:dim?.18:1}));const node=g.lastChild;node.addEventListener('click',()=>select(f,r))})}}if(document.getElementById('showCandidates').checked&&selectedInsertion)g.append(el('polygon',{points:selectedInsertion.polygonVertices.map(p=>`${p.x},${p.y}`).join(' '),fill:'color-mix(in srgb,var(--work-surface-idle) 14%,transparent)',stroke:colors.selected,'stroke-width':2}));if(document.getElementById('showPolygon').checked&&vertices.length>1)g.append(el(closed?'polygon':'polyline',{points:vertices.map(p=>`${p.x},${p.y}`).join(' '),fill:closed?'color-mix(in srgb,var(--work-surface-idle) 10%,transparent)':'none',stroke:colors.polygon,'stroke-width':2}));vertices.forEach((p,i)=>{const sourceVertex=selected&&selected.reflection.sourceVertexIndex===i,creaseVertex=selected&&selected.fold.crease.vertexIndex===i,activeVertex=sourceVertex||creaseVertex,sourceColor=selected?.fold.direction==='+'?colors.plus:colors.minus;const c=el('circle',{cx:p.x,cy:p.y,r:sourceVertex?10:creaseVertex?8:6,fill:sourceVertex?sourceColor:creaseVertex?'var(--work-surface-relation)':colors.polygon,stroke:sourceVertex?colors.selected:creaseVertex?sourceColor:'var(--neutral-surface-bg)','stroke-width':sourceVertex?3:creaseVertex?2:2,cursor:'grab'});c.addEventListener('pointerdown',e=>{drag=i;svg.setPointerCapture(e.pointerId);e.stopPropagation()});g.append(c);if(document.getElementById('showLabels').checked){g.append(el('text',{x:p.x+9,y:p.y-9,fill:colors.text,'font-size':12,'font-family':'"DM Mono",monospace'},`V${i}`));if(sourceVertex)g.append(el('text',{x:p.x+9,y:p.y+7,fill:sourceColor,'font-size':10,'font-weight':'700','font-family':'"DM Mono",monospace'},'reflecting'))}});if(document.getElementById('showLabels').checked&&closed)for(let i=0;i<vertices.length;i++){const m=mid(vertices[i],vertices[(i+1)%vertices.length]);g.append(el('text',{x:m.x+4,y:m.y+4,fill:colors.muted,'font-size':10,'font-family':'"DM Mono",monospace'},`E${i}`))}status.innerHTML=closed?`<strong>${vertices.length}-gon</strong> · ${model.folds.length} folds · ${model.folds.reduce((s,f)=>s+f.reflections.length,0)} reflected candidates`:`${vertices.length} vertices · click Close polygon when ready`;summary.textContent=closed?`${vertices.length}-gon · ${model.folds.length} folds`:`${vertices.length} vertices`}
  function select(f,r){selected={fold:f,reflection:r};selectedInsertion=null;renderBrowser();draw()}
  function renderMetrics(){
    const metricsPanel=document.getElementById('metricsPanel');
    if(!model||!model.sourcePolygon.metrics){metricsPanel.innerHTML='No polygon yet';return}
    const m=model.sourcePolygon.metrics, angleOk=Math.abs(Math.abs(m.angleSum)-360)<1e-3;
    let html=`n=${m.n} · r=${m.r} · concavity ${(m.concavityRatio*100).toFixed(1)}% · star-shaped ${m.starShaped?'yes':'no'} · decomposition &le;${m.decompositionBound}<br>angle sum ${m.angleSum.toFixed(2)}&deg; <span style="color:${angleOk?'var(--work-surface-idle)':'var(--critical)'}">${angleOk?'✓':'✗'}</span>`;
    if(m.pick){const check=Math.abs(m.pick.area-(m.pick.I+m.pick.B/2-1))<1e-6;html+=`<br>Pick: I=${m.pick.I} · B=${m.pick.B} · Area=${m.pick.area} <span style="color:${check?'var(--work-surface-idle)':'var(--critical)'}">${check?'✓ Area = I + B/2 - 1':'✗ mismatch'}</span>`}
    metricsPanel.innerHTML=html;
  }
  function renderBrowser(){const inspectPanel=document.getElementById('inspectPanel');if(!model){browser.innerHTML='<div class="empty">Close a polygon to generate folds and reflected-point candidates.</div>';inspectPanel.className='empty';inspectPanel.textContent='Select a reflected-point tile to inspect its insertion opportunities.';return}const groups=['+','-'].map(dir=>model.folds.filter(f=>f.direction===dir));browser.innerHTML='';['+','-'].forEach((dir,di)=>{const details=document.createElement('details');details.className='fold';details.open=!!selected;details.innerHTML=`<summary>F${dir} folds · ${groups[di].length} creases</summary><div class="tiles"></div>`;const tiles=details.querySelector('.tiles');groups[di].forEach(f=>f.reflections.forEach(r=>{const b=document.createElement('button');b.className='tile'+(selected&&selected.fold===f&&selected.reflection===r?' selected':'');b.innerHTML=`<span class="dot" style="background:${dir==='+'?colors.plus:colors.minus}"></span><strong>F${f.creaseIndex}${dir} · V${r.sourceVertexIndex}</strong><span class="meta">X(${f.creaseIndex},${r.reflectedIndex},${dir}) · ${r.locationClass} · ${r.insertions.filter(x=>x.isSimple&&!x.isDegenerate).length}/${r.insertions.length} valid</span>`;b.onclick=()=>select(f,r);tiles.append(b)}));browser.append(details)});if(selected){const f=selected.fold,r=selected.reflection,box=document.createElement('div');box.className='';box.innerHTML=`<h3>Inspect F${f.creaseIndex}${f.direction} · V${r.sourceVertexIndex}</h3><p>Vertex V${r.sourceVertexIndex} is reflected across fold F${f.creaseIndex}${f.direction} (X${r.reflectedIndex}) · ${r.locationClass}. Select an original edge to preview P(i,j,e,${f.direction}).</p><div class="sortbar"><label>Sort <select id="sortKeySelect"><option value="default">default</option><option value="n">n</option><option value="r">r</option><option value="concavity">concavity</option></select></label><button id="sortDirBtn" type="button">${sortDir==='asc'?'↑':'↓'}</button><label class="check"><input type="checkbox" id="filterStarCheck"${filterStar?' checked':''}> star-shaped only</label><label class="check"><input type="checkbox" id="filterConvexCheck"${filterConvex?' checked':''}> convex only</label></div><div class="insertions"></div>`;const grid=box.querySelector('.insertions');const sortKeySelect=box.querySelector('#sortKeySelect');sortKeySelect.value=sortKey;sortKeySelect.onchange=e=>{sortKey=e.target.value;renderBrowser()};box.querySelector('#sortDirBtn').onclick=()=>{sortDir=sortDir==='asc'?'desc':'asc';renderBrowser()};box.querySelector('#filterStarCheck').onchange=e=>{filterStar=e.target.checked;renderBrowser()};box.querySelector('#filterConvexCheck').onchange=e=>{filterConvex=e.target.checked;renderBrowser()};let list=r.insertions.slice();if(filterStar)list=list.filter(x=>x.metrics.starShaped);if(filterConvex)list=list.filter(x=>x.isConvex);if(sortKey!=='default'){const keyFn={n:x=>x.metrics.n,r:x=>x.metrics.r,concavity:x=>x.metrics.concavityRatio}[sortKey];list.sort((a,b)=>(keyFn(a)-keyFn(b))*(sortDir==='asc'?1:-1))}list.forEach(ins=>{const b=document.createElement('button');const cls=ins.isDegenerate?'amber':ins.isSimple?'good':'bad';b.className=`insertion ${cls}${selectedInsertion===ins?' active':''}`;b.innerHTML=`<strong>E${ins.edgeIndex} · ${ins.isSimple&&!ins.isDegenerate?'valid':'invalid'}</strong><span>A ${(ins.area/100).toFixed(3)} · P ${(ins.perimeter/100).toFixed(3)}<br>${ins.isConvex?'convex':'concave'} · ${ins.selfIntersectionCount} crossings<br>r=${ins.metrics.r} · concavity ${(ins.metrics.concavityRatio*100).toFixed(1)}%</span>`;b.onclick=()=>{selectedInsertion=ins;document.getElementById('showCandidates').checked=true;renderBrowser();draw()};grid.append(b)});inspectPanel.className='inspect';inspectPanel.replaceChildren(...box.children);}}
  function snapshot(){history.push({vertices:vertices.map(p=>({...p})),closed});if(history.length>40)history.shift()}

  // --- Lattice-Seed commit pipeline (manual click + randomize share this) ---
  function commitLatticePoints(latPoints){
    let pts=latPoints;
    if(convexHullOnly)pts=convexHull(pts);
    pts=collinearFilter(angularSort(pts));
    vertices=pts.map(lp=>({...toPixel(lp),lat:lp}));
    closed=true;build();selected=null;selectedInsertion=null;renderBrowser();renderMetrics();
    if(vertices.length<3)browser.innerHTML='<div class="empty">Add at least three vertices to generate folds and reflected-point candidates.</div>';
    draw();fitViewport();
  }

  document.getElementById('drawBtn').onclick=()=>{closed=false;hud.textContent='Click to place vertices.';draw()};document.getElementById('closeBtn').onclick=()=>{if(vertices.length>=3){closed=true;build();renderBrowser();renderMetrics();draw()}};document.getElementById('clearBtn').onclick=()=>{snapshot();vertices=[];closed=false;model=null;selected=null;selectedInsertion=null;renderBrowser();renderMetrics();draw()};document.getElementById('undoBtn').onclick=()=>{const s=history.pop();if(s){vertices=s.vertices;closed=s.closed;build();renderBrowser();renderMetrics();draw()}};document.getElementById('demoBtn').onclick=()=>{snapshot();mode='freeform';document.getElementById('modeFreeformBtn').classList.add('primary');document.getElementById('modeLatticeBtn').classList.remove('primary');document.getElementById('latticeSection').hidden=true;vertices=[{x:150,y:130},{x:330,y:80},{x:500,y:150},{x:410,y:245},{x:500,y:360},{x:300,y:315},{x:180,y:390},{x:230,y:250}];closed=true;build();renderBrowser();renderMetrics();draw()};document.getElementById('clearSelection').onclick=()=>{selected=null;selectedInsertion=null;renderBrowser();draw()};['showPolygon','showLabels','showMidpoints','showCreases','showChains','showReflections','showCandidates','showLatticeGrid'].forEach(id=>document.getElementById(id).addEventListener('change',draw));

  // --- Mode toggle ---
  function switchMode(next){
    if(next===mode)return;
    if(vertices.length&&!window.confirm('Switch mode? This clears the current polygon.'))return;
    if(vertices.length)snapshot();
    vertices=[];closed=true;model=null;selected=null;selectedInsertion=null;mode=next;
    document.getElementById('modeFreeformBtn').classList.toggle('primary',mode==='freeform');
    document.getElementById('modeLatticeBtn').classList.toggle('primary',mode==='lattice');
    document.getElementById('latticeSection').hidden=mode!=='lattice';
    if(mode==='lattice')initLatticeOrigin();
    build();renderBrowser();renderMetrics();
    browser.innerHTML='<div class="empty">Add at least three vertices to generate folds and reflected-point candidates.</div>';
    draw();fitViewport();
  }
  document.getElementById('modeFreeformBtn').onclick=()=>switchMode('freeform');
  document.getElementById('modeLatticeBtn').onclick=()=>switchMode('lattice');

  // --- Theme toggle (Hrifa shared design tokens) ---
  const THEME_STORAGE_KEY='hrifa-polygon-fold-explorer-theme-v1';
  function applyTheme(dark){document.documentElement.setAttribute('data-theme',dark?'dark':'light');const btn=document.getElementById('themeButton');if(btn){btn.setAttribute('aria-pressed',String(dark));btn.textContent=dark?'Light':'Dark'}}
  function setTheme(dark){applyTheme(dark);try{localStorage.setItem(THEME_STORAGE_KEY,String(dark))}catch{}}
  function restoreTheme(){let dark=false;try{const saved=localStorage.getItem(THEME_STORAGE_KEY);dark=saved===null?matchMedia('(prefers-color-scheme: dark)').matches:saved==='true'}catch{}applyTheme(dark)}
  document.getElementById('themeButton').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme!=='dark'));
  restoreTheme();
  const latticeSpacingInput=document.getElementById('latticeSpacingInput'), minRadiusInput=document.getElementById('minRadiusInput'), maxRadiusInput=document.getElementById('maxRadiusInput'), convexHullOnlyInput=document.getElementById('convexHullOnly'), randomizeNInput=document.getElementById('randomizeNInput');
  latticeSpacingInput.oninput=()=>{latticeSpacing=Number(latticeSpacingInput.value)||40;if(mode==='lattice'&&vertices.length){vertices=vertices.map(v=>({...toPixel(v.lat),lat:v.lat}));build();renderBrowser();renderMetrics()}draw()};
  minRadiusInput.oninput=()=>{minRadius=Number(minRadiusInput.value)||0;draw()};
  maxRadiusInput.oninput=()=>{maxRadius=Math.max(1,Number(maxRadiusInput.value)||1);draw()};
  convexHullOnlyInput.onchange=()=>{convexHullOnly=convexHullOnlyInput.checked};
  document.getElementById('randomizeBtn').onclick=()=>{
    if(mode!=='lattice')return;
    if(!latticeOrigin)initLatticeOrigin();
    if(vertices.length)snapshot();
    const n=Math.max(3,Number(randomizeNInput.value)||6), pool=eligiblePoints(), sampled=[];
    for(let i=0;i<Math.min(n,pool.length);i++){const idx=Math.floor(Math.random()*pool.length);sampled.push(pool.splice(idx,1)[0])}
    commitLatticePoints(sampled);
  };

  svg.addEventListener('pointermove',e=>{
    if(drag===null)return;
    let p=pointAt(e);
    if(mode==='lattice'){const lp=nearestEligibleLatticePoint(p);if(!lp)return;p=toPixel(lp);vertices[drag]={...p,lat:lp}}else{vertices[drag]=p}
    selected=null;selectedInsertion=null;build();renderBrowser();renderMetrics();draw();
  });
  ['pointerup','pointercancel'].forEach(type=>svg.addEventListener(type,()=>{drag=null}));function pointAt(e){const r=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal,scale=Math.min(r.width/vb.width,r.height/vb.height),offsetX=(r.width-vb.width*scale)/2,offsetY=(r.height-vb.height*scale)/2;return{x:vb.x+(e.clientX-r.left-offsetX)/scale,y:vb.y+(e.clientY-r.top-offsetY)/scale}}window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();document.getElementById('undoBtn').click()}});draw();renderMetrics();
  // Live polygon mode: every canvas click appends a vertex (freeform) or a
  // snapped lattice point (lattice-seed) and immediately rebuilds the
  // closed polygon and its derived fold/reflection model.
  closed=true;
  document.getElementById('clearBtn').onclick=()=>{
    snapshot();
    vertices=[];
    closed=true;
    model=null;
    selected=null;
    selectedInsertion=null;
    renderBrowser();
    renderMetrics();
    if(vertices.length<3)browser.innerHTML='<div class="empty">Add at least three vertices to generate folds and reflected-point candidates.</div>';
    draw();
  };
  svg.addEventListener('pointerdown',e=>{
    if(e.target!==svg)return;
    if(mode==='lattice'){
      if(!latticeOrigin)initLatticeOrigin();
      const p=pointAt(e), lp=nearestEligibleLatticePoint(p);
      if(!lp)return;
      if(vertices.some(v=>v.lat.x===lp.x&&v.lat.y===lp.y))return;
      snapshot();
      commitLatticePoints(vertices.map(v=>v.lat).concat([lp]));
      if(vertices.length<3){
        status.textContent=`${vertices.length} vertices · add ${3-vertices.length} more to generate folds`;
        summary.textContent=`${vertices.length} vertices · lattice seed`;
      }
      return;
    }
    snapshot();
    vertices.push(pointAt(e));
    closed=true;
    build();
    selected=null;
    selectedInsertion=null;
    renderBrowser();
    renderMetrics();
    if(vertices.length<3)browser.innerHTML='<div class="empty">Add at least three vertices to generate folds and reflected-point candidates.</div>';
    draw();
    fitViewport();
    if(vertices.length<3){
      status.textContent=`${vertices.length} vertices · add ${3-vertices.length} more to generate folds`;
      summary.textContent=`${vertices.length} vertices · live polygon`
    }
  });
  function fitViewport(){
    const all=vertices.concat(model?model.folds.flatMap(f=>f.reflections.map(r=>r.reflectedPoint)):[]);
    if(!all.length){svg.setAttribute('viewBox','0 0 1000 700');return}
    const pad=50,minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
    const left=Math.min(0,minX-pad),top=Math.min(0,minY-pad),right=Math.max(1000,maxX+pad),bottom=Math.max(700,maxY+pad);
    svg.setAttribute('viewBox',`${left} ${top} ${right-left} ${bottom-top}`);
    scaleCanvasText()
  }
  function scaleCanvasText(){
    const vb=svg.viewBox.baseVal,scale=Math.max(1,vb.width/1000,vb.height/700);
    svg.querySelectorAll('text').forEach(text=>{
      const base=Number(text.dataset.baseSize||text.getAttribute('font-size')||12);
      text.dataset.baseSize=base;
      text.setAttribute('font-size',base*scale)
    });
    svg.querySelectorAll('circle').forEach(circle=>{
      const base=Number(circle.dataset.baseRadius||circle.getAttribute('r')||0);
      circle.dataset.baseRadius=base;
      circle.setAttribute('r',base*scale)
    });
    svg.querySelectorAll('line,polyline,polygon').forEach(shape=>{
      const base=Number(shape.dataset.baseStrokeWidth||shape.getAttribute('stroke-width')||0);
      if(base){
        shape.dataset.baseStrokeWidth=base;
        shape.setAttribute('stroke-width',base*scale)
      }
    })
  }
  fitViewport();
  svg.addEventListener('pointermove',fitViewport);
  ['showPolygon','showLabels','showMidpoints','showCreases','showChains','showReflections','showCandidates','showLatticeGrid'].forEach(id=>{
    ['input','change'].forEach(type=>document.getElementById(id).addEventListener(type,fitViewport));
  });
  ['undoBtn','clearBtn','demoBtn','clearSelection'].forEach(id=>document.getElementById(id).addEventListener('click',fitViewport));
})();
