(function(){
"use strict";

// ---------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------
function circleCircleIntersections(c1, r1, c2, r2) {
  const dx = c2.x - c1.x, dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return [];
  if (d > r1 + r2 + 1e-9) return [];
  if (d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1*r1 - r2*r2 + d*d) / (2*d);
  const h2 = r1*r1 - a*a;
  const xm = c1.x + a*dx/d, ym = c1.y + a*dy/d;
  if (h2 <= 1e-9) return [{x: xm, y: ym}];
  const h = Math.sqrt(h2);
  return [
    {x: xm + h*dy/d, y: ym - h*dx/d},
    {x: xm - h*dy/d, y: ym + h*dx/d}
  ];
}
function pointInTriangle(p, a, b, c) {
  function sign(p1, p2, p3) { return (p1.x-p3.x)*(p2.y-p3.y) - (p2.x-p3.x)*(p1.y-p3.y); }
  const d1 = sign(p,a,b), d2 = sign(p,b,c), d3 = sign(p,c,a);
  const hasNeg = (d1<0)||(d2<0)||(d3<0), hasPos = (d1>0)||(d2>0)||(d3>0);
  return !(hasNeg && hasPos);
}
function pointInCircle(p, c, r) { return Math.hypot(p.x-c.x, p.y-c.y) < r - 1e-9; }
function willIntersect(p, rp, c, rc) {
  const d = Math.hypot(p.x-c.x, p.y-c.y);
  return d < rp + rc - 1e-9 && d > Math.abs(rp - rc) + 1e-9;
}
function triangleArea(a,b,c) { return Math.abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2; }

// sample around a circle, return contiguous valid angle ranges in degrees (may exceed 360 to express wraparound)
function validArcs(center, radius, predicate, steps) {
  steps = steps || 720;
  const flags = [];
  for (let i=0;i<steps;i++){
    const th = (i/steps)*2*Math.PI;
    const p = {x: center.x+radius*Math.cos(th), y: center.y+radius*Math.sin(th)};
    flags.push(!!predicate(p));
  }
  if (flags.every(f=>!f)) return [];
  if (flags.every(f=>f)) return [[0,360]];
  const start0 = flags.findIndex((f,idx)=> f && !flags[(idx-1+steps)%steps]);
  const ranges = [];
  let runStart = null;
  for (let k=0;k<steps;k++){
    const idx = (start0+k)%steps;
    const prevIdx = (start0+k-1+steps)%steps;
    if (flags[idx] && (k===0 || !flags[prevIdx])) runStart = idx;
    const nextIdx = (start0+k+1)%steps;
    if (flags[idx] && (k===steps-1 || !flags[nextIdx])) {
      let sDeg = (runStart/steps)*360, eDeg = (idx/steps)*360;
      if (eDeg < sDeg) eDeg += 360;
      ranges.push([sDeg, eDeg]);
    }
  }
  return ranges;
}
function arcsTotalLength(ranges){ return ranges.reduce((s,r)=>s+(r[1]-r[0]),0); }
function paramToAngle(ranges, t){ // t in [0,1] -> angle in degrees (0..360)
  if (!ranges.length) return 0;
  const total = arcsTotalLength(ranges);
  let target = t*total;
  for (const r of ranges) {
    const len = r[1]-r[0];
    if (target <= len || r === ranges[ranges.length-1]) {
      return ((r[0]+Math.min(target,len)) % 360 + 360) % 360;
    }
    target -= len;
  }
  return ((ranges[0][0])%360+360)%360;
}
function angleToParam(ranges, angleDeg){ // inverse-ish; used to find nearest valid t for a raw angle
  if (!ranges.length) return 0;
  angleDeg = ((angleDeg%360)+360)%360;
  // check membership (accounting for wrap ranges like [350,370])
  let acc = 0;
  for (const r of ranges) {
    const a0=r[0], a1=r[1];
    const within = (angleDeg>=a0 && angleDeg<=a1) || (angleDeg+360>=a0 && angleDeg+360<=a1);
    if (within) {
      const raw = angleDeg>=a0 ? angleDeg : angleDeg+360;
      return (acc + (raw-a0)) / arcsTotalLength(ranges);
    }
    acc += (a1-a0);
  }
  // not within any arc -> snap to nearest endpoint
  let best=null, bestD=Infinity, bestAcc=0;
  acc=0;
  for (const r of ranges) {
    for (const endpoint of [r[0], r[1]]) {
      const ep = ((endpoint%360)+360)%360;
      let d = Math.min(Math.abs(ep-angleDeg), 360-Math.abs(ep-angleDeg));
      if (d<bestD){ bestD=d; best=endpoint; bestAcc = (endpoint===r[0]? acc : acc+(r[1]-r[0])); }
    }
    acc += (r[1]-r[0]);
  }
  return bestAcc/arcsTotalLength(ranges);
}

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
let radii = [20,30,50];
let stage = 'setup'; // setup, A, B, C, done
let showScaffold = true;
let showAnchors = false;
let showVertices = false;

const model = { A:null, B:null, C:null };

// ---------------------------------------------------------------
// Persistence — auto-save to localStorage so a page refresh resumes
// exactly where you left off (radii, stage, every circle choice, all
// three triangles). Everything in `model` is plain JSON-safe data
// (numbers, strings, arrays, {x,y} points), so this round-trips cleanly.
// ---------------------------------------------------------------
const STATE_KEY = 'hrifaTriangleConstructionState_v1';
function saveState(){
  try {
    const snapshot = { v:1, radii, stage, showScaffold, showAnchors, showVertices, A:model.A, B:model.B, C:model.C };
    localStorage.setItem(STATE_KEY, JSON.stringify(snapshot));
  } catch(err) { /* storage unavailable (e.g. private browsing) — fail silently */ }
}
function loadState(){
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return;
    if (Array.isArray(s.radii) && s.radii.length===3) radii = s.radii;
    if (typeof s.stage === 'string') stage = s.stage;
    if (typeof s.showScaffold === 'boolean') showScaffold = s.showScaffold;
    if (typeof s.showAnchors === 'boolean') showAnchors = s.showAnchors;
    if (typeof s.showVertices === 'boolean') showVertices = s.showVertices;
    model.A = s.A || null; model.B = s.B || null; model.C = s.C || null;
  } catch(err) { /* corrupt/missing save — start fresh */ }
}
function clearSavedState(){
  try { localStorage.removeItem(STATE_KEY); } catch(err) {}
}
// Reachable from every stage via the persistent header button, so it asks
// first — the in-panel version at the Complete stage this replaced was a
// deliberate, low-risk last step and didn't need to.
function startOver(){
  if (stage!=='setup' && !confirm('Start over? This clears the current construction.')) return;
  model.A=null; model.B=null; model.C=null; stage='setup'; clearSavedState(); render(); renderSidebar();
}

function freshA(){
  return {
    assign: [radii.indexOf(Math.max(...radii)), null, null], // A1 defaults to largest radius index
    angle2: 40, angle3: 200,
    selected: [], T1: null
  };
}

function circlesForA(a){
  const remaining = [0,1,2].filter(i=>i!==a.assign[0]);
  const i2 = a.assign[1]==null ? remaining[0] : a.assign[1];
  const i3 = a.assign[2]==null ? remaining[1] : a.assign[2];
  a.assign[1]=i2; a.assign[2]=i3;
  const A1 = {x:0,y:0}, R1 = radii[a.assign[0]];
  const A2c = {x: A1.x+R1*Math.cos(a.angle2*Math.PI/180), y: A1.y+R1*Math.sin(a.angle2*Math.PI/180)};
  const A3c = {x: A1.x+R1*Math.cos(a.angle3*Math.PI/180), y: A1.y+R1*Math.sin(a.angle3*Math.PI/180)};
  return {
    A1:{center:A1, radius:R1, label:'A1'},
    A2:{center:A2c, radius:radii[i2], label:'A2'},
    A3:{center:A3c, radius:radii[i3], label:'A3'}
  };
}
// Each candidate point carries a stable (src, idx) identity — which circle
// pair it came from, and which of that pair's up-to-two intersections it is
// — rather than being identified by its (x,y). circleCircleIntersections()
// returns its two roots in a consistent order for continuously-varying
// circle positions, so (src, idx) keeps tracking the same geometric point
// as a handle is dragged, even though its coordinates move every frame.
function aCandidatePoints(circles){
  const p12 = circleCircleIntersections(circles.A1.center, circles.A1.radius, circles.A2.center, circles.A2.radius).map((p,idx)=>({...p, src:'A1∩A2', idx}));
  const p13 = circleCircleIntersections(circles.A1.center, circles.A1.radius, circles.A3.center, circles.A3.radius).map((p,idx)=>({...p, src:'A1∩A3', idx}));
  return p12.concat(p13);
}

function freshB(){
  return {
    assign: [null,null,null], // indices into radii, permutation
    targets: { B1:{anchor:'A2'}, B2:{anchorX:'A1', anchorY:'A3'}, B3:{anchorX:'A1', anchorY:'A2'} },
    angles: { B1:0.5, B2:0.5, B3:0.5 }, // param t in [0,1] along valid arcs
    selected: [], T2: null
  };
}

function circleForAnchor(anchorCircle, t, ranges, radius, label){
  if (!ranges.length) return null;
  const angleDeg = paramToAngle(ranges, t);
  const th = angleDeg*Math.PI/180;
  const center = {x: anchorCircle.center.x+anchorCircle.radius*Math.cos(th), y: anchorCircle.center.y+anchorCircle.radius*Math.sin(th)};
  return {center, radius, label, angleDeg};
}

function circlesForB(b, aCircles){
  ensurePermutation(b.assign);
  const rB1 = radii[b.assign[0]], rB2 = radii[b.assign[1]], rB3 = radii[b.assign[2]];

  const anchor1 = aCircles[b.targets.B1.anchor];
  const arcs1 = anchor1 ? validArcs(anchor1.center, anchor1.radius, p => pointInTriangle(p, model.A.T1[0], model.A.T1[1], model.A.T1[2])) : [];
  const B1 = anchor1 ? circleForAnchor(anchor1, b.angles.B1, arcs1, rB1, 'B1') : null;

  const anchor2 = aCircles[b.targets.B2.anchorX];
  const target2 = aCircles[b.targets.B2.anchorY];
  const arcs2 = anchor2 ? validArcs(anchor2.center, anchor2.radius, p => pointInCircle(p, target2.center, target2.radius)) : [];
  const B2 = anchor2 ? circleForAnchor(anchor2, b.angles.B2, arcs2, rB2, 'B2') : null;

  const anchor3 = aCircles[b.targets.B3.anchorX];
  const target3 = aCircles[b.targets.B3.anchorY];
  const arcs3 = anchor3 ? validArcs(anchor3.center, anchor3.radius, p => willIntersect(p, rB3, target3.center, target3.radius)) : [];
  const B3 = anchor3 ? circleForAnchor(anchor3, b.angles.B3, arcs3, rB3, 'B3') : null;

  return { B1, B2, B3, arcs: {B1:arcs1, B2:arcs2, B3:arcs3}, anchors: {B1:anchor1, B2:anchor2, B3:anchor3} };
}
function bCandidatePoints(bCircles, aCircles){
  const pts = [];
  ['B1','B2','B3'].forEach(bk=>{
    const bc = bCircles[bk];
    if (!bc) return;
    ['A1','A2','A3'].forEach(ak=>{
      const ac = aCircles[ak];
      circleCircleIntersections(bc.center, bc.radius, ac.center, ac.radius).forEach((p,idx)=>{
        pts.push({...p, src: bk+'∩'+ak, idx});
      });
    });
  });
  return pts;
}

function ensurePermutation(assign){
  if (assign.every(v=>v!=null) && new Set(assign).size===3) return;
  const used = new Set(assign.filter(v=>v!=null));
  const pool = [0,1,2].filter(i=>!used.has(i));
  for (let i=0;i<3;i++){ if (assign[i]==null) assign[i]=pool.shift(); }
}

function freshC(){
  return {
    assign: [null,null,null],
    targets: { C1:{anchor:'B1', target:'A1'}, C2:{anchor:'B2', target:'A2'}, C3:{anchor:'B3', target:'B1'} },
    angles: { C1:0.5, C2:0.5, C3:0.5 },
    selected: [], T3: null
  };
}
function circlesForC(c, aCircles, bCircles){
  ensurePermutation(c.assign);
  const rC1 = radii[c.assign[0]], rC2 = radii[c.assign[1]], rC3 = radii[c.assign[2]];

  const anchor1 = bCircles[c.targets.C1.anchor];
  const target1 = aCircles[c.targets.C1.target];
  const arcs1 = anchor1 ? validArcs(anchor1.center, anchor1.radius, p => willIntersect(p, rC1, target1.center, target1.radius)) : [];
  const C1 = anchor1 ? circleForAnchor(anchor1, c.angles.C1, arcs1, rC1, 'C1') : null;

  const anchor2 = bCircles[c.targets.C2.anchor];
  const target2 = aCircles[c.targets.C2.target];
  const arcs2 = anchor2 ? validArcs(anchor2.center, anchor2.radius, p => willIntersect(p, rC2, target2.center, target2.radius)) : [];
  const C2 = anchor2 ? circleForAnchor(anchor2, c.angles.C2, arcs2, rC2, 'C2') : null;

  const anchor3 = bCircles[c.targets.C3.anchor];
  const target3 = bCircles[c.targets.C3.target];
  const arcs3 = (anchor3 && target3) ? validArcs(anchor3.center, anchor3.radius, p => willIntersect(p, rC3, target3.center, target3.radius)) : [];
  const C3 = (anchor3 && arcs3.length) ? circleForAnchor(anchor3, c.angles.C3, arcs3, rC3, 'C3') : null;

  return { C1, C2, C3, arcs:{C1:arcs1,C2:arcs2,C3:arcs3}, anchors:{C1:anchor1,C2:anchor2,C3:anchor3} };
}
function cCandidatePoints(cCircles, aCircles, bCircles, c){
  const pts = [];
  if (cCircles.C1) circleCircleIntersections(cCircles.C1.center, cCircles.C1.radius, aCircles[c.targets.C1.target].center, aCircles[c.targets.C1.target].radius)
    .forEach((p,idx)=>pts.push({...p, src:'C1∩'+c.targets.C1.target, idx}));
  if (cCircles.C2) circleCircleIntersections(cCircles.C2.center, cCircles.C2.radius, aCircles[c.targets.C2.target].center, aCircles[c.targets.C2.target].radius)
    .forEach((p,idx)=>pts.push({...p, src:'C2∩'+c.targets.C2.target, idx}));
  if (cCircles.C3) circleCircleIntersections(cCircles.C3.center, cCircles.C3.radius, bCircles[c.targets.C3.target].center, bCircles[c.targets.C3.target].radius)
    .forEach((p,idx)=>pts.push({...p, src:'C3∩'+c.targets.C3.target, idx}));
  return pts;
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------
const svg = document.getElementById('svg');
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs){
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Reads the categorical/semantic CSS custom properties (style.css, themed per
// [data-theme]) into plain color strings, so canvas/SVG drawing code never
// hardcodes hex values — it stays correct across the light/dark theme swap.
function readTheme(){
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    a: v('--gen-a'), b: v('--gen-b'), c: v('--gen-c'),
    t1: v('--tri-t1'), t2: v('--tri-t2'), t3: v('--tri-t3'),
    text: v('--neutral-text'), muted: v('--neutral-text-muted'), idle: v('--point-idle'),
    panel: v('--neutral-surface-raised'), bg: v('--neutral-surface-bg')
  };
}
let theme = readTheme();

function allCirclesNow(){
  const list = [];
  if (model.A) { const c = circlesForA(model.A); list.push(c.A1,c.A2,c.A3); }
  if (model.A && model.A.T1 && model.B) {
    const aC = circlesForA(model.A);
    const bC = circlesForB(model.B, aC);
    ['B1','B2','B3'].forEach(k=>{ if (bC[k]) list.push(bC[k]); });
  }
  if (model.B && model.B.T2 && model.C) {
    const aC = circlesForA(model.A);
    const bC = circlesForB(model.B, aC);
    const cC = circlesForC(model.C, aC, bC);
    ['C1','C2','C3'].forEach(k=>{ if (cC[k]) list.push(cC[k]); });
  }
  return list;
}

// Logical drawing space — must match the <svg viewBox="0 0 VB_W VB_H"> in the markup.
// All toScreen() output is in this space, NOT actual on-screen CSS pixels; the SVG's
// own viewBox scaling (via width:100%/height:100% in CSS) maps it to whatever size
// the element is actually rendered at, so this stays correct at any container size.
const VB_W = 800, VB_H = 600;

function computeTransform(){
  const circles = allCirclesNow();
  let minX=-60,maxX=60,minY=-60,maxY=60;
  if (circles.length){
    minX=Infinity;maxX=-Infinity;minY=Infinity;maxY=-Infinity;
    circles.forEach(c=>{
      minX=Math.min(minX,c.center.x-c.radius); maxX=Math.max(maxX,c.center.x+c.radius);
      minY=Math.min(minY,c.center.y-c.radius); maxY=Math.max(maxY,c.center.y+c.radius);
    });
  }
  const padX=(maxX-minX)*0.12+8, padY=(maxY-minY)*0.12+8;
  minX-=padX; maxX+=padX; minY-=padY; maxY+=padY;
  const w = VB_W, h = VB_H;
  const dataW = maxX-minX, dataH = maxY-minY;
  const scale = Math.min(w/dataW, h/dataH);
  const offX = (w - dataW*scale)/2 - minX*scale;
  const offY = (h - dataH*scale)/2 - minY*scale;
  return {
    toScreen: p => ({x: p.x*scale+offX, y: p.y*scale+offY}),
    toWorld: p => ({x: (p.x-offX)/scale, y: (p.y-offY)/scale}),
    scale
  };
}

// Converts a raw mouse/pointer event's clientX/clientY (actual on-screen CSS pixels)
// into the SVG's internal user-space coordinates (the VB_W x VB_H logical space),
// accounting for however the browser is actually scaling the viewBox right now.
function screenEventToSvgSpace(clientX, clientY){
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return {x:0,y:0};
  const p = pt.matrixTransform(ctm.inverse());
  return {x:p.x, y:p.y};
}

let currentTransform = null;

// recede: 0 = current stage, full prominence, dashed outline.
// 1, 2, ... = stages behind (older -> fainter). True radius/position is never altered —
// only opacity and line style (dashed -> solid) change, so nothing shifts on screen.
function drawCircle(parent, c, color, dashed, recede){
  recede = recede || 0;
  const s = currentTransform.toScreen(c.center);
  const r = c.radius*currentTransform.scale;
  const opacity = recede===0 ? 0.95 : Math.max(0.14, 0.34 - (recede-1)*0.09);
  const strokeW = recede===0 ? 1.3 : 1.1;
  const e = el('circle', {cx:s.x, cy:s.y, r:r, fill:'none', stroke:color, 'stroke-width':strokeW, opacity});
  if (dashed && recede===0) e.setAttribute('stroke-dasharray','4,3'); // completed stages render as a solid line instead
  parent.appendChild(e);
  const lbl = el('text', {x:s.x, y:s.y-r-4, 'font-size': recede===0?10:8, fill:color, 'text-anchor':'middle', opacity: recede===0?1:opacity+0.15});
  lbl.textContent = recede===0 ? (c.label + ' (' + c.radius + 'mm)') : c.label;
  parent.appendChild(lbl);
}
function drawArc(parent, anchorCircle, ranges, color){
  ranges.forEach(r=>{
    const steps = Math.max(2, Math.round((r[1]-r[0])/2));
    let d = '';
    for (let i=0;i<=steps;i++){
      const ang = (r[0] + (r[1]-r[0])*i/steps)*Math.PI/180;
      const p = {x: anchorCircle.center.x+anchorCircle.radius*Math.cos(ang), y: anchorCircle.center.y+anchorCircle.radius*Math.sin(ang)};
      const s = currentTransform.toScreen(p);
      d += (i===0?'M':'L') + s.x.toFixed(2) + ',' + s.y.toFixed(2) + ' ';
    }
    const path = el('path', {d, fill:'none', stroke:color, 'stroke-width':4, 'stroke-linecap':'round', opacity:0.35});
    parent.appendChild(path);
  });
}
// solid=true renders an opaque backing (matching the page background) under the stroke,
// so this triangle fully occludes whatever construction lines sit behind it — used for the
// finished-design view, where T1 sits frontmost, then T2, then T3, like stacked opaque sheets.
function drawTriangle(parent, pts, color, solid){
  if (!pts || pts.length<3) return;
  const s = pts.map(p=>currentTransform.toScreen(p));
  const pointsAttr = s.map(p=>p.x+','+p.y).join(' ');
  if (solid) {
    const backing = el('polygon', {points: pointsAttr, fill:theme.panel, 'fill-opacity':1, stroke:'none'});
    parent.appendChild(backing);
  }
  const poly = el('polygon', {points: pointsAttr, fill: color, 'fill-opacity': solid?0.06:0.08, stroke: color, 'stroke-width': solid?2.2:2});
  parent.appendChild(poly);
}
function drawPoint(parent, p, isSelected, onClick, colorOverride){
  const s = currentTransform.toScreen(p);
  const g = el('g', {});
  const hit = el('circle', {cx:s.x, cy:s.y, r:9, fill:'transparent', cursor:'pointer'});
  const dot = el('circle', {cx:s.x, cy:s.y, r: isSelected?5:3.2, fill: isSelected ? (colorOverride||theme.t1) : theme.idle, stroke:theme.panel, 'stroke-width':1});
  g.appendChild(dot); g.appendChild(hit);
  if (onClick) hit.addEventListener('click', onClick);
  parent.appendChild(g);
}
// Small drafting-style cross marking where a circle's center (its anchor point) falls on
// the circumference of whichever circle it was anchored to. Fixed screen-space size, drawn
// on top of everything else so it stays visible even where an opaque finished triangle covers it.
function drawCross(parent, p, color, size){
  size = size || 6;
  const s = currentTransform.toScreen(p);
  const half = size/2;
  parent.appendChild(el('line', {x1:s.x-half, y1:s.y-half, x2:s.x+half, y2:s.y+half, stroke:color, 'stroke-width':1.3, 'stroke-linecap':'round'}));
  parent.appendChild(el('line', {x1:s.x-half, y1:s.y+half, x2:s.x+half, y2:s.y-half, stroke:color, 'stroke-width':1.3, 'stroke-linecap':'round'}));
}
// Small solid dot marking a triangle vertex — purely decorative in the finished view (no
// click handling), drawn on top of the opaque triangle stack so it's always visible.
function drawVertexDot(parent, p, color, size){
  size = size || 4.5;
  const s = currentTransform.toScreen(p);
  parent.appendChild(el('circle', {cx:s.x, cy:s.y, r:size/2, fill:color, stroke:theme.panel, 'stroke-width':1}));
}
function drawHandle(parent, circleObj, onDrag){
  const s = currentTransform.toScreen(circleObj.center);
  // handle sits at the anchor's actual position, already = circleObj.center; draw a draggable ring marker there
  const marker = el('circle', {cx:s.x, cy:s.y, r:6, fill:theme.panel, stroke:theme.text, 'stroke-width':2, cursor:'grab'});
  parent.appendChild(marker);
  if (onDrag) {
    // Drag session is bound to `svg`, not `marker`: onDrag() triggers render(), which
    // does svg.innerHTML='' and rebuilds every shape (including this exact marker element)
    // from scratch on every move event. A marker-bound pointer capture / listener would be
    // destroyed mid-drag after the first move. `svg` itself is never replaced, only its
    // children, so binding capture and move/up listeners there survives re-renders.
    marker.addEventListener('pointerdown', (ev)=>{
      ev.preventDefault();
      svg.setPointerCapture(ev.pointerId);
      function move(e2){
        e2.preventDefault();
        const s = screenEventToSvgSpace(e2.clientX, e2.clientY);
        const w = currentTransform.toWorld(s);
        onDrag(w);
      }
      function up(e2){
        svg.removeEventListener('pointermove', move);
        svg.removeEventListener('pointerup', up);
        try { svg.releasePointerCapture(ev.pointerId); } catch(err){}
      }
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerup', up);
    });
  }
}

function render(){
  theme = readTheme();
  svg.innerHTML='';
  currentTransform = computeTransform();
  const g = el('g', {});
  svg.appendChild(g);

  let aCircles=null, bCircles=null, cCircles=null;
  if (model.A) aCircles = circlesForA(model.A);
  if (model.A && model.A.T1 && model.B) bCircles = circlesForB(model.B, aCircles);
  if (model.B && model.B.T2 && model.C) cCircles = circlesForC(model.C, aCircles, bCircles);

  // How many stages "behind" the currently active stage each generation is (0 = active).
  // In the 'done' state nothing is active, so every generation gets the same gentle recede.
  const stageOrder = {A:0, B:1, C:2};
  function recedeFor(genKey){
    if (stage === 'done') return 1;
    const cur = stageOrder[stage];
    if (cur === undefined) return 0;
    return Math.max(0, cur - stageOrder[genKey]);
  }
  if (showScaffold && aCircles) {
    const rA = recedeFor('A');
    drawCircle(g, aCircles.A1, theme.a, true, rA); drawCircle(g, aCircles.A2, theme.a, true, rA); drawCircle(g, aCircles.A3, theme.a, true, rA);
  }
  if (showScaffold && bCircles) { const rB = recedeFor('B'); ['B1','B2','B3'].forEach(k=>{ if (bCircles[k]) drawCircle(g, bCircles[k], theme.b, true, rB); }); }
  if (showScaffold && cCircles) { const rC = recedeFor('C'); ['C1','C2','C3'].forEach(k=>{ if (cCircles[k]) drawCircle(g, cCircles[k], theme.c, true, rC); }); }

  // stage-specific interactive layers
  if (stage==='A' && aCircles){
    drawHandle(g, aCircles.A2, (w)=>{ model.A.angle2 = angleOf(aCircles.A1.center, w); render(); renderSidebar(); });
    drawHandle(g, aCircles.A3, (w)=>{ model.A.angle3 = angleOf(aCircles.A1.center, w); render(); renderSidebar(); });
    const pts = aCandidatePoints(aCircles);
    pts.forEach(p=>{
      const isSel = model.A.selected.some(id=>id.src===p.src && id.idx===p.idx);
      drawPoint(g, p, isSel, ()=>{ togglePoint(model.A.selected, identOf(p), 3); render(); renderSidebar(); }, theme.t1);
    });
    const triA = resolveSelected(model.A.selected, pts);
    if (triA.length===3) drawTriangle(g, triA, theme.t1);
  }
  if (stage!=='done' && model.A && model.A.T1) drawTriangle(g, model.A.T1, theme.t1);

  if (stage==='B' && aCircles){
    ['B1','B2','B3'].forEach(k=>{
      if (bCircles.arcs[k] && bCircles.arcs[k].length) drawArc(g, bCircles.anchors[k], bCircles.arcs[k], theme.b);
      if (bCircles[k]) drawHandle(g, bCircles[k], (w)=>{
        const anchor = bCircles.anchors[k];
        const ang = angleOf(anchor.center, w);
        model.B.angles[k] = angleToParam(bCircles.arcs[k], ang);
        render(); renderSidebar();
      });
    });
    const pts = bCandidatePoints(bCircles, aCircles);
    pts.forEach(p=>{
      const isSel = model.B.selected.some(id=>id.src===p.src && id.idx===p.idx);
      drawPoint(g, p, isSel, ()=>{ togglePoint(model.B.selected, identOf(p), 3); render(); renderSidebar(); }, theme.t2);
    });
    const triB = resolveSelected(model.B.selected, pts);
    if (triB.length===3) drawTriangle(g, triB, theme.t2);
  }
  if (stage!=='done' && model.B && model.B.T2) drawTriangle(g, model.B.T2, theme.t2);

  if (stage==='C' && cCircles){
    ['C1','C2','C3'].forEach(k=>{
      if (cCircles.arcs[k] && cCircles.arcs[k].length) drawArc(g, cCircles.anchors[k], cCircles.arcs[k], theme.c);
      if (cCircles[k]) drawHandle(g, cCircles[k], (w)=>{
        const anchor = cCircles.anchors[k];
        const ang = angleOf(anchor.center, w);
        model.C.angles[k] = angleToParam(cCircles.arcs[k], ang);
        render(); renderSidebar();
      });
    });
    const pts = cCandidatePoints(cCircles, aCircles, bCircles, model.C);
    pts.forEach(p=>{
      const isSel = model.C.selected.some(id=>id.src===p.src && id.idx===p.idx);
      drawPoint(g, p, isSel, ()=>{ togglePoint(model.C.selected, identOf(p), 3); render(); renderSidebar(); }, theme.t3);
    });
    const triC = resolveSelected(model.C.selected, pts);
    if (triC.length===3) drawTriangle(g, triC, theme.t3);
  }
  if (stage!=='done' && model.C && model.C.T3) drawTriangle(g, model.C.T3, theme.t3);

  // Finished-design view: stacked opaque layers, back to front, so T1 is frontmost and
  // fully occludes T2/T3 wherever it overlaps them, then T2 occludes T3.
  if (stage==='done') {
    if (model.C && model.C.T3) drawTriangle(g, model.C.T3, theme.t3, true);
    if (model.B && model.B.T2) drawTriangle(g, model.B.T2, theme.t2, true);
    if (model.A && model.A.T1) drawTriangle(g, model.A.T1, theme.t1, true);
  }

  // Anchor-point crosses: each non-base circle's center is where it touches the circumference
  // of whichever circle it was anchored to. Drawn last so they stay visible even under an
  // opaque finished triangle.
  if (stage==='done' && showAnchors) {
    const crossColor = theme.text;
    if (aCircles) { drawCross(g, aCircles.A2.center, crossColor); drawCross(g, aCircles.A3.center, crossColor); }
    if (bCircles) { ['B1','B2','B3'].forEach(k=>{ if (bCircles[k]) drawCross(g, bCircles[k].center, crossColor); }); }
    if (cCircles) { ['C1','C2','C3'].forEach(k=>{ if (cCircles[k]) drawCross(g, cCircles[k].center, crossColor); }); }
  }

  // Triangle vertex dots, one per corner of T1/T2/T3, drawn on top of everything else.
  if (stage==='done' && showVertices) {
    if (model.A && model.A.T1) model.A.T1.forEach(p=>drawVertexDot(g, p, theme.t1));
    if (model.B && model.B.T2) model.B.T2.forEach(p=>drawVertexDot(g, p, theme.t2));
    if (model.C && model.C.T3) model.C.T3.forEach(p=>drawVertexDot(g, p, theme.t3));
  }

  document.getElementById('stageLabel').textContent =
    stage==='setup' ? 'Setup' : stage==='A' ? 'Stage 1 — Triangle 1' : stage==='B' ? 'Stage 2 — Triangle 2' : stage==='C' ? 'Stage 3 — Triangle 3' : 'Complete';

  renderLegend();
  saveState();
}
function angleOf(center, p){ return (Math.atan2(p.y-center.y, p.x-center.x)*180/Math.PI + 360)%360; }
// Selection identity, decoupled from live coordinates — see the note above
// aCandidatePoints(). `selected` arrays store {src,idx} identifiers so a
// selection survives a handle drag; these two helpers convert between that
// identifier and the point's current (x,y) within a freshly computed
// candidate list.
function identOf(p){ return {src:p.src, idx:p.idx}; }
function resolveSelected(idents, pts){
  return idents.map(id => pts.find(p => p.src===id.src && p.idx===id.idx)).filter(Boolean);
}
function togglePoint(arr, ident, max){
  const idx = arr.findIndex(sp=>sp.src===ident.src && sp.idx===ident.idx);
  if (idx>=0) arr.splice(idx,1);
  else if (arr.length<max) arr.push(ident);
}
function renderLegend(){
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  const items = [
    ['A circles', theme.a], ['B circles', theme.b], ['C circles', theme.c],
    ['T1', theme.t1], ['T2', theme.t2], ['T3', theme.t3]
  ];
  items.forEach(([label,color])=>{
    const span = document.createElement('span');
    span.innerHTML = '<span class="swatch" style="background:'+color+'"></span>'+label;
    legend.appendChild(span);
  });
}

// ---------------------------------------------------------------
// Sidebar (stage controls)
// ---------------------------------------------------------------
const sidebar = document.getElementById('sidebar');

function renderSidebar(){
  sidebar.innerHTML='';
  if (stage==='setup') renderSetup();
  else if (stage==='A') renderStageA();
  else if (stage==='B') renderStageB();
  else if (stage==='C') renderStageC();
  else renderDone();
}

function block(title){
  const d = document.createElement('div'); d.className='block';
  if (title){ const h = document.createElement('h2'); h.className='stageTitle'; h.textContent=title; d.appendChild(h); }
  sidebar.appendChild(d);
  return d;
}
function row(parent, labelText, inputEl){
  const r = document.createElement('div'); r.className='row';
  const l = document.createElement('label'); l.textContent = labelText;
  r.appendChild(l); r.appendChild(inputEl); parent.appendChild(r); return r;
}
function note(parent, text, cls){
  const p = document.createElement('div'); p.className='note'+(cls?' '+cls:''); p.textContent=text; parent.appendChild(p); return p;
}
function btn(text, onClick, primary){
  const b = document.createElement('button'); b.textContent=text; if(primary) b.className='primary';
  b.addEventListener('click', onClick); return b;
}

function renderSetup(){
  const b = block('Setup');
  note(b, 'Enter the three radii that will be reused across every circle in every triangle stage — the shared pool that links T1, T2 and T3 together.');
  note(b, 'Progress auto-saves in this browser, so refreshing the page picks up right where you left off.');
  [0,1,2].forEach(i=>{
    const inp = document.createElement('input'); inp.type='number'; inp.min=1; inp.value=radii[i]; inp.style.width='70px';
    inp.addEventListener('change', ()=>{ radii[i]=Math.max(1, parseFloat(inp.value)||radii[i]); render(); renderSidebar(); });
    row(b, 'Radius '+(i+1)+' (mm)', inp);
  });
  const startBtn = btn('Start construction →', ()=>{
    model.A = freshA(); stage='A'; render(); renderSidebar();
  }, true);
  b.appendChild(startBtn);
}

function radiusAssignRow(parent, labelPrefix, keys, assign, onChange){
  keys.forEach((k, slot)=>{
    const sel = document.createElement('select');
    radii.forEach((rv, i)=>{ const opt=document.createElement('option'); opt.value=i; opt.textContent=rv+'mm'; sel.appendChild(opt); });
    sel.value = assign[slot];
    sel.addEventListener('change', ()=>{
      const newVal = parseInt(sel.value);
      const otherSlot = assign.findIndex((v,idx)=> idx!==slot && v===newVal);
      if (otherSlot>=0) assign[otherSlot] = assign[slot];
      assign[slot] = newVal;
      onChange();
    });
    row(parent, labelPrefix+k, sel);
  });
}

function renderStageA(){
  const a = model.A;
  const b = block('Stage 1 — Triangle 1');
  note(b, 'A1 is fixed as the base circle. A2 and A3 are centered on the A1 circumference. Drag their handles on the canvas to rotate them.');

  const baseSel = document.createElement('select');
  radii.forEach((rv,i)=>{ const opt=document.createElement('option'); opt.value=i; opt.textContent=rv+'mm'+(i===[...radii].indexOf(Math.max(...radii))?' (largest, safest)':''); baseSel.appendChild(opt); });
  baseSel.value = a.assign[0];
  baseSel.addEventListener('change', ()=>{
    const newBase = parseInt(baseSel.value);
    // swap into slot 0, keep permutation valid
    const otherSlot = a.assign.findIndex((v,idx)=>idx!==0 && v===newBase);
    if (otherSlot>=0) a.assign[otherSlot]=a.assign[0];
    a.assign[0]=newBase; a.assign[1]=null; a.assign[2]=null;
    a.selected = []; a.T1=null;
    render(); renderSidebar();
  });
  row(b, 'A1 radius (base)', baseSel);

  const c2 = circlesForA(a); // refresh after any change
  const ok12 = circleCircleIntersections(c2.A1.center,c2.A1.radius,c2.A2.center,c2.A2.radius).length===2;
  const ok13 = circleCircleIntersections(c2.A1.center,c2.A1.radius,c2.A3.center,c2.A3.radius).length===2;
  note(b, (ok12?'✓':'✗')+' A1∩A2 will intersect  ·  '+(ok13?'✓':'✗')+' A1∩A3 will intersect', (ok12&&ok13)?'valid':'invalid');
  if (!(ok12&&ok13)) note(b, 'Rule of thumb: a secondary radius r intersects base radius R (anchored on its circumference) only if r < 2R. Pick a larger base to guarantee both.', 'invalid');

  b.appendChild(btn('🎲 Randomize base + angles', ()=>{
    a.assign=[Math.floor(Math.random()*3),null,null]; a.angle2=Math.random()*360; a.angle3=Math.random()*360;
    a.selected=[]; a.T1=null; render(); renderSidebar();
  }));

  // A base/angle change can retire a previously-picked intersection (or make
  // A1 stop intersecting altogether); drop identifiers that no longer resolve
  // to a live candidate point rather than let a stale selection linger.
  const aPts = aCandidatePoints(circlesForA(a));
  a.selected = a.selected.filter(id => aPts.some(p=>p.src===id.src && p.idx===id.idx));

  const b2 = block(null);
  note(b2, 'Click 3 of the up-to-4 intersection points on the canvas to define T1. Selected: '+a.selected.length+'/3');
  if (a.selected.length===3 && !a.T1) {
    b2.appendChild(btn('Confirm T1 →', ()=>{
      a.T1 = resolveSelected(a.selected, aCandidatePoints(circlesForA(a)));
      model.B = freshB();
      model.B.assign = [0,1,2];
      stage='B'; render(); renderSidebar();
    }, true));
  } else if (a.T1) {
    note(b2, 'T1 locked.', 'valid');
    b2.appendChild(btn('Edit T1', ()=>{ a.T1=null; render(); renderSidebar(); }));
  }
}

function renderStageB(){
  const aCircles = circlesForA(model.A);
  const b = model.B;
  const bl = block('Stage 2 — Triangle 2');
  note(bl, 'Radii for B1/B2/B3 are drawn from the same pool used in Stage 1 — this shared pool is what links the triangles together.');
  radiusAssignRow(bl, '', ['B1','B2','B3'], b.assign, ()=>{ render(); renderSidebar(); });

  // B1
  const b1 = block('B1 — anchor on A2 or A3, inside T1');
  note(b1, 'A1 is excluded: T1 is inscribed in A1, so no point of A1 can lie inside T1.');
  const sel1 = document.createElement('select');
  ['A2','A3'].forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; sel1.appendChild(o); });
  sel1.value = b.targets.B1.anchor;
  sel1.addEventListener('change', ()=>{ b.targets.B1.anchor=sel1.value; render(); renderSidebar(); });
  row(b1, 'Anchor on', sel1);
  const bc1 = circlesForB(b, aCircles);
  note(b1, bc1.arcs.B1.length ? '✓ valid placement arc found' : '✗ no valid position — try the other anchor', bc1.arcs.B1.length?'valid':'invalid');

  // B2
  const b2 = block('B2 — anchor on A_x, inside a different A_y');
  const selX2 = document.createElement('select'), selY2 = document.createElement('select');
  ['A1','A2','A3'].forEach(k=>{ selX2.appendChild(new Option(k,k)); });
  selX2.value = b.targets.B2.anchorX;
  function refreshY2(){
    selY2.innerHTML='';
    ['A1','A2','A3'].filter(k=>k!==selX2.value).forEach(k=>selY2.appendChild(new Option(k,k)));
    selY2.value = ['A1','A2','A3'].includes(b.targets.B2.anchorY) && b.targets.B2.anchorY!==selX2.value ? b.targets.B2.anchorY : selY2.options[0].value;
    b.targets.B2.anchorY = selY2.value;
  }
  refreshY2();
  selX2.addEventListener('change', ()=>{ b.targets.B2.anchorX=selX2.value; refreshY2(); render(); renderSidebar(); });
  selY2.addEventListener('change', ()=>{ b.targets.B2.anchorY=selY2.value; render(); renderSidebar(); });
  row(b2, 'Anchor on', selX2); row(b2, 'Inside', selY2);
  const bc2 = circlesForB(b, aCircles);
  note(b2, bc2.arcs.B2.length ? '✓ valid placement arc found' : '✗ no valid position — try a different pair', bc2.arcs.B2.length?'valid':'invalid');

  // B3
  const b3 = block('B3 — anchor on A_x, intersects A_y');
  const selX3 = document.createElement('select'), selY3 = document.createElement('select');
  ['A1','A2','A3'].forEach(k=>{ selX3.appendChild(new Option(k,k)); selY3.appendChild(new Option(k,k)); });
  selX3.value = b.targets.B3.anchorX; selY3.value = b.targets.B3.anchorY;
  selX3.addEventListener('change', ()=>{ b.targets.B3.anchorX=selX3.value; render(); renderSidebar(); });
  selY3.addEventListener('change', ()=>{ b.targets.B3.anchorY=selY3.value; render(); renderSidebar(); });
  row(b3, 'Anchor on', selX3); row(b3, 'Intersects', selY3);
  const bc3 = circlesForB(b, aCircles);
  note(b3, bc3.arcs.B3.length ? '✓ valid placement arc found' : '✗ no valid position — try a different pair', bc3.arcs.B3.length?'valid':'invalid');

  bl.appendChild(btn('🎲 Randomize B1/B2/B3', ()=>{
    randomizeB();
    render(); renderSidebar();
  }));

  const pickBlock = block(null);
  const pts = bCandidatePoints(circlesForB(b, aCircles), aCircles);
  // A handle drag or an anchor/target dropdown change can retire a
  // previously-picked intersection; drop identifiers that no longer resolve.
  b.selected = b.selected.filter(id => pts.some(p=>p.src===id.src && p.idx===id.idx));
  note(pickBlock, 'Click 3 points (from B∩A intersections) on the canvas to define T2. Selected: '+b.selected.length+'/3');
  if (b.selected.length===3) {
    const triB = resolveSelected(b.selected, pts);
    const area = triangleArea(triB[0], triB[1], triB[2]);
    const scaleRef = Math.max(...radii);
    if (area < 0.002*scaleRef*scaleRef) {
      note(pickBlock, '⚠ These 3 points are nearly collinear — pick a less degenerate combination.', 'invalid');
    } else if (!b.T2) {
      pickBlock.appendChild(btn('Confirm T2 →', ()=>{
        b.T2 = triB;
        model.C = freshC();
        model.C.assign=[0,1,2];
        stage='C'; render(); renderSidebar();
      }, true));
    }
  }
  if (b.T2) { note(pickBlock, 'T2 locked.', 'valid'); pickBlock.appendChild(btn('Edit T2', ()=>{ b.T2=null; render(); renderSidebar(); })); }
}
function randomizeB(){
  const b = model.B;
  b.assign=[0,1,2].sort(()=>Math.random()-0.5);
  b.targets.B1.anchor = Math.random()<0.5?'A2':'A3';
  const opts = ['A1','A2','A3'];
  const x2 = opts[Math.floor(Math.random()*3)]; const y2opts = opts.filter(k=>k!==x2);
  b.targets.B2.anchorX=x2; b.targets.B2.anchorY = y2opts[Math.floor(Math.random()*y2opts.length)];
  b.targets.B3.anchorX = opts[Math.floor(Math.random()*3)];
  b.targets.B3.anchorY = opts[Math.floor(Math.random()*3)];
  b.angles = {B1:Math.random(),B2:Math.random(),B3:Math.random()};
  b.selected=[]; b.T2=null;
}

