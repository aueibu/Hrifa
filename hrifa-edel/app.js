(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d');
const TAU = Math.PI * 2;
const FEATURES = ['vertex','edge midpoint','edge','center','interior point','intersection point'];
let polygons = [], attachments = [], groups = [], selectedPolyId = null, selectedEdge = null, selectedEdges = [], selectedPolygonIds = new Set();
let undoStack = [], redoStack = [], pendingTransform = null, activeGroupId = null, nextGroupId = 1;
let viewMode = 'construction', drag = null, nextId = 1, showFeatureLabels = false, showPolygonRoles = false, showGhost = true;

function defaultEdge(){ return {type:'single', doubleSide:'inside', gap:6, hashCount:2, hashLength:10}; }
function makePolygon(sides, x, y, radius=80, rotation=-Math.PI/2, role='core'){
  return {id:nextId++, sides, x,y,radius,rotation,role, edges:Array.from({length:sides},defaultEdge), parentId:null, attachmentEdge:null, groupId:activeGroupId};
}
function polyById(id){ return polygons.find(p=>p.id===Number(id)); }
function deep(v){return JSON.parse(JSON.stringify(v));}
function roman(n){const vals=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let s='';for(const [v,c] of vals)while(n>=v){s+=c;n-=v;}return s;}
function groupById(id){return groups.find(g=>g.id===Number(id));}
function groupName(id){return groupById(id)?.name||'Ungrouped';}
function createGroup(name=null){const g={id:nextGroupId++,name:name||`Structure ${roman(nextGroupId-1)}`};groups.push(g);return g;}
function captureState(){return deep({polygons,attachments,groups,selectedPolyId,selectedEdge,selectedEdges:[...selectedEdges],selectedPolygonIds:[...selectedPolygonIds],nextId,nextGroupId,activeGroupId});}
function restoreState(s){polygons=deep(s.polygons);attachments=deep(s.attachments);groups=deep(s.groups||[]);selectedPolyId=s.selectedPolyId;selectedEdge=deep(s.selectedEdge);selectedEdges=[...(s.selectedEdges||[])];selectedPolygonIds=new Set(s.selectedPolygonIds||[]);nextId=s.nextId;nextGroupId=s.nextGroupId||1;activeGroupId=s.activeGroupId??null;pendingTransform=null;updateSelectors();updateGroupUI();draw();updateHistoryButtons();}
function sameState(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function commitOperation(before){const after=captureState();if(sameState(before,after))return;undoStack.push(before);if(undoStack.length>100)undoStack.shift();redoStack=[];updateHistoryButtons();}
function transact(fn){const before=captureState();fn();commitOperation(before);}
function undo(){if(!undoStack.length)return;const current=captureState();const prev=undoStack.pop();redoStack.push(current);restoreState(prev);}
function redo(){if(!redoStack.length)return;const current=captureState();const next=redoStack.pop();undoStack.push(current);restoreState(next);}
function updateHistoryButtons(){$('undoBtn').disabled=!undoStack.length;$('redoBtn').disabled=!redoStack.length;}
function targetPolygons(){if(activeGroupId!=null){const list=polygons.filter(p=>p.groupId===activeGroupId);if(list.length)return list;}return polygons;}

function vertices(p){ return Array.from({length:p.sides},(_,i)=>({x:p.x+Math.cos(p.rotation+i*TAU/p.sides)*p.radius,y:p.y+Math.sin(p.rotation+i*TAU/p.sides)*p.radius})); }
function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
function norm(v){const l=Math.hypot(v.x,v.y)||1;return{x:v.x/l,y:v.y/l};}
function clampIndex(i,n){return ((Number(i)||0)%n+n)%n;}
function segDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
function pointInPoly(pt,p){const v=vertices(p);let inside=false;for(let i=0,j=v.length-1;i<v.length;j=i++){const a=v[i],b=v[j];if(((a.y>pt.y)!=(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x))inside=!inside;}return inside;}
function lineIntersection(a,b,c,d){const den=(a.x-b.x)*(c.y-d.y)-(a.y-b.y)*(c.x-d.x);if(Math.abs(den)<1e-8)return null;const t=((a.x-c.x)*(c.y-d.y)-(a.y-c.y)*(c.x-d.x))/den,u=-((a.x-b.x)*(a.y-c.y)-(a.y-b.y)*(a.x-c.x))/den;if(t>=0&&t<=1&&u>=0&&u<=1)return{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)};return null;}
function intersectionsFor(p){const out=[],pv=vertices(p);for(const q of polygons){if(q.id===p.id)continue;const qv=vertices(q);for(let i=0;i<pv.length;i++)for(let j=0;j<qv.length;j++){const z=lineIntersection(pv[i],pv[(i+1)%pv.length],qv[j],qv[(j+1)%qv.length]);if(z)out.push(z);}}return out;}
function featurePoint(p,type,index=0){const v=vertices(p),i=clampIndex(index,p.sides),a=v[i],b=v[(i+1)%v.length];switch(type){case'vertex':return a;case'edge midpoint':case'edge':return midpoint(a,b);case'center':return{x:p.x,y:p.y};case'interior point':return{x:p.x+(a.x-p.x)*.45,y:p.y+(a.y-p.y)*.45};case'intersection point':{const xs=intersectionsFor(p);return xs.length?xs[clampIndex(index,xs.length)]:{x:p.x+(a.x-p.x)*.35,y:p.y+(a.y-p.y)*.35};}default:return{x:p.x,y:p.y};}}
function featureDirection(p,type,index=0){const v=vertices(p),i=clampIndex(index,p.sides),a=v[i],b=v[(i+1)%v.length],m=midpoint(a,b);if(type==='edge'||type==='edge midpoint')return norm({x:m.x-p.x,y:m.y-p.y});if(type==='vertex'||type==='interior point')return norm({x:a.x-p.x,y:a.y-p.y});return{x:0,y:-1};}
function resize(){const r=canvas.getBoundingClientRect(),d=devicePixelRatio||1;canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);ctx.setTransform(d,0,0,d,0,0);draw();}
function center(){const r=canvas.getBoundingClientRect();return{x:r.width/2,y:r.height/2};}
function screenPoint(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function structureCenter(list=polygons){if(!list.length)return center();return{x:list.reduce((sum,p)=>sum+p.x,0)/list.length,y:list.reduce((sum,p)=>sum+p.y,0)/list.length};}
function selectedParentFeaturePoint(){const p=polyById($('parentSelect').value);return p?featurePoint(p,$('parentFeature').value,+$('parentIndex').value):structureCenter();}
function pivotPoint(){const mode=$('pivotInput')?.value||'structure';if(mode==='canvas')return center();if(mode==='selected'){const p=polyById(selectedPolyId);return p?{x:p.x,y:p.y}:structureCenter(targetPolygons());}if(mode==='parentFeature')return selectedParentFeaturePoint();return structureCenter(targetPolygons());}
function setEdgeTargets(polyId,indices){const p=polyById(polyId);selectedEdges=p?[...new Set(indices.map(i=>clampIndex(i,p.sides)))]:[];selectedEdge=selectedEdges.length?{polyId:Number(polyId),edgeIndex:selectedEdges[0]}:null;}
function setParentFeatureFromCanvas(p,type,index=0){selectedPolyId=p.id;$('parentSelect').value=String(p.id);$('parentFeature').value=type;updateFeatureIndexSelectors();$('parentIndex').value=String(clampIndex(index,$('parentIndex').options.length||1));updatePair();}

function drawGrid(){const r=canvas.getBoundingClientRect();ctx.save();ctx.strokeStyle='rgba(255,255,255,.035)';ctx.lineWidth=1;for(let x=0;x<r.width;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,r.height);ctx.stroke();}for(let y=0;y<r.height;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(r.width,y);ctx.stroke();}ctx.restore();}
function edgeOffset(a,b,p,side,gap){const d=norm({x:-(b.y-a.y),y:b.x-a.x});const m=midpoint(a,b),toward={x:p.x-m.x,y:p.y-m.y};let sign=(d.x*toward.x+d.y*toward.y)>=0?1:-1;if(side==='outside')sign*=-1;return{x:d.x*gap*sign,y:d.y*gap*sign};}
function strokeLine(a,b,width=1.6,style='#ded8cf'){ctx.strokeStyle=style;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
function drawEdge(a,b,p,edge,selected=false){if(edge.type==='removed')return;const color=selected?'#c3a7ff':'#ded8cf';strokeLine(a,b,selected?2.6:1.65,color);if(edge.type==='double'){const o=edgeOffset(a,b,p,edge.doubleSide,edge.gap);strokeLine({x:a.x+o.x,y:a.y+o.y},{x:b.x+o.x,y:b.y+o.y},1.35,color);}if(edge.type==='hash'){const d={x:b.x-a.x,y:b.y-a.y},n=norm({x:-d.y,y:d.x});for(let k=1;k<=edge.hashCount;k++){const t=k/(edge.hashCount+1),m={x:a.x+d.x*t,y:a.y+d.y*t},h=edge.hashLength/2;strokeLine({x:m.x-n.x*h,y:m.y-n.y*h},{x:m.x+n.x*h,y:m.y+n.y*h},1.25,color);}}
}
function drawFeatureLabels(p,v){
 ctx.save();ctx.font='9px ui-monospace';ctx.textAlign='center';ctx.textBaseline='middle';
 for(let i=0;i<v.length;i++){
   const a=v[i],b=v[(i+1)%v.length],m=midpoint(a,b),rv=norm({x:a.x-p.x,y:a.y-p.y}),rm=norm({x:m.x-p.x,y:m.y-p.y});
   ctx.fillStyle='#c3a7ff';ctx.fillText(`V${i}`,a.x+rv.x*13,a.y+rv.y*13);
   ctx.fillStyle='#9ee7d8';ctx.fillText(`M${i}`,m.x+rm.x*12,m.y+rm.y*12);
   ctx.fillStyle='#aaa2ab';ctx.fillText(`E${i}`,m.x-rm.x*12,m.y-rm.y*12);
 }
 ctx.restore();
}
function drawPolygon(p){const v=vertices(p);const sel=p.id===selectedPolyId;ctx.save();if(viewMode==='membrane'){ctx.fillStyle=sel?'rgba(195,167,255,.10)':'rgba(238,233,223,.055)';ctx.beginPath();v.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fill();}
 for(let i=0;i<v.length;i++){const edgeSel=selectedEdge&&selectedEdge.polyId===p.id&&selectedEdges.includes(i);drawEdge(v[i],v[(i+1)%v.length],p,p.edges[i],edgeSel);}
 if(viewMode==='construction')ctx.fillStyle=sel?'#c3a7ff':'#9ee7d8';
 if(viewMode==='construction')for(const q of v){ctx.beginPath();ctx.arc(q.x,q.y,3,0,TAU);ctx.fill();}
 if(viewMode==='construction'||viewMode==='graph'){
   ctx.fillStyle='#151316';ctx.strokeStyle=sel?'#c3a7ff':'#777078';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(p.x,p.y,10,0,TAU);ctx.fill();ctx.stroke();
   ctx.fillStyle=sel?'#c3a7ff':'#aaa2ab';ctx.font='10px ui-monospace';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText(String(p.id),p.x,p.y+3.5);
   if(showPolygonRoles){ctx.font='9px ui-monospace';ctx.textBaseline='top';ctx.fillStyle=sel?'#c3a7ff':'#9ee7d8';ctx.fillText(p.role,p.x,p.y+13);}
 }
 if(showFeatureLabels)drawFeatureLabels(p,v);
 ctx.restore();}
function drawAttachments(){if(viewMode!=='construction'&&viewMode!=='graph')return;ctx.save();ctx.setLineDash([5,5]);ctx.lineWidth=1;for(const a of attachments){const p=polyById(a.parentId),c=polyById(a.childId);if(!p||!c)continue;ctx.strokeStyle='rgba(158,231,216,.45)';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(c.x,c.y);ctx.stroke();if(viewMode==='graph'){const m=midpoint(p,c);ctx.setLineDash([]);ctx.fillStyle='#121113';ctx.strokeStyle='#51495a';ctx.fillRect(m.x-32,m.y-8,64,16);ctx.strokeRect(m.x-32,m.y-8,64,16);ctx.fillStyle='#aaa2ab';ctx.font='9px ui-monospace';ctx.textAlign='center';ctx.fillText(a.relation,m.x,m.y+3);ctx.setLineDash([5,5]);}}
ctx.restore();}
function drawGhost(){
 if(!showGhost || viewMode!=='construction' || !polygons.length)return;
 const ghost=buildProposedChild(false);if(!ghost)return;
 const v=vertices(ghost),parent=polyById($('parentSelect').value),pf=$('parentFeature').value,pi=+$('parentIndex').value,cf=$('childFeature').value,ci=+$('childIndex').value;
 ctx.save();ctx.globalAlpha=.48;ctx.setLineDash([8,6]);ctx.strokeStyle='#c3a7ff';ctx.lineWidth=1.8;ctx.beginPath();v.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='rgba(195,167,255,.10)';ctx.fill();
 const childPoint=featurePoint(ghost,cf,ci);ctx.fillStyle='#c3a7ff';ctx.beginPath();ctx.arc(childPoint.x,childPoint.y,4.5,0,TAU);ctx.fill();
 if(parent){const parentPoint=featurePoint(parent,pf,pi);ctx.strokeStyle='rgba(158,231,216,.8)';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(parentPoint.x,parentPoint.y,6,0,TAU);ctx.stroke();}
 if(showFeatureLabels)drawFeatureLabels(ghost,v);
 ctx.restore();
}
function drawTransformPreview(){if(!pendingTransform)return;ctx.save();ctx.globalAlpha=.42;ctx.setLineDash([8,6]);for(const p of pendingTransform.previewPolygons){const v=vertices(p);ctx.strokeStyle='#c3a7ff';ctx.lineWidth=2;ctx.beginPath();v.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.stroke();}ctx.restore();}
 function draw(){refreshAttachmentConstraints();const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);drawGrid();drawAttachments();for(const p of polygons)drawPolygon(p);drawGhost();drawTransformPreview();updateStats();}

function featureIndexOptions(type,count,intersectionCount=0){
 const n=type==='center'?1:(type==='intersection point'&&intersectionCount>0?intersectionCount:count);
 const prefix=type==='vertex'?'V':type==='edge'?'E':type==='edge midpoint'?'M':type==='center'?'C':type==='interior point'?'I':'X';
 return Array.from({length:Math.max(1,n)},(_,i)=>({value:i,label:type==='center'?'C':`${prefix}${i}`}));
}
function fillIndexSelect(select,type,count,intersectionCount=0){const prior=Number(select.value)||0;select.innerHTML='';for(const o of featureIndexOptions(type,count,intersectionCount))select.add(new Option(o.label,o.value));select.value=String(Math.min(prior,select.options.length-1));}
function updateFeatureIndexSelectors(){const parent=polyById($('parentSelect').value)||polygons[0];if(parent)fillIndexSelect($('parentIndex'),$('parentFeature').value,parent.sides,intersectionsFor(parent).length);fillIndexSelect($('childIndex'),$('childFeature').value,+$('sidesInput').value,0);updatePair();}
function updateSelectors(){const previous=$('parentSelect').value;const opts=polygons.map(p=>`<option value="${p.id}">#${p.id} · ${p.role} · ${p.sides}-gon</option>`).join('');$('parentSelect').innerHTML=opts;$('parentSelect').value=previous&&polyById(previous)?previous:(selectedPolyId||polygons[0]?.id||'');updateFeatureIndexSelectors();updateSelection();}
function updatePolygonList(){$('polygonList').innerHTML=polygons.map(p=>`<label class="polygon-item ${p.id===selectedPolyId?'active':''}" data-poly-id="${p.id}"><input type="checkbox" data-check-poly="${p.id}" ${selectedPolygonIds.has(p.id)?'checked':''}/><span>#${p.id} · ${p.role} · ${p.sides}-gon</span><span class="group-tag">${groupName(p.groupId)}</span></label>`).join('')||'<div class="selection-card">No polygons.</div>';document.querySelectorAll('[data-check-poly]').forEach(el=>el.onchange=e=>{const id=+e.target.dataset.checkPoly;e.target.checked?selectedPolygonIds.add(id):selectedPolygonIds.delete(id);});document.querySelectorAll('[data-poly-id]').forEach(el=>el.onclick=e=>{if(e.target.matches('input'))return;const p=polyById(el.dataset.polyId);if(!p)return;selectedPolyId=p.id;setParentFeatureFromCanvas(p,'center',0);selectedEdge=null;selectedEdges=[];updateSelectors();draw();});}
function updateGroupUI(){const prior=activeGroupId;$('groupSelect').innerHTML='<option value="">Whole structure</option>'+groups.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');if(prior!=null&&groupById(prior))$('groupSelect').value=String(prior);else{$('groupSelect').value='';activeGroupId=null;}updatePolygonList();}

 function updateSelection(){updatePolygonList();const p=polyById(selectedPolyId),attachment=p&&attachmentForChild(p.id);$('selectionInfo').textContent=p?`#${p.id} · ${p.role} · regular ${p.sides}-gon · radius ${Math.round(p.radius)} · rotation ${Math.round(p.rotation*180/Math.PI)}°${attachment?` · constrained to #${attachment.parentId}`:''}`:'No polygon selected.';$('edgeInfo').textContent=selectedEdge?`Polygon #${selectedEdge.polyId}, edges ${selectedEdges.map(i=>'E'+i).join(', ')}`:'No edge selected.';updateDescriptor();}
function tier(){const n=polygons.length;if(n<=1)return'Tier 0 · Primitive';if(n===2)return'Tier I · Dyadic';if(n===3){const parents=attachments.map(a=>a.parentId);return new Set(parents).size===1?'Tier II · Triadic branching':'Tier II · Triadic chain';}if(attachments.length>=n)return'Tier IV · Network';return'Tier III · Composite';}
function updateStats(){$('tierReadout').textContent=tier();const active=polygons.reduce((s,p)=>s+p.edges.filter(e=>e.type!=='removed').length,0);$('statsReadout').textContent=`${polygons.length} polygons · ${attachments.length} attachments · ${active} retained edges`;}
function descriptorObj(){return{version:2,title:'Hrifa Relic',view:viewMode,groups:deep(groups),polygons:polygons.map(p=>({...p})),attachments:[...attachments]};}
function updateDescriptor(){$('descriptor').value=JSON.stringify(descriptorObj(),null,2);}

function addInitial(){const c=center();groups=[];nextGroupId=1;activeGroupId=createGroup('Structure I').id;polygons=[makePolygon(6,c.x,c.y,92,-Math.PI/2,'core')];selectedPolyId=polygons[0].id;selectedPolygonIds=new Set([selectedPolyId]);selectedEdge=null;selectedEdges=[];attachments=[];undoStack=[];redoStack=[];pendingTransform=null;updateSelectors();updateGroupUI();updateHistoryButtons();draw();}
function scaleReferencePolygon(){return polyById($('parentSelect').value)||polyById(selectedPolyId)||polygons[0]||null;}
function scaledRadius(){const reference=scaleReferencePolygon();return (reference?.radius||80)*+$('scaleInput').value;}
function addFree(){transact(()=>{const c=center(),p=makePolygon(+$('sidesInput').value,c.x+40,c.y+30,scaledRadius(),-Math.PI/2,$('roleInput').value);polygons.push(p);selectedPolyId=p.id;selectedPolygonIds=new Set([p.id]);updateSelectors();updateGroupUI();draw();});}
  function relationDistance(rel,parent,child){switch(rel){case'anchor':return 0;case'penetrating':return-child.radius*.35;case'embedded':return-child.radius*.75;case'fused':return-child.radius*.12;case'bridged':return child.radius*.45;case'suspended':return child.radius*.85;default:return 0;}}
  function attachmentForChild(childId){return attachments.find(a=>a.childId===Number(childId));}
  function applyAttachmentConstraint(child,attachment){
   const parent=polyById(attachment.parentId);if(!parent)return false;
   const scale=Number.isFinite(+attachment.scale)?+attachment.scale:(child.radius/(parent.radius||1));
   attachment.scale=scale;child.radius=parent.radius*scale;
   const anchor=featurePoint(parent,attachment.parentFeature,attachment.parentIndex),dir=featureDirection(parent,attachment.parentFeature,attachment.parentIndex);
   let angle=Math.atan2(dir.y,dir.x),ori=attachment.orientation;
   if(ori==='inward')angle+=Math.PI;if(ori==='cw')angle+=Math.PI/2;if(ori==='ccw')angle-=Math.PI/2;if(ori==='focus')angle=Math.atan2(parent.y-anchor.y,parent.x-anchor.x);if(ori==='free')angle=0;
   angle+=(+attachment.angleOffset||0)*Math.PI/180;child.rotation=angle-Math.PI/2;
   const childPoint=featurePoint(child,attachment.childFeature,attachment.childIndex),offset={x:childPoint.x-child.x,y:childPoint.y-child.y},dist=relationDistance(attachment.relation,parent,child);
   child.x=anchor.x-offset.x+Math.cos(angle)*dist;child.y=anchor.y-offset.y+Math.sin(angle)*dist;
   child.parentId=parent.id;child.attachmentEdge=(attachment.childFeature==='edge'||attachment.childFeature==='edge midpoint')?clampIndex(attachment.childIndex,child.sides):null;
   return true;
  }
  function refreshAttachmentConstraints(){for(let pass=0;pass<polygons.length;pass++)for(const attachment of attachments){const child=polyById(attachment.childId);if(child)applyAttachmentConstraint(child,attachment);}}
function buildProposedChild(assignId=true){
 const parent=polyById($('parentSelect').value);if(!parent)return null;
 const sides=+$('sidesInput').value,radius=parent.radius*+$('scaleInput').value,role=$('roleInput').value;
 const child=assignId?makePolygon(sides,parent.x,parent.y,radius,-Math.PI/2,role):{id:-1,sides,x:parent.x,y:parent.y,radius,rotation:-Math.PI/2,role,edges:Array.from({length:sides},defaultEdge),parentId:null,attachmentEdge:null};
 const pf=$('parentFeature').value,cf=$('childFeature').value,pi=+$('parentIndex').value,ci=+$('childIndex').value,rel=$('relationInput').value,ori=$('orientationInput').value;
 const anchor=featurePoint(parent,pf,pi),dir=featureDirection(parent,pf,pi);let angle=Math.atan2(dir.y,dir.x);if(ori==='inward')angle+=Math.PI;if(ori==='cw')angle+=Math.PI/2;if(ori==='ccw')angle-=Math.PI/2;if(ori==='focus')angle=Math.atan2(parent.y-anchor.y,parent.x-anchor.x);if(ori==='free')angle=0;angle+=+$('angleInput').value*Math.PI/180;
 child.rotation=angle-Math.PI/2;const temp=featurePoint(child,cf,ci),offset={x:temp.x-child.x,y:temp.y-child.y},dist=relationDistance(rel,parent,child);child.x=anchor.x-offset.x+Math.cos(angle)*dist;child.y=anchor.y-offset.y+Math.sin(angle)*dist;child.parentId=parent.id;child.attachmentEdge=(cf==='edge'||cf==='edge midpoint')?clampIndex(ci,child.sides):null;
 return child;
}
function attachPolygon(){transact(()=>{const parent=polyById($('parentSelect').value);if(!parent)return;const child=buildProposedChild(true);if(!child)return;const pf=$('parentFeature').value,cf=$('childFeature').value,pi=+$('parentIndex').value,ci=+$('childIndex').value,rel=$('relationInput').value,ori=$('orientationInput').value;
  polygons.push(child);attachments.push({parentId:parent.id,childId:child.id,parentFeature:pf,childFeature:cf,parentIndex:pi,childIndex:ci,relation:rel,orientation:ori,angleOffset:+$('angleInput').value,scale:+$('scaleInput').value});selectedPolyId=child.id;selectedPolygonIds=new Set([child.id]);updateSelectors();updateGroupUI();draw();});}
function hitTest(pt){for(let k=polygons.length-1;k>=0;k--){const p=polygons[k],v=vertices(p);for(let i=0;i<v.length;i++)if(Math.hypot(pt.x-v[i].x,pt.y-v[i].y)<9)return{poly:p,feature:'vertex',index:i};if(Math.hypot(pt.x-p.x,pt.y-p.y)<12)return{poly:p,feature:'center',index:0};for(let i=0;i<v.length;i++){const m=midpoint(v[i],v[(i+1)%v.length]);if(Math.hypot(pt.x-m.x,pt.y-m.y)<9)return{poly:p,feature:'edge midpoint',index:i};}for(let i=0;i<v.length;i++)if(segDistance(pt,v[i],v[(i+1)%v.length])<7)return{poly:p,feature:'edge',index:i};if(pointInPoly(pt,p))return{poly:p,feature:'polygon',index:0};}return null;}
canvas.addEventListener('pointerdown',e=>{const pt=screenPoint(e),h=hitTest(pt);if(!h){selectedPolyId=null;selectedEdge=null;selectedEdges=[];updateSelection();draw();return;}selectedPolyId=h.poly.id;if(h.feature==='vertex'){setParentFeatureFromCanvas(h.poly,'vertex',h.index);setEdgeTargets(h.poly.id,[h.index-1,h.index]);}else if(h.feature==='center'){setParentFeatureFromCanvas(h.poly,'center',0);setEdgeTargets(h.poly.id,Array.from({length:h.poly.sides},(_,i)=>i));}else if(h.feature==='edge'||h.feature==='edge midpoint'){setParentFeatureFromCanvas(h.poly,h.feature,h.index);setEdgeTargets(h.poly.id,[h.index]);}else{setParentFeatureFromCanvas(h.poly,'center',0);selectedEdge=null;selectedEdges=[];}drag={id:h.poly.id,start:pt,x:h.poly.x,y:h.poly.y,moved:false,feature:h.feature,before:captureState()};canvas.setPointerCapture(e.pointerId);updateSelectors();draw();});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const pt=screenPoint(e),p=polyById(drag.id);if(!p)return;if(Math.hypot(pt.x-drag.start.x,pt.y-drag.start.y)>3)drag.moved=true;if(drag.moved&&!attachmentForChild(p.id)){p.x=drag.x+pt.x-drag.start.x;p.y=drag.y+pt.y-drag.start.y;draw();}});
canvas.addEventListener('pointerup',()=>{if(drag?.moved)commitOperation(drag.before);drag=null;updateSelection();});
 canvas.addEventListener('wheel',e=>{const pt=screenPoint(e),h=hitTest(pt);if(!h)return;e.preventDefault();if(attachmentForChild(h.poly.id))return;const before=captureState();selectedPolyId=h.poly.id;h.poly.rotation+=(e.deltaY>0?1:-1)*(+$('snapInput').value*Math.PI/180);updateSelection();draw();commitOperation(before);},{passive:false});

function applyEdge(){transact(()=>{if(!selectedEdge||!selectedEdges.length)return;const p=polyById(selectedEdge.polyId);if(!p)return;for(const i of selectedEdges){const e=p.edges[i];e.type=$('edgeTypeInput').value;e.doubleSide=$('doubleSideInput').value;e.gap=+$('doubleGapInput').value;e.hashCount=+$('hashCountInput').value;e.hashLength=+$('hashLengthInput').value;}updateDescriptor();draw();});}
function rule(name){transact(()=>{const p=polyById(selectedPolyId);if(!p)return;const base=selectedEdges[0]??p.attachmentEdge??0;if(name==='restore'){const targets=selectedEdges.length?selectedEdges:Array.from({length:p.sides},(_,i)=>i);for(const i of targets)p.edges[i]=defaultEdge();}if(name==='attachment'&&p.attachmentEdge!=null)p.edges[p.attachmentEdge].type='removed';if(name==='opposite'){const refs=selectedEdges.length?selectedEdges:[base];for(const i of refs)p.edges[clampIndex(i+Math.floor(p.sides/2),p.sides)].type='removed';}if(name==='alternating'){for(let step=0;step<p.sides;step++)p.edges[clampIndex(base+step,p.sides)].type=step%2?'removed':'single';}updateSelection();draw();});}
function cloneSubset(source,sourceAttachments,newGroupId){const idMap=new Map(),copies=[];let tempNext=nextId;for(const p of source){const q=deep(p);q.id=tempNext++;q.groupId=newGroupId;idMap.set(p.id,q.id);copies.push(q);}for(const q of copies)if(q.parentId!=null)q.parentId=idMap.get(q.parentId)??null;const copiedAttachments=sourceAttachments.map(a=>({...deep(a),parentId:idMap.get(a.parentId),childId:idMap.get(a.childId)})).filter(a=>a.parentId&&a.childId);return{copies,copiedAttachments,idMap,tempNext};}
function applyTransform(list,kind,pivot){const angle=+$('snapInput').value*Math.PI/180,scale=+$('transformScaleInput').value;for(const p of list){const dx=p.x-pivot.x,dy=p.y-pivot.y;if(kind==='left'||kind==='right'){const q=kind==='left'?-angle:angle,cs=Math.cos(q),sn=Math.sin(q);p.x=pivot.x+dx*cs-dy*sn;p.y=pivot.y+dx*sn+dy*cs;p.rotation+=q;}else if(kind==='mx'){p.y=pivot.y-dy;p.rotation=-p.rotation;}else if(kind==='my'){p.x=pivot.x-dx;p.rotation=Math.PI-p.rotation;}else if(kind==='scaleUp'||kind==='scaleDown'){const f=kind==='scaleUp'?scale:1/scale;p.x=pivot.x+dx*f;p.y=pivot.y+dy*f;p.radius*=f;}}}
function transformAll(kind){const pivot=pivotPoint(),duplicate=$('transformModeInput').value==='duplicate',source=targetPolygons(),sourceIds=new Set(source.map(p=>p.id));if(!source.length)return;const relevantAttachments=attachments.filter(a=>sourceIds.has(a.parentId)&&sourceIds.has(a.childId));if(duplicate){const newGroup={id:nextGroupId,name:`Structure ${roman(nextGroupId)}`};const cloned=cloneSubset(source,relevantAttachments,newGroup.id);applyTransform(cloned.copies,kind,pivot);pendingTransform={mode:'duplicate',kind,previewPolygons:cloned.copies,previewAttachments:cloned.copiedAttachments,newGroup,nextId:cloned.tempNext,nextGroupId:nextGroupId+1};}else{const copies=deep(source);applyTransform(copies,kind,pivot);pendingTransform={mode:'transform',kind,previewPolygons:copies,sourceIds:[...sourceIds]};}$('previewActions').classList.remove('hidden');$('transformPreviewInfo').textContent=`Preview: ${duplicate?'duplicate + ':''}${kind}. Commit or cancel.`;draw();}
function commitTransform(){if(!pendingTransform)return;transact(()=>{if(pendingTransform.mode==='duplicate'){groups.push(pendingTransform.newGroup);polygons.push(...deep(pendingTransform.previewPolygons));attachments.push(...deep(pendingTransform.previewAttachments));nextId=pendingTransform.nextId;nextGroupId=pendingTransform.nextGroupId;activeGroupId=pendingTransform.newGroup.id;selectedPolyId=pendingTransform.previewPolygons[0]?.id??selectedPolyId;selectedPolygonIds=new Set(pendingTransform.previewPolygons.map(p=>p.id));}else{const map=new Map(pendingTransform.previewPolygons.map(p=>[p.id,p]));polygons=polygons.map(p=>map.has(p.id)?deep(map.get(p.id)):p);}pendingTransform=null;$('previewActions').classList.add('hidden');$('transformPreviewInfo').textContent='Choose an operation to create a ghost preview. Nothing changes until committed.';updateSelectors();updateGroupUI();draw();});}
function cancelTransform(){pendingTransform=null;$('previewActions').classList.add('hidden');$('transformPreviewInfo').textContent='Choose an operation to create a ghost preview. Nothing changes until committed.';draw();}
function download(name,type,data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportJson(){download('hrifa-relic.json','application/json',JSON.stringify(descriptorObj(),null,2));}
function toSvg(){const r=canvas.getBoundingClientRect(),lines=[];lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}"><rect width="100%" height="100%" fill="#121113"/><g stroke="#eee9df" fill="none" stroke-width="1.7" stroke-linecap="round">`);for(const p of polygons){const v=vertices(p);p.edges.forEach((e,i)=>{if(e.type==='removed')return;const a=v[i],b=v[(i+1)%v.length];lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);if(e.type==='double'){const o=edgeOffset(a,b,p,e.doubleSide,e.gap);lines.push(`<line x1="${a.x+o.x}" y1="${a.y+o.y}" x2="${b.x+o.x}" y2="${b.y+o.y}"/>`);}if(e.type==='hash'){const d={x:b.x-a.x,y:b.y-a.y},n=norm({x:-d.y,y:d.x});for(let k=1;k<=e.hashCount;k++){const t=k/(e.hashCount+1),m={x:a.x+d.x*t,y:a.y+d.y*t},h=e.hashLength/2;lines.push(`<line x1="${m.x-n.x*h}" y1="${m.y-n.y*h}" x2="${m.x+n.x*h}" y2="${m.y+n.y*h}"/>`);}}});}lines.push('</g></svg>');return lines.join('');}
function exportPng(){const a=document.createElement('a');a.download='hrifa-relic.png';a.href=canvas.toDataURL('image/png');a.click();}

for(const f of FEATURES){$('parentFeature').add(new Option(f,f));$('childFeature').add(new Option(f,f));}
function updatePair(){const rel=$('relationInput').value;const suffix=rel==='anchor'?' · exact coincidence':'';const pi=$('parentIndex').selectedOptions[0]?.textContent||'';const ci=$('childIndex').selectedOptions[0]?.textContent||'';$('pairReadout').textContent=`Pair: parent ${pi} (${ $('parentFeature').value }) ← child ${ci} (${ $('childFeature').value }) · ${rel}${suffix}`;$('attachBtn').textContent=rel==='anchor'?'Anchor polygon':'Attach polygon';}
['relationInput','parentIndex','childIndex','orientationInput','roleInput'].forEach(id=>$(id).addEventListener('change',()=>{updatePair();draw();}));
['parentFeature','childFeature'].forEach(id=>$(id).addEventListener('change',()=>{updateFeatureIndexSelectors();draw();}));
$('parentSelect').addEventListener('change',()=>{updateFeatureIndexSelectors();draw();});
$('sidesInput').oninput=()=>{sidesOut.value=$('sidesInput').value;updateFeatureIndexSelectors();draw();};$('scaleInput').oninput=()=>{scaleOut.value=(+$('scaleInput').value).toFixed(2)+'×';draw();};$('angleInput').oninput=()=>{angleOut.value=$('angleInput').value+'°';draw();};
$('edgeTypeInput').onchange=()=>{doubleControls.classList.toggle('hidden',$('edgeTypeInput').value!=='double');hashControls.classList.toggle('hidden',$('edgeTypeInput').value!=='hash');};
$('doubleGapInput').oninput=()=>doubleGapOut.value=$('doubleGapInput').value;$('hashCountInput').oninput=()=>hashCountOut.value=$('hashCountInput').value;$('hashLengthInput').oninput=()=>hashLengthOut.value=$('hashLengthInput').value;
$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('addFreeBtn').onclick=addFree;$('attachBtn').onclick=attachPolygon;$('applyEdgeBtn').onclick=applyEdge;$('newBtn').onclick=()=>{nextId=1;addInitial();};$('saveJsonBtn').onclick=exportJson;$('svgBtn').onclick=()=>download('hrifa-relic.svg','image/svg+xml',toSvg());$('pngBtn').onclick=exportPng;
 $('deleteBtn').onclick=()=>transact(()=>{if(selectedPolyId==null)return;const deletedId=selectedPolyId;polygons=polygons.filter(p=>p.id!==deletedId);attachments=attachments.filter(a=>a.parentId!==deletedId&&a.childId!==deletedId);for(const p of polygons)if(p.parentId===deletedId){p.parentId=null;p.attachmentEdge=null;}selectedPolygonIds.delete(deletedId);selectedPolyId=polygons[0]?.id??null;selectedEdge=null;selectedEdges=[];updateSelectors();updateGroupUI();draw();});
$('duplicateBtn').onclick=()=>transact(()=>{const p=polyById(selectedPolyId);if(!p)return;const q=JSON.parse(JSON.stringify(p));q.id=nextId++;q.x+=28;q.y+=28;q.parentId=null;polygons.push(q);selectedPolyId=q.id;selectedPolygonIds=new Set([q.id]);updateSelectors();updateGroupUI();draw();});
$('rotateLeftBtn').onclick=()=>transformAll('left');$('rotateRightBtn').onclick=()=>transformAll('right');$('mirrorXBtn').onclick=()=>transformAll('mx');$('mirrorYBtn').onclick=()=>transformAll('my');$('scaleDownBtn').onclick=()=>transformAll('scaleDown');$('scaleUpBtn').onclick=()=>transformAll('scaleUp');$('transformScaleInput').oninput=()=>{transformScaleOut.value=(+$('transformScaleInput').value).toFixed(2)+'×';if(pendingTransform)cancelTransform();};$('commitTransformBtn').onclick=commitTransform;$('cancelTransformBtn').onclick=cancelTransform;
document.querySelectorAll('.edge-rule').forEach(b=>b.onclick=()=>rule(b.dataset.rule));document.querySelectorAll('.view-btn').forEach(b=>b.onclick=()=>{viewMode=b.dataset.view;document.querySelectorAll('.view-btn').forEach(x=>x.classList.toggle('active',x===b));updateDescriptor();draw();});
$('copyDescriptorBtn').onclick=async()=>{await navigator.clipboard.writeText($('descriptor').value);$('copyDescriptorBtn').textContent='Copied';setTimeout(()=>$('copyDescriptorBtn').textContent='Copy descriptor',900);};
$('showLabelsInput').onchange=()=>{showFeatureLabels=$('showLabelsInput').checked;draw();};
$('showRolesInput').onchange=()=>{showPolygonRoles=$('showRolesInput').checked;draw();};
$('showGhostInput').onchange=()=>{showGhost=$('showGhostInput').checked;draw();};
$('groupSelect').onchange=()=>{activeGroupId=$('groupSelect').value?+$('groupSelect').value:null;updatePolygonList();draw();};
$('selectAllPolysBtn').onclick=()=>{selectedPolygonIds=new Set(polygons.map(p=>p.id));updatePolygonList();};
$('clearPolySelectionBtn').onclick=()=>{selectedPolygonIds.clear();updatePolygonList();};
$('groupSelectedBtn').onclick=()=>{if(!selectedPolygonIds.size)return;transact(()=>{const g=createGroup();for(const p of polygons)if(selectedPolygonIds.has(p.id))p.groupId=g.id;activeGroupId=g.id;updateGroupUI();draw();});};
$('ungroupSelectedBtn').onclick=()=>{if(!selectedPolygonIds.size)return;transact(()=>{for(const p of polygons)if(selectedPolygonIds.has(p.id))p.groupId=null;activeGroupId=null;updateGroupUI();draw();});};

$('loadJsonInput').onchange=async e=>{try{const obj=JSON.parse(await e.target.files[0].text());polygons=obj.polygons||[];attachments=obj.attachments||[];groups=obj.groups||[];if(!groups.length&&polygons.length){const g=createGroup('Structure I');for(const p of polygons)p.groupId=g.id;}nextGroupId=Math.max(0,...groups.map(g=>g.id))+1;nextId=Math.max(0,...polygons.map(p=>p.id))+1;selectedPolyId=polygons[0]?.id??null;selectedEdge=null;selectedEdges=[];selectedPolygonIds=new Set(selectedPolyId?[selectedPolyId]:[]);undoStack=[];redoStack=[];pendingTransform=null;updateSelectors();updateGroupUI();updateHistoryButtons();draw();}catch(err){alert('Could not load relic JSON.');}};
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}else if(e.key==='Escape'&&pendingTransform)cancelTransform();});
window.addEventListener('resize',resize);updatePair();requestAnimationFrame(()=>{resize();addInitial();});
})();
