(()=>{
  const svg=document.getElementById('canvas'), browser=document.getElementById('browser'), status=document.getElementById('status'), summary=document.getElementById('summary'), hud=document.getElementById('hud');
  const colors={polygon:'#74b9ff',crease:'#c4a7ff',mid:'#6f7d91',plus:'#f2994a',minus:'#55d6be',selected:'#f0d5ff',text:'#e8eaf0',muted:'#9aa3b2'};
  let vertices=[],closed=true,history=[],model=null,selected=null,selectedInsertion=null,drag=null;
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
  function build(){if(vertices.length<3){model={sourcePolygon:{vertices},folds:[]};return}const n=vertices.length,k=Math.floor(n/2),folds=[];for(let i=0;i<n;i++){const edge=(i+k)%n, crease={a:vertices[i],b:mid(vertices[edge],vertices[(edge+1)%n]),vertexIndex:i,midpointEdgeIndex:edge};for(const direction of ['+','-']){const chain=[];for(let s=1;s<=k;s++)chain.push((i+(direction==='+'?s:-s)+n*2)%n);const reflections=chain.map((sourceVertexIndex,j)=>{const point=reflect(vertices[sourceVertexIndex],crease.a,crease.b);const insertions=vertices.map((_,e)=>{const poly=vertices.slice(0,e+1).concat([point],vertices.slice(e+1));const self=intersections(poly), simpleValue=simple(poly), deg=poly.some((a,z)=>dist(a,poly[(z+1)%poly.length])<1e-5);return {edgeIndex:e,polygonVertices:poly,isSimple:simpleValue,selfIntersectionCount:self,isDegenerate:deg,isConvex:convex(poly),area:area(poly),perimeter:perimeter(poly),orientationPreserved:Math.sign(signedArea(poly))===Math.sign(signedArea(vertices))}});return {reflectedIndex:j,sourceVertexIndex,reflectedPoint:point,locationClass:inside(point,vertices),insertions}});folds.push({creaseIndex:i,direction,crease,chainVertices:chain,reflections})}}model={sourcePolygon:{vertices},folds};
  }
  function el(tag,attrs={},text=''){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;return e}
  function draw(){svg.replaceChildren();const all=vertices.concat(model?model.folds.flatMap(f=>f.reflections.map(r=>r.reflectedPoint)):[]);if(!all.length){svg.setAttribute('viewBox','0 0 1000 700');status.textContent='Click the canvas to place vertices.';summary.textContent='No polygon yet';return}if(!closed){svg.setAttribute('viewBox','0 0 1000 700')}else{const minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y)),pad=50;svg.setAttribute('viewBox',`${minX-pad} ${minY-pad} ${Math.max(200,maxX-minX+pad*2)} ${Math.max(160,maxY-minY+pad*2)}`)}const g=el('g');svg.append(g);if(model){for(const f of model.folds){const c=f.crease,active=selected&&selected.fold===f,dim=selected&&!active,foldColor=f.direction==='+'?colors.plus:colors.minus;if(document.getElementById('showCreases').checked){g.append(el('line',{x1:c.a.x,y1:c.a.y,x2:c.b.x,y2:c.b.y,stroke:active?foldColor:colors.crease,'stroke-width':active?3.2:1.2,'stroke-dasharray':active?'none':'7 5',opacity:dim?.18:active?1:.75}));if(active&&document.getElementById('showLabels').checked)g.append(el('text',{x:c.a.x+10,y:c.a.y-12,fill:foldColor,'font-size':13,'font-weight':'700'},`F${f.creaseIndex}${f.direction}`))}if(document.getElementById('showMidpoints').checked)g.append(el('circle',{cx:c.b.x,cy:c.b.y,r:active?5:3,fill:active?foldColor:colors.mid,opacity:dim?.25:1}));if(document.getElementById('showChains').checked){const chain=f.chainVertices.map(i=>vertices[i]);g.append(el('polyline',{points:chain.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:foldColor,'stroke-width':active?6:3,opacity:dim?.12:active?.8:.42}))}if(document.getElementById('showReflections').checked)f.reflections.forEach(r=>{const p=r.reflectedPoint,sel=active&&selected.reflection===r;g.append(el('circle',{cx:p.x,cy:p.y,r:sel?7:active?5:4,fill:foldColor,stroke:sel?colors.selected:'#0f1115','stroke-width':sel?3:1,cursor:'pointer',opacity:dim?.18:1}));const node=g.lastChild;node.addEventListener('click',()=>select(f,r))})}}if(document.getElementById('showCandidates').checked&&selectedInsertion)g.append(el('polygon',{points:selectedInsertion.polygonVertices.map(p=>`${p.x},${p.y}`).join(' '),fill:'rgba(155,226,143,.12)',stroke:colors.selected,'stroke-width':2}));if(document.getElementById('showPolygon').checked&&vertices.length>1)g.append(el(closed?'polygon':'polyline',{points:vertices.map(p=>`${p.x},${p.y}`).join(' '),fill:closed?'rgba(116,185,255,.08)':'none',stroke:colors.polygon,'stroke-width':2}));vertices.forEach((p,i)=>{const sourceVertex=selected&&selected.reflection.sourceVertexIndex===i,creaseVertex=selected&&selected.fold.crease.vertexIndex===i,activeVertex=sourceVertex||creaseVertex,sourceColor=selected?.fold.direction==='+'?colors.plus:colors.minus;const c=el('circle',{cx:p.x,cy:p.y,r:sourceVertex?10:creaseVertex?8:6,fill:sourceVertex?sourceColor:creaseVertex?'#27303b':colors.polygon,stroke:sourceVertex?colors.selected:creaseVertex?sourceColor:'#0f1115','stroke-width':sourceVertex?3:creaseVertex?2:2,cursor:'grab'});c.addEventListener('pointerdown',e=>{drag=i;svg.setPointerCapture(e.pointerId);e.stopPropagation()});g.append(c);if(document.getElementById('showLabels').checked){g.append(el('text',{x:p.x+9,y:p.y-9,fill:colors.text,'font-size':12},`V${i}`));if(sourceVertex)g.append(el('text',{x:p.x+9,y:p.y+7,fill:sourceColor,'font-size':10,'font-weight':'700'},'reflecting'))}});if(document.getElementById('showLabels').checked&&closed)for(let i=0;i<vertices.length;i++){const m=mid(vertices[i],vertices[(i+1)%vertices.length]);g.append(el('text',{x:m.x+4,y:m.y+4,fill:colors.muted,'font-size':10},`E${i}`))}status.innerHTML=closed?`<strong>${vertices.length}-gon</strong> · ${model.folds.length} folds · ${model.folds.reduce((s,f)=>s+f.reflections.length,0)} reflected candidates`:`${vertices.length} vertices · click Close polygon when ready`;summary.textContent=closed?`${vertices.length}-gon · ${model.folds.length} folds`:`${vertices.length} vertices`}
  function select(f,r){selected={fold:f,reflection:r};selectedInsertion=null;renderBrowser();draw()}
  function renderBrowser(){const inspectPanel=document.getElementById('inspectPanel');if(!model){browser.innerHTML='<div class="empty">Close a polygon to generate folds and reflected-point candidates.</div>';inspectPanel.className='empty';inspectPanel.textContent='Select a reflected-point tile to inspect its insertion opportunities.';return}const groups=['+','-'].map(dir=>model.folds.filter(f=>f.direction===dir));browser.innerHTML='';['+','-'].forEach((dir,di)=>{const details=document.createElement('details');details.className='fold';details.open=!!selected;details.innerHTML=`<summary>F${dir} folds · ${groups[di].length} creases</summary><div class="tiles"></div>`;const tiles=details.querySelector('.tiles');groups[di].forEach(f=>f.reflections.forEach(r=>{const b=document.createElement('button');b.className='tile'+(selected&&selected.fold===f&&selected.reflection===r?' selected':'');b.innerHTML=`<span class="dot" style="background:${dir==='+'?colors.plus:colors.minus}"></span><strong>F${f.creaseIndex}${dir} · V${r.sourceVertexIndex}</strong><span class="meta">X(${f.creaseIndex},${r.reflectedIndex},${dir}) · ${r.locationClass} · ${r.insertions.filter(x=>x.isSimple&&!x.isDegenerate).length}/${r.insertions.length} valid</span>`;b.onclick=()=>select(f,r);tiles.append(b)}));browser.append(details)});if(selected){const f=selected.fold,r=selected.reflection,box=document.createElement('div');box.className='';box.innerHTML=`<h3>Inspect F${f.creaseIndex}${f.direction} · V${r.sourceVertexIndex}</h3><p>Vertex V${r.sourceVertexIndex} is reflected across fold F${f.creaseIndex}${f.direction} (X${r.reflectedIndex}) · ${r.locationClass}. Select an original edge to preview P(i,j,e,${f.direction}).</p><div class="insertions"></div>`;const grid=box.querySelector('.insertions');r.insertions.forEach(ins=>{const b=document.createElement('button');const cls=ins.isDegenerate?'amber':ins.isSimple?'good':'bad';b.className=`insertion ${cls}${selectedInsertion===ins?' active':''}`;b.innerHTML=`<strong>E${ins.edgeIndex} · ${ins.isSimple&&!ins.isDegenerate?'valid':'invalid'}</strong><span>A ${(ins.area/100).toFixed(3)} · P ${(ins.perimeter/100).toFixed(3)}<br>${ins.isConvex?'convex':'concave'} · ${ins.selfIntersectionCount} crossings</span>`;b.onclick=()=>{selectedInsertion=ins;document.getElementById('showCandidates').checked=true;renderBrowser();draw()};grid.append(b)});inspectPanel.className='inspect';inspectPanel.replaceChildren(...box.children);}}
  function snapshot(){history.push({vertices:vertices.map(p=>({...p})),closed});if(history.length>40)history.shift()}
  document.getElementById('drawBtn').onclick=()=>{closed=false;hud.textContent='Click to place vertices.';draw()};document.getElementById('closeBtn').onclick=()=>{if(vertices.length>=3){closed=true;build();renderBrowser();draw()}};document.getElementById('clearBtn').onclick=()=>{snapshot();vertices=[];closed=false;model=null;selected=null;selectedInsertion=null;renderBrowser();draw()};document.getElementById('undoBtn').onclick=()=>{const s=history.pop();if(s){vertices=s.vertices;closed=s.closed;build();renderBrowser();draw()}};document.getElementById('demoBtn').onclick=()=>{snapshot();vertices=[{x:150,y:130},{x:330,y:80},{x:500,y:150},{x:410,y:245},{x:500,y:360},{x:300,y:315},{x:180,y:390},{x:230,y:250}];closed=true;build();renderBrowser();draw()};document.getElementById('clearSelection').onclick=()=>{selected=null;selectedInsertion=null;renderBrowser();draw()};['showPolygon','showLabels','showMidpoints','showCreases','showChains','showReflections','showCandidates'].forEach(id=>document.getElementById(id).addEventListener('change',draw));
  svg.addEventListener('pointerdown',e=>{if(e.target!==svg)return;const p=pointAt(e);if(!closed){snapshot();vertices.push(p);draw()}});svg.addEventListener('pointermove',e=>{if(drag===null)return;const p=pointAt(e);vertices[drag]=p;selected=null;selectedInsertion=null;build();renderBrowser();draw()});['pointerup','pointercancel'].forEach(type=>svg.addEventListener(type,()=>{drag=null}));function pointAt(e){const r=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal,scale=Math.min(r.width/vb.width,r.height/vb.height),offsetX=(r.width-vb.width*scale)/2,offsetY=(r.height-vb.height*scale)/2;return{x:vb.x+(e.clientX-r.left-offsetX)/scale,y:vb.y+(e.clientY-r.top-offsetY)/scale}}window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();document.getElementById('undoBtn').click()}});draw();
  // Live polygon mode: every canvas click appends a vertex and immediately
  // rebuilds the closed polygon and its derived fold/reflection model.
  closed=true;
  document.getElementById('clearBtn').onclick=()=>{
    snapshot();
    vertices=[];
    closed=true;
    model=null;
    selected=null;
    selectedInsertion=null;
    renderBrowser();
    if(vertices.length<3)browser.innerHTML='<div class="empty">Add at least three vertices to generate folds and reflected-point candidates.</div>';
    draw();
  };
  svg.addEventListener('pointerdown',e=>{
    if(e.target!==svg)return;
    snapshot();
    vertices.push(pointAt(e));
    closed=true;
    build();
    selected=null;
    selectedInsertion=null;
    renderBrowser();
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
  ['showPolygon','showLabels','showMidpoints','showCreases','showChains','showReflections','showCandidates'].forEach(id=>{
    ['input','change'].forEach(type=>document.getElementById(id).addEventListener(type,fitViewport));
  });
  ['undoBtn','clearBtn','demoBtn','clearSelection'].forEach(id=>document.getElementById(id).addEventListener('click',fitViewport));
})();