function renderStageC(){
  const aCircles = circlesForA(model.A);
  const bCircles = circlesForB(model.B, aCircles);
  const c = model.C;
  const cl = block('Stage 3 — Triangle 3');
  note(cl, 'Radii for C1/C2/C3 again come from the same shared pool.');
  radiusAssignRow(cl, '', ['C1','C2','C3'], c.assign, ()=>{ render(); renderSidebar(); });

  function anchorTargetRow(title, key, targetPool, targetLabel){
    const blk = block(title);
    const selA = document.createElement('select'); ['B1','B2','B3'].forEach(k=>selA.appendChild(new Option(k,k)));
    selA.value = c.targets[key].anchor;
    selA.addEventListener('change', ()=>{ c.targets[key].anchor=selA.value; render(); renderSidebar(); });
    row(blk, 'Anchor on', selA);
    const selT = document.createElement('select'); targetPool.forEach(k=>selT.appendChild(new Option(k,k)));
    selT.value = c.targets[key].target;
    selT.addEventListener('change', ()=>{ c.targets[key].target=selT.value; render(); renderSidebar(); });
    row(blk, targetLabel, selT);
    const cc = circlesForC(c, aCircles, bCircles);
    note(blk, cc.arcs[key].length ? '✓ valid placement arc found' : '✗ no valid position — try a different pair', cc.arcs[key].length?'valid':'invalid');
    return blk;
  }
  anchorTargetRow('C1 — anchor on B_n, intersects A_n', 'C1', ['A1','A2','A3'], 'Intersects');
  anchorTargetRow('C2 — anchor on B_m, intersects A_m', 'C2', ['A1','A2','A3'], 'Intersects');
  anchorTargetRow('C3 — anchor on B_j, intersects B_k', 'C3', ['B1','B2','B3'], 'Intersects');

  cl.appendChild(btn('🎲 Randomize C1/C2/C3', ()=>{ randomizeC(); render(); renderSidebar(); }));

  const pickBlock = block(null);
  const cPts = cCandidatePoints(circlesForC(c, aCircles, bCircles), aCircles, bCircles, c);
  // A handle drag or an anchor/target dropdown change can retire a
  // previously-picked intersection; drop identifiers that no longer resolve.
  c.selected = c.selected.filter(id => cPts.some(p=>p.src===id.src && p.idx===id.idx));
  note(pickBlock, 'Point pool follows your stated rule: C1∩A_n and C2∩A_m (B∪A family), C3∩B_k (B∪B family). Click 3 to define T3. Selected: '+c.selected.length+'/3');
  if (c.selected.length===3) {
    const triC = resolveSelected(c.selected, cPts);
    const area = triangleArea(triC[0], triC[1], triC[2]);
    const scaleRef = Math.max(...radii);
    if (area < 0.002*scaleRef*scaleRef) {
      note(pickBlock, '⚠ These 3 points are nearly collinear — pick a less degenerate combination.', 'invalid');
    } else if (!c.T3) {
      pickBlock.appendChild(btn('Confirm T3 →', ()=>{
        c.T3 = triC;
        stage='done'; render(); renderSidebar();
      }, true));
    }
  }
  if (c.T3) { note(pickBlock, 'T3 locked.', 'valid'); pickBlock.appendChild(btn('Edit T3', ()=>{ c.T3=null; render(); renderSidebar(); })); }
}
function randomizeC(){
  const c = model.C;
  c.assign=[0,1,2].sort(()=>Math.random()-0.5);
  const bOpts=['B1','B2','B3'], aOpts=['A1','A2','A3'];
  c.targets.C1 = {anchor:bOpts[Math.floor(Math.random()*3)], target:aOpts[Math.floor(Math.random()*3)]};
  c.targets.C2 = {anchor:bOpts[Math.floor(Math.random()*3)], target:aOpts[Math.floor(Math.random()*3)]};
  c.targets.C3 = {anchor:bOpts[Math.floor(Math.random()*3)], target:bOpts[Math.floor(Math.random()*3)]};
  c.angles = {C1:Math.random(),C2:Math.random(),C3:Math.random()};
  c.selected=[]; c.T3=null;
}

