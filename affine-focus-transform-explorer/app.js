(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const mod = (n, m) => ((n % m) + m) % m;
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  const nums = (value, m) => [...new Set(String(value).split(/[,\s]+/).map(Number).filter(Number.isFinite).map(n => mod(n, m)))].sort((a,b) => a-b);
  const key = set => [...set].sort((a,b) => a-b).join(",");
  const displaySet = set => `{${set.join(", ")}}`;
  const transform = (set, f, a, m, subtractFocus = false) => [...new Set(set.map(x => { const result = mod(f + a * (x - f), m); return subtractFocus ? mod(result - f, m) : result; }))].sort((x,y) => x-y);
  const setState = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  const state = { mode: "single", view: "graph", layout: "hierarchy", inspector: "set", selectedNode: "", selectedEdge: null, closure: null, family: [], dual: [], zoom: 1, panX: 0, panY: 0, computeMs: 0 };

  function params() {
    const m = Math.max(2, Math.min(96, Number($("#modulusInput").value) || 12));
    const a = mod(Number($("#multiplierInput").value) || 0, m);
    const multipliers = state.mode === "compare" ? nums($("#compareMultiplierInput").value, m) : [a];
    const subtractFocus = $("#subtractFocus").checked;
    const seed = nums($("#seedInput").value, m), focusDomain = $("#focusDomain").value;
    let foci = [...Array(m).keys()];
    if ($("#focusDomain").value === "seed") foci = seed;
    if (focusDomain === "current") foci = seed;
    if ($("#focusDomain").value === "custom") foci = nums($("#customFocusInput").value, m);
    return { m, a, multipliers: multipliers.length ? multipliers : [a], subtractFocus, seed, foci, focusDomain };
  }
  function family(p) {
    return p.foci.map(f => ({ f, set: transform(p.seed, f, p.a, p.m, p.subtractFocus), fixed: mod(f + p.a * (f-f), p.m) === f, identity: p.a === 1, collapse: p.a === 0 }));
  }
  function closure(p) {
    const maxNodes = 512, nodes = new Map(), edges = [], seedId = key(p.seed), queue = [{ id: seedId, set: p.seed, generation: 0 }];
    nodes.set(seedId, { id: seedId, set: p.seed, generation: 0, parents: [] });
    for (let i=0; i<queue.length; i++) {
      const current = queue[i];
      const nodeFoci = p.focusDomain === "current" ? current.set : p.foci;
      for (const a of p.multipliers) for (const f of nodeFoci) {
        const nextSet = transform(current.set, f, a, p.m, p.subtractFocus), id = key(nextSet);
        if (!nodes.has(id) && nodes.size >= maxNodes) continue;
        if (!nodes.has(id)) { nodes.set(id, { id, set: nextSet, generation: current.generation + 1, parents: [current.id] }); queue.push({ id, set: nextSet, generation: current.generation + 1 }); }
        else if (!nodes.get(id).parents.includes(current.id)) nodes.get(id).parents.push(current.id);
        edges.push({ from: current.id, to: id, f, a });
      }
    }
    const list = [...nodes.values()], maxGeneration = Math.max(...list.map(n => n.generation), 0);
    const edgeMap = new Map();
    edges.forEach(e => {
      const edgeKey = `${e.from}|${e.to}`;
      if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, { ...e, count: 0 });
      edgeMap.get(edgeKey).count++;
    });
    const uniqueEdges = [...edgeMap.values()];
    const safetyLimit = nodes.size >= maxNodes;
    return { nodes: list, edges: uniqueEdges, generations: [...Array(maxGeneration+1)].map((_,g) => list.filter(n => n.generation===g)), saturated: !safetyLimit, maxGeneration, terminationReason: safetyLimit ? `safety limit (${maxNodes} sets)` : "no new canonical sets" };
  }
  function scc(c) {
    let index=0; const stack=[], on=new Set(), indices=new Map(), low=new Map(), groups=[];
    function visit(v){ indices.set(v,index); low.set(v,index++); stack.push(v); on.add(v); c.edges.filter(e=>e.from===v).forEach(e=>{if(!indices.has(e.to)){visit(e.to);low.set(v,Math.min(low.get(v),low.get(e.to)))}else if(on.has(e.to))low.set(v,Math.min(low.get(v),indices.get(e.to)))}); if(low.get(v)===indices.get(v)){const group=[];let w;do{w=stack.pop();on.delete(w);group.push(w)}while(w!==v);groups.push(group)}}
    c.nodes.forEach(n=>{if(!indices.has(n.id))visit(n.id)}); return groups;
  }
  function compute() { const p=params(), started=performance.now(); state.family=family(p); state.closure=closure(p); state.computeMs=performance.now()-started; state.selectedNode=key(p.seed); state.selectedEdge=null; persist(); renderAll(); }
  function renderFamily() { $("#familyList").innerHTML = state.family.map(x => `<div class="family-card"><span>f = ${x.f}</span><span class="small">${displaySet(x.set)}</span></div>`).join("") || `<span class="muted">No foci selected.</span>`; }
  function positions(c, mode) { const width=$("#graphCanvas").clientWidth||700, height=$("#graphCanvas").clientHeight||610, out={}; if(mode==="radial"){const cx=width/2,cy=height/2,r=Math.min(width,height)*.36;c.nodes.forEach((n,i)=>{const t=i/Math.max(c.nodes.length,1)*Math.PI*2;out[n.id]={x:cx+Math.cos(t)*r,y:cy+Math.sin(t)*r}})}else if(mode==="scc"){const groups=scc(c);groups.forEach((group,gi)=>group.forEach((id,i)=>{out[id]={x:(gi+1)*width/(groups.length+1),y:70+(i+1)*Math.max(70,(height-120)/(group.length+1))}}))}else{const groups=c.generations;groups.forEach((g,gi)=>g.forEach((n,i)=>{out[n.id]={x:(i+1)*width/(g.length+1),y:75+gi*Math.max(90,(height-110)/Math.max(groups.length,1))}}))} return out; }
  function renderGraph() { const box=$("#graphCanvas"), c=state.closure; if(!c){return} const w=box.clientWidth||700,h=box.clientHeight||610,pos=positions(c,state.layout); let svg=`<svg class="graph-svg" viewBox="0 0 ${w} ${h}" role="img"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#ff8f70"/></marker></defs>`; if($("#showEdges").checked) c.edges.forEach(e=>{const a=pos[e.from],b=pos[e.to]; if(!a||!b)return; const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1; svg+=`<line class="edge-line" x1="${a.x+dx/len*22}" y1="${a.y+dy/len*22}" x2="${b.x-dx/len*22}" y2="${b.y-dy/len*22}" data-from="${e.from}" data-to="${e.to}" data-f="${e.f}"/><text class="edge-label" x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-5}">f${e.f}</text>`}); c.nodes.forEach(n=>{const p=pos[n.id], isSeed=n.generation===0, selected=n.id===state.selectedNode; svg+=`<g class="graph-node ${selected?'selected':''}" data-node="${n.id}"><circle class="node-shape ${isSeed?'seed-node':''} ${$("#animateGraph").checked?'pulse':''}" cx="${p.x}" cy="${p.y}" r="22"/><text class="node-label" x="${p.x}" y="${p.y+4}">${$("#showLabels").checked?n.set.join("·"):""}</text></g>`}); $("#graphCanvas").innerHTML=svg+"</svg>"; $$(".graph-node").forEach(el=>el.addEventListener("click",()=>{state.selectedNode=el.dataset.node;state.selectedEdge=null;state.inspector="set";renderAll()})); $$(".edge-line").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();state.selectedEdge={from:el.dataset.from,to:el.dataset.to,f:Number(el.dataset.f),a:params().a};state.inspector="transform";renderInspector()})); setState("#graphMeta",`${c.nodes.length} nodes · ${c.edges.length} transforms · ${c.maxGeneration} generations`); }
  function positions(c, mode) {
    const box = $("#graphCanvas"), baseWidth = box.clientWidth || 700, baseHeight = box.clientHeight || 610;
    const widest = Math.max(1, ...c.generations.map(g => g.length));
    const largestScc = mode === "scc" ? Math.max(1, ...scc(c).map(group => group.length)) : 0;
    const hierarchyRows = Math.max(1, ...c.generations.map(g => Math.ceil(Math.max(1,g.length) / 10)));
    const hierarchyColumns = Math.max(1, Math.ceil(widest / hierarchyRows));
    const hierarchyBand = Math.max(190, (hierarchyRows - 1) * 68 + 110);
    const width = mode === "hierarchy" ? Math.max(baseWidth, hierarchyColumns * 100 + 50) : baseWidth;
    const height = mode === "hierarchy" ? Math.max(baseHeight, c.generations.length * hierarchyBand + 70) : mode === "scc" ? Math.max(baseHeight, largestScc * 70 + 120) : baseHeight;
    const out = {};
    if (mode === "radial") {
      const cx=width/2, cy=height/2, r=Math.min(width,height)*.36;
      c.nodes.forEach((n,i)=>{const t=i/Math.max(c.nodes.length,1)*Math.PI*2;out[n.id]={x:cx+Math.cos(t)*r,y:cy+Math.sin(t)*r};});
    } else if (mode === "scc") {
      const groups=scc(c);
      const rowGap=Math.max(70,(height-120)/(largestScc+1));
      groups.forEach((group,gi)=>group.forEach((id,i)=>{out[id]={x:(gi+1)*width/(groups.length+1),y:70+(i+1)*rowGap};}));
    } else {
      c.generations.forEach((g,gi)=>{const rows=Math.max(1,Math.ceil(Math.max(1,g.length)/10)),columns=Math.ceil(g.length/rows);g.forEach((n,i)=>{const row=i%rows,column=Math.floor(i/rows),rowGap=68,bandTop=55+gi*hierarchyBand,bandHeight=(rows-1)*rowGap;out[n.id]={x:(column+1)*width/(columns+1),y:bandTop+((hierarchyBand-bandHeight)/2)+row*rowGap};});});
    }
    return { points: out, width, height };
  }
  function nodeLines(set) {
    const label=set.join("·");
    if(label.length<=10)return [label];
    const midpoint=Math.ceil(set.length/2);
    return [set.slice(0,midpoint).join("·"),set.slice(midpoint).join("·")];
  }
  function nodeBox(set) {
    const lines=nodeLines(set), longest=Math.max(...lines.map(line=>line.length));
    return {lines,width:Math.max(64,Math.min(112,longest*7+24)),height:lines.length===1?42:56};
  }
  function nodeEdgeDistance(set,ux,uy) {
    const box=nodeBox(set),halfWidth=box.width/2,halfHeight=box.height/2;
    const horizontal=Math.abs(ux)>0.0001?halfWidth/Math.abs(ux):Infinity;
    const vertical=Math.abs(uy)>0.0001?halfHeight/Math.abs(uy):Infinity;
    return Math.min(horizontal,vertical)+5;
  }
  function renderGraph() {
    const box=$("#graphCanvas"), c=state.closure; if(!c)return;
    const p=params(), multiplierColors=["#ff9a7d","#74b9ff","#9be28f","#c4a7ff","#f1d27a","#d993ff"];
    state.lastLayout=state.layout;
    const layout=positions(c,state.layout), pos=layout.points, w=layout.width, h=layout.height;
    let svg=`<svg class="graph-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="#ff9a7d"/></marker></defs><g class="graph-viewport" transform="translate(${state.panX} ${state.panY}) scale(${state.zoom})">`;
    if(state.layout==="scc"){
      const palette=["#c4a7ff","#74b9ff","#9be28f","#f1d27a","#ff8f70","#d993ff"];
      scc(c).forEach((group,i)=>{const points=group.map(id=>pos[id]).filter(Boolean);if(!points.length)return;const minX=Math.min(...points.map(p=>p.x))-42,maxX=Math.max(...points.map(p=>p.x))+42,minY=38,maxY=h-38,color=palette[i%palette.length];svg+=`<rect class="scc-box" x="${minX}" y="${minY}" width="${maxX-minX}" height="${maxY-minY}" rx="12" style="--scc-color:${color}"/><text class="scc-label" x="${minX+12}" y="${minY+18}" style="fill:${color}">SCC ${i+1} · ${group.length} set${group.length===1?"":"s"}</text>`;});
    }
    svg+=`<g class="edge-layer">`;
    const edgeGroups=new Map();c.edges.forEach(e=>{const groupKey=`${e.from}|${e.to}`;if(!edgeGroups.has(groupKey))edgeGroups.set(groupKey,[]);edgeGroups.get(groupKey).push(e);});
    if($("#showEdges").checked)c.edges.forEach(e=>{
      const a=pos[e.from],b=pos[e.to];if(!a||!b)return;
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      const ux=dx/len,uy=dy/len,startGap=nodeEdgeDistance(c.nodes.find(n=>n.id===e.from)?.set||[],ux,uy),endGap=nodeEdgeDistance(c.nodes.find(n=>n.id===e.to)?.set||[],-ux,-uy);
      const x1=a.x+ux*startGap,y1=a.y+uy*startGap,x2=b.x-ux*endGap,y2=b.y-uy*endGap;
      const group=edgeGroups.get(`${e.from}|${e.to}`),reverseGroup=edgeGroups.get(`${e.to}|${e.from}`);
      const reverseLane=reverseGroup&&reverseGroup.length?5:0,spread=reverseLane;
      const normalX=-dy/len,normalY=dx/len,mx=(x1+x2)/2+normalX*spread,my=(y1+y2)/2+normalY*spread;
      const path=`M ${x1+normalX*spread} ${y1+normalY*spread} L ${x2+normalX*spread} ${y2+normalY*spread}`;
      const bidirectional=Boolean(reverseGroup&&reverseGroup.length);
      const edgeSelected=state.selectedEdge&&state.selectedEdge.from===e.from&&state.selectedEdge.to===e.to&&state.selectedEdge.f===e.f&&state.selectedEdge.a===e.a;
      const edgeOutgoing=state.selectedNode&&e.from===state.selectedNode;
      const edgeIncoming=state.selectedNode&&e.to===state.selectedNode&&!edgeOutgoing;
      const edgeNeutral=state.selectedNode&&!edgeOutgoing&&!edgeIncoming;
      const stateClass=edgeSelected?"edge-selected":edgeOutgoing?"edge-outgoing":edgeIncoming?"edge-incoming":edgeNeutral?"edge-neutral":"";
      const directionClass=bidirectional?(e.from<e.to?"edge-bidirectional-solid":"edge-bidirectional-dashed"):"";
      const edgeClass=`edge-line ${stateClass} ${directionClass}`.trim();
      const labelClass=edgeIncoming?"edge-label edge-label-incoming":edgeOutgoing?"edge-label edge-label-outgoing":"edge-label";
      const edgeColor=multiplierColors[p.multipliers.indexOf(e.a)%multiplierColors.length],edgeStyle=`--multiplier-color:${edgeColor}`;
      const edgeLabel=e.count>1?`×${e.count}`:`a${e.a} · f${e.f}`;
      svg+=`<path class="${edgeClass}" style="${edgeStyle}" d="${path}" marker-end="url(#arrow)" data-from="${e.from}" data-to="${e.to}" data-f="${e.f}" data-a="${e.a}"/><path class="edge-hit" d="${path}" data-from="${e.from}" data-to="${e.to}" data-f="${e.f}" data-a="${e.a}"/><text class="${labelClass}" x="${mx}" y="${my-12}">${edgeLabel}</text>`;
    });
    svg+=`</g><g class="node-layer">`;
    c.nodes.forEach(n=>{const p=pos[n.id],isSeed=n.generation===0,selected=n.id===state.selectedNode,source=state.selectedEdge?.from===n.id||state.selectedNode===n.id,target=state.selectedEdge?.to===n.id||Boolean(state.selectedNode&&c.edges.some(e=>e.from===state.selectedNode&&e.to===n.id)),box=nodeBox(n.set),label=$("#showLabels").checked?box.lines.map((line,i)=>`<tspan x="${p.x}" dy="${i===0?box.lines.length===1?4:-7:14}">${line}</tspan>`).join(""):"";svg+=`<g class="graph-node ${selected?'selected ':''}${source?'source-node ':''}${target?'target-node':''}" data-node="${n.id}"><rect class="node-shape ${isSeed?'seed-node':''} ${$("#animateGraph").checked?'pulse':''}" x="${p.x-box.width/2}" y="${p.y-box.height/2}" width="${box.width}" height="${box.height}" rx="10"/><text class="node-label" x="${p.x}" y="${p.y}">${label}</text></g>`;});
    box.innerHTML=svg+"</g></g></svg>";
    const graphSvg=$(".graph-svg",box);graphSvg.style.width=`${w}px`;graphSvg.style.height=`${h}px`;graphSvg.setAttribute("draggable","false");
    $$(".graph-node").forEach(el=>el.addEventListener("click",()=>{if(box.dataset.dragMoved==="true"){box.dataset.dragMoved="false";return;}state.selectedNode=el.dataset.node;state.selectedEdge=null;state.inspector="set";renderAll();}));
    $$(".edge-hit").forEach(el=>{const line=el.previousElementSibling;el.addEventListener("mouseenter",()=>line?.classList.add("edge-hover"));el.addEventListener("mouseleave",()=>line?.classList.remove("edge-hover"));});
    $$(".edge-hit").forEach(el=>el.addEventListener("click",e=>{e.stopPropagation();if(box.dataset.dragMoved==="true"){box.dataset.dragMoved="false";return;}state.selectedNode="";state.selectedEdge={from:el.dataset.from,to:el.dataset.to,f:Number(el.dataset.f),a:Number(el.dataset.a)};state.inspector="transform";renderGraph();renderInspector();}));
    setState("#zoomReadout",`${Math.round(state.zoom*100)}%`);
    if(!state.zoomResetBound){$("#zoomReset").addEventListener("click",()=>{state.layout=state.lastLayout||"hierarchy";state.zoom=1;state.panX=0;state.panY=0;renderGraph();});state.zoomResetBound=true;}
    const updateZoom=(next,anchorX=box.clientWidth/2,anchorY=box.clientHeight/2)=>{const old=state.zoom;state.zoom=Math.max(.6,Math.min(2.5,next));state.panX=anchorX-(anchorX-state.panX)*(state.zoom/old);state.panY=anchorY-(anchorY-state.panY)*(state.zoom/old);renderGraph();};
    box.onwheel=e=>{e.preventDefault();e.stopPropagation();const rect=box.getBoundingClientRect();updateZoom(state.zoom*(e.deltaY<0?1.12:.89),e.clientX-rect.left,e.clientY-rect.top);};
    box.onpointerdown=e=>{box.classList.add("panning");box.dataset.panX=e.clientX;box.dataset.panY=e.clientY;box.dataset.startPanX=state.panX;box.dataset.startPanY=state.panY;box.dataset.dragMoved="false";};
    box.onpointermove=e=>{if(!box.classList.contains("panning"))return;const dx=e.clientX-Number(box.dataset.panX),dy=e.clientY-Number(box.dataset.panY);if(Math.abs(dx)+Math.abs(dy)>5)box.dataset.dragMoved="true";state.panX=Number(box.dataset.startPanX)+dx;state.panY=Number(box.dataset.startPanY)+dy;$(".graph-viewport",box)?.setAttribute("transform",`translate(${state.panX} ${state.panY}) scale(${state.zoom})`);};
    box.onpointerup=()=>{box.classList.remove("panning");if(box.dataset.dragMoved==="true")setTimeout(()=>{box.dataset.dragMoved="false";},0);};box.onpointercancel=()=>{box.classList.remove("panning");box.dataset.dragMoved="false";};
    setState("#graphMeta",`${c.nodes.length} nodes · ${c.edges.length} transforms · ${c.maxGeneration} generations${state.mode==="compare"?` · a=${p.multipliers.join(",")}`:""}`);
  }
  function renderTimeline(){const c=state.closure;if(!c)return;$("#timelineCanvas").innerHTML=c.generations.map((g,i)=>`<div class="generation-row"><div class="generation-label">GEN ${i}</div><div class="generation-sets">${g.map(n=>`<div class="mini-set"><em>${n.id===key(params().seed)?"seed":"set"}</em>${displaySet(n.set)}</div>`).join("")}</div></div>`).join("");}
  function renderSaturation(){const c=state.closure;if(!c)return;const total=Math.max(c.nodes.length,1);$("#saturationCanvas").innerHTML=`<p class="muted">Canonical-set discovery by generation. Saturation means no new set keys appear in the next frontier; it is distinct from every residue being covered.</p>`+c.generations.map((g,i)=>`<div class="sat-row"><span>Generation ${i}</span><div class="sat-track"><div class="sat-fill" style="width:${Math.min(100,g.length/total*100)}%"></div></div><b>${g.length}</b></div>`).join("")+`<div class="control-note">${c.terminationReason}. Distinct sets: ${c.nodes.length}; residue coverage: ${new Set(c.nodes.flatMap(n=>n.set)).size}/${params().m}.</div>`;}
  function renderInspector(){const c=state.closure,p=params(),el=$("#inspectorContent");if(!c)return;if(state.inspector==="stats"){const groups=scc(c);el.innerHTML=`<div class="metric-grid"><div class="metric"><strong>${c.nodes.length}</strong><span>canonical sets</span></div><div class="metric"><strong>${c.edges.length}</strong><span>labeled edges</span></div><div class="metric"><strong>${groups.length}</strong><span>SCCs</span></div><div class="metric"><strong>${c.maxGeneration}</strong><span>diameter upper bound</span></div></div><p class="muted">Self-loops: ${c.edges.filter(e=>e.from===e.to).length}. Diameter is reported as the maximum discovery generation, not an undirected graph diameter.</p>`;return}if(state.inspector==="transform"){const e=state.selectedEdge||{f:p.foci[0]??0,a:p.a,from:key(p.seed),to:key(transform(p.seed,p.foci[0]??0,p.a,p.m,p.subtractFocus))};const input=c.nodes.find(n=>n.id===e.from)?.set||p.seed;const output=transform(input,e.f,e.a,p.m,p.subtractFocus);el.innerHTML=`<div class="set-title"><strong>T<sub>${e.f},${e.a}</sub></strong><span class="muted">mod ${p.m}</span></div><p class="muted">${displaySet(input)} → ${displaySet(output)}</p><div class="table-wrap"><table><thead><tr><th>x</th><th>f + a(x-f)</th><th>final mod m</th></tr></thead><tbody>${input.map(x=>{const raw=mod(e.f+e.a*(x-e.f),p.m),final=p.subtractFocus?mod(raw-e.f,p.m):raw;return `<tr><td>${x}</td><td>${e.f} + ${e.a}(${x}-${e.f})</td><td>${p.subtractFocus?`${raw} → `:""}${final}</td></tr>`}).join("")}</tbody></table></div>`;return}const n=c.nodes.find(x=>x.id===state.selectedNode)||c.nodes[0];el.innerHTML=`<div class="set-title"><strong>Set ${n.generation===0?"seed":""}</strong><span class="muted">gen ${n.generation}</span></div><div class="residue-grid">${n.set.map(x=>`<span class="residue ${p.seed.includes(x)?"seed-residue":""}">${x}</span>`).join("")}</div><div class="metric-grid" style="margin-top:12px"><div class="metric"><strong>${n.set.length}</strong><span>cardinality</span></div><div class="metric"><strong>${n.parents.length}</strong><span>parents</span></div></div><p class="muted">Canonical key: ${n.id||"∅"}</p>`;}
  function renderDual(){const p=params();$("#dualResults").innerHTML=state.dual.length?state.dual.slice(0,12).map(x=>`<div class="dual-result">g(x) = ${x.a}x + ${x.b} mod ${p.m}<br><span class="muted">${displaySet(x.set)} · ${x.match} match</span></div>`).join(""):"<span class=\"muted\">Search results appear here.</span>";}
  function searchDual(){const p=params();state.dual=[];for(let a=0;a<p.m;a++)for(let b=0;b<p.m;b++){const out=[...new Set(p.seed.map(x=>mod(a*x+b,p.m)))].sort((x,y)=>x-y);state.dual.push({a,b,set:out,match:state.closure?.nodes.some(n=>key(n.set)===key(out))?"closure":"new"})}state.dual.sort((x,y)=>x.match.localeCompare(y.match)||x.a-y.a);renderDual();}
  function renderAll(){
    if(!state.subtractBound){$("#subtractFocus").addEventListener("change",compute);state.subtractBound=true;}
    renderFamily();
    if(state.view==="graph")renderGraph();
    if(state.view==="timeline")renderTimeline();
    if(state.view==="saturation")renderSaturation();
    renderInspector();renderDual();
    $$('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`${state.view}View`));
    const titles={graph:"Closure graph",timeline:"Generation timeline",saturation:"Saturation profile"};
    setState("#workspaceTitle",titles[state.view]);
    $$('.inspector-tab').forEach(b=>b.classList.toggle('active',b.dataset.inspector===state.inspector));
    $("#dualPanel").classList.toggle("hidden",state.mode!=="dual");
    $("#compareMultiplierWrap").classList.toggle("hidden",state.mode!=="compare");
    const elapsed=state.computeMs<1?"<1":state.computeMs.toFixed(1);
    $("#statusPill").textContent=state.closure?`${state.closure.nodes.length} sets · ${elapsed} ms`:"Ready";
  }
  function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  function exportData(kind){const c=state.closure,p=params();if(!c)return;if(kind==="csv")download("aft-closure.csv",["id,generation,set",...c.nodes.map(n=>`${n.id},${n.generation},"${n.set.join(" ")}"`)].join("\n"),"text/csv");else if(kind==="mermaid")download("aft-closure.mmd",`graph TD\n${c.edges.map(e=>`  ${safe(e.from)} -->|f${e.f}| ${safe(e.to)}`).join("\n")}`);else if(kind==="svg")download("aft-graph.svg",$("#graphCanvas").innerHTML,"image/svg+xml");else download("aft-state.json",JSON.stringify({params:p,closure:c},null,2),"application/json")}
  const safe = s => "n"+(s||"empty").replace(/[^a-zA-Z0-9_]/g,"_");
  function persist(){localStorage.setItem("aft-state",JSON.stringify({seed:$("#seedInput").value,m:$("#modulusInput").value,a:$("#multiplierInput").value,domain:$("#focusDomain").value,custom:$("#customFocusInput").value}))}
  function restore(){try{const x=JSON.parse(localStorage.getItem("aft-state"));if(x){$("#seedInput").value=x.seed||$("#seedInput").value;$("#modulusInput").value=x.m||12;$("#multiplierInput").value=x.a||5;$("#focusDomain").value=x.domain||"all";$("#customFocusInput").value=x.custom||""}}catch(_){}}
  function play(){const c=state.closure;if(!c)return;const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ctx=new Audio(), tempo=Number($("#tempoInput").value), beat=60/tempo;state.playing=true;$("#playLabel").textContent="Playing generations";c.generations.flatMap(g=>g).forEach((n,i)=>{const o=ctx.createOscillator(),gain=ctx.createGain();o.type="sine";o.frequency.value=220+((n.set[0]||0)*30);gain.gain.setValueAtTime(.0001,ctx.currentTime+i*beat);gain.gain.exponentialRampToValueAtTime(.08,ctx.currentTime+i*beat+.02);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*beat+beat*.8);o.connect(gain).connect(ctx.destination);o.start(ctx.currentTime+i*beat);o.stop(ctx.currentTime+i*beat+beat)});setTimeout(()=>{$("#playLabel").textContent="Play generation";ctx.close()},c.nodes.length*beat*1000+300)}
  $("#computeBtn").addEventListener("click",compute);$("#resetBtn").addEventListener("click",()=>{localStorage.removeItem("aft-state");location.reload()});$("#focusDomain").addEventListener("change",()=>$("#customFocusWrap").classList.toggle("hidden",$("#focusDomain").value!=="custom"));$("#playBtn").addEventListener("click",play);$("#dualSearchBtn").addEventListener("click",searchDual);$("#tempoInput").addEventListener("input",e=>setState("#tempoValue",`${e.target.value} BPM`));$("#showLabels").addEventListener("change",renderGraph);$("#showEdges").addEventListener("change",renderGraph);$("#animateGraph").addEventListener("change",renderGraph);$$('.mode-tab').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;$$('.mode-tab').forEach(x=>x.classList.toggle('active',x===b));renderAll()}));$$('.view-tab').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;renderAll()}));$$('.layout-btn').forEach(b=>b.addEventListener('click',()=>{state.layout=b.dataset.layout;$$('.layout-btn').forEach(x=>x.classList.toggle('active',x===b));renderGraph()}));$$('.inspector-tab').forEach(b=>b.addEventListener('click',()=>{state.inspector=b.dataset.inspector;renderInspector();$$('.inspector-tab').forEach(x=>x.classList.toggle('active',x===b))}));$$('[data-export]').forEach(b=>b.addEventListener('click',()=>exportData(b.dataset.export)));restore();$("#customFocusWrap").classList.toggle("hidden",$("#focusDomain").value!=="custom");compute();
})();