function renderDone(){
  const b = block('Complete');
  note(b, 'All three triangles are locked in. Toggle the scaffold, export the drawing, or start a fresh construction with the same radii pool.');
  const toggleBtn = btn(showScaffold ? 'Hide construction circles' : 'Show construction circles', ()=>{ showScaffold=!showScaffold; render(); renderSidebar(); });
  b.appendChild(toggleBtn);
  const anchorBtn = btn(showAnchors ? 'Hide anchor points (✕)' : 'Show anchor points (✕)', ()=>{ showAnchors=!showAnchors; render(); renderSidebar(); });
  b.appendChild(anchorBtn);
  note(b, 'Anchor points mark where each A2/A3, B, and C circle’s center falls on the circumference of whichever circle it was anchored to.');
  const vertexBtn = btn(showVertices ? 'Hide triangle vertices' : 'Show triangle vertices', ()=>{ showVertices=!showVertices; render(); renderSidebar(); });
  b.appendChild(vertexBtn);
  note(b, 'Small dots mark each corner of T1, T2 and T3.');
  const bb = block(null);
  bb.appendChild(btn('Export SVG', exportSVG, true));
  bb.appendChild(btn('Export JSON (parameters)', exportJSON));
  bb.appendChild(btn('🎲 New random construction', ()=>fullRandomize(0)));
}

// Choose the 3-point subset with the largest triangle area (avoids near-collinear picks).
// Falls back gracefully if fewer than 3 points are available.
function bestTriangleFromPoints(pts){
  if (pts.length < 3) return pts.slice();
  let best = null, bestArea = -1;
  for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) for (let k=j+1;k<pts.length;k++){
    const ar = triangleArea(pts[i], pts[j], pts[k]);
    if (ar > bestArea) { bestArea = ar; best = [pts[i], pts[j], pts[k]]; }
  }
  return best;
}

function fullRandomize(depth){
  depth = depth || 0;
  if (depth > 8) { stage='done'; render(); renderSidebar(); return; } // safety valve, extremely unlikely to be hit

  model.A = freshA();
  model.A.assign=[Math.floor(Math.random()*3),null,null];
  model.A.angle2=Math.random()*360; model.A.angle3=Math.random()*360;
  let pts = aCandidatePoints(circlesForA(model.A));
  let tries=0;
  while (pts.length<3 && tries<20){
    model.A.assign=[Math.floor(Math.random()*3),null,null];
    model.A.angle2=Math.random()*360; model.A.angle3=Math.random()*360;
    pts = aCandidatePoints(circlesForA(model.A));
    tries++;
  }
  const bestA = bestTriangleFromPoints(pts);
  model.A.selected = bestA.map(identOf);
  model.A.T1 = bestA;
  if (model.A.T1.length < 3) return fullRandomize(depth+1);

  model.B = freshB(); randomizeB();
  const aCircles = circlesForA(model.A);
  let bpts = bCandidatePoints(circlesForB(model.B, aCircles), aCircles);
  tries=0;
  while (bpts.length<3 && tries<30){ randomizeB(); bpts = bCandidatePoints(circlesForB(model.B, aCircles), aCircles); tries++; }
  const bestB = bestTriangleFromPoints(bpts);
  model.B.selected = bestB.map(identOf);
  model.B.T2 = bestB;
  if (model.B.T2.length < 3) return fullRandomize(depth+1);

  model.C = freshC(); randomizeC();
  const bCircles = circlesForB(model.B, aCircles);
  let cpts = cCandidatePoints(circlesForC(model.C, aCircles, bCircles), aCircles, bCircles, model.C);
  tries=0;
  while (cpts.length<3 && tries<40){ randomizeC(); cpts = cCandidatePoints(circlesForC(model.C, aCircles, bCircles), aCircles, bCircles, model.C); tries++; }
  const bestC = bestTriangleFromPoints(cpts);
  model.C.selected = bestC.map(identOf);
  model.C.T3 = bestC;
  if (model.C.T3.length < 3) return fullRandomize(depth+1);

  stage='done'; render(); renderSidebar();
}

// Local (not UTC) YYYYMMDD-HHMMSS, matching the clock the person exporting is looking at.
function exportTimestamp(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2,'0');
  return d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate())
    + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
function exportSVG(){
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('width', svg.clientWidth); clone.setAttribute('height', svg.clientHeight);
  const bgRect = el('rect', {x:0,y:0,width:svg.clientWidth,height:svg.clientHeight,fill:theme.bg});
  clone.insertBefore(bgRect, clone.firstChild);
  const src = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([src], {type:'image/svg+xml'});
  downloadBlob(blob, 'triangle-construction-'+exportTimestamp()+'.svg');
}
function exportJSON(){
  const data = { radii, A: model.A, B: model.B, C: model.C };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  downloadBlob(blob, 'triangle-construction-'+exportTimestamp()+'.json');
}
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const startOverButton = document.getElementById('startOverButton');
if (startOverButton) startOverButton.addEventListener('click', startOver);

// ---------------------------------------------------------------
// Theme — dark/light is gated by a [data-theme] attribute on <html>,
// not a prefers-color-scheme media query (see design-tokens/light.css
// and dark.css), so a toggle plus a stored preference is needed to
// ever reach dark mode. Mirrors grid-traversal/app.js's pattern.
// ---------------------------------------------------------------
const THEME_STORAGE_KEY = 'hrifa-triangle-construction-theme-v1';
const themeButton = document.getElementById('themeButton');
function applyTheme(dark){
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  if (themeButton) { themeButton.setAttribute('aria-pressed', String(dark)); themeButton.textContent = dark?'Light':'Dark'; }
}
function setTheme(dark){
  applyTheme(dark);
  try { localStorage.setItem(THEME_STORAGE_KEY, String(dark)); } catch(err) {}
  render();
}
function restoreTheme(){
  let dark = false;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    dark = saved===null ? matchMedia('(prefers-color-scheme: dark)').matches : saved==='true';
  } catch(err) {}
  applyTheme(dark);
}
if (themeButton) themeButton.addEventListener('click', ()=> setTheme(document.documentElement.dataset.theme !== 'dark'));

window.addEventListener('resize', render);
restoreTheme();
loadState();
render(); renderSidebar();
})();
