// ---------- theme ----------
const root = document.documentElement;
const themeBtn = document.getElementById('themeToggle');
const THEME_STORAGE_KEY = 'hrifa-point-construction-theme-v1';
function applyTheme(dark){
  root.setAttribute('data-theme', dark?'dark':'light');
  if(themeBtn){ themeBtn.setAttribute('aria-pressed', String(dark)); themeBtn.textContent = dark?'Light':'Dark'; }
}
function setTheme(dark){
  applyTheme(dark);
  try{ localStorage.setItem(THEME_STORAGE_KEY, String(dark)); }catch(err){}
  draw();
}
function restoreTheme(){
  let dark = false;
  try{
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    dark = saved===null ? matchMedia('(prefers-color-scheme: dark)').matches : saved==='true';
  }catch(err){}
  applyTheme(dark);
}
if(themeBtn) themeBtn.addEventListener('click', ()=> setTheme(root.dataset.theme !== 'dark'));

// ---------- RNG ----------
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(Date.now() & 0xffffffff);

// ---------- geometry helpers ----------
const dist = (p,q)=>Math.hypot(p.x-q.x, p.y-q.y);
const TAU = Math.PI*2;
function unit(v){ const L=Math.hypot(v.x,v.y)||1; return {x:v.x/L, y:v.y/L}; }
function sub(a,b){ return {x:a.x-b.x, y:a.y-b.y}; }
function add(a,b){ return {x:a.x+b.x, y:a.y+b.y}; }
function scale(v,s){ return {x:v.x*s, y:v.y*s}; }
function lerp(a,b,t){ return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}; }
function mid(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }

// ---------- true circular arc through (j, apex, k) ----------
// The "arc" role is supposed to mean an actual circular arc, not a Bézier approximation.
// But three near-collinear points imply a near-infinite radius, which is meaningless to
// draw — read symbolically, an imperceptibly large arc IS a line. The bulge (perpendicular
// distance from apex to the j–k chord) is exactly the sagitta at the apex, so a small bulge
// is a direct, chord-relative stand-in for "radius too big to matter," without ever needing
// to compute that huge radius at all.
const ARC_DEGENERATE_PX = 1.5;
function perpDistToLine(p, a, b){
  const abx=b.x-a.x, aby=b.y-a.y;
  const len = Math.hypot(abx,aby) || 1;
  return Math.abs((p.x-a.x)*aby - (p.y-a.y)*abx) / len;
}
// Circle through any 3 non-collinear points. Shared by arcThroughPoints (j/apex/k) and
// circle inversion (a line's image is the circle through O and the inverted endpoints).
function circumcircle(p1, p2, p3){
  const ax=p1.x, ay=p1.y, bx=p2.x, by=p2.y, cx=p3.x, cy=p3.y;
  const d = 2*(ax*(by-cy) + bx*(cy-ay) + cx*(ay-by));
  if(Math.abs(d) < 1e-6) return null; // collinear
  const a2=ax*ax+ay*ay, b2=bx*bx+by*by, c2=cx*cx+cy*cy;
  const ux = (a2*(by-cy) + b2*(cy-ay) + c2*(ay-by)) / d;
  const uy = (a2*(cx-bx) + b2*(ax-cx) + c2*(bx-ax)) / d;
  const center = {x:ux, y:uy};
  return { center, r: dist(center, p1) };
}
function arcThroughPoints(j, apex, k){
  if(perpDistToLine(apex, j, k) < ARC_DEGENERATE_PX) return null; // degenerate: render as a line instead
  const cc = circumcircle(j, apex, k);
  if(!cc) return null;
  const {center, r} = cc;
  const aj = Math.atan2(j.y-center.y, j.x-center.x);
  const ak = Math.atan2(k.y-center.y, k.x-center.x);
  const aa = Math.atan2(apex.y-center.y, apex.x-center.x);
  const TAU = Math.PI*2;
  const deltaK = ((ak-aj)%TAU+TAU)%TAU;      // sweeping j→k with increasing angle (canvas "clockwise")
  const deltaApex = ((aa-aj)%TAU+TAU)%TAU;
  const anticlockwise = !(deltaApex < deltaK); // apex reached before k on the increasing sweep → use it directly
  return { center, r, startAngle: aj, endAngle: ak, anticlockwise };
}

// ---------- rational (weighted) quadratic Bézier — the general conic arc ----------
// Same j/control/k as the plain quadratic mode, plus one extra number: the middle
// control point's weight w. w=1 is an ordinary (parabolic) Bézier — exactly today's
// 'bezier' mode. w<1 traces an elliptical arc, w>1 a hyperbolic one, and w→0 flattens
// to the straight line j–k. There's no closed-form path command for a general conic in
// either <canvas> or SVG, so both renderers sample this and draw a fine polyline.
function conicPoint(P0, C, P2, w, t){
  const mt = 1-t;
  const b0 = mt*mt, b1 = 2*mt*t*w, b2 = t*t;
  const denom = b0+b1+b2;
  return { x: (b0*P0.x + b1*C.x + b2*P2.x)/denom, y: (b0*P0.y + b1*C.y + b2*P2.y)/denom };
}
function sampleConic(j, control, k, w, steps=28){
  const pts = [];
  for(let i=0;i<=steps;i++) pts.push(conicPoint(j, control, k, w, i/steps));
  return pts;
}
function conicKind(w){
  if(w < 0.02) return 'line (w→0)';
  if(Math.abs(w-1) < 0.01) return 'parabola';
  return w < 1 ? 'ellipse arc' : 'hyperbola arc';
}

// ---------- catenary (hanging-chain / arch) curve ----------
// Local frame: x along the chord j→k (so j=(0,0), k=(L,0) exactly), Y measured toward
// apex. Y(x) = C - a·cosh((x-h)/a) is the arch shape (a catenary flipped to bulge toward
// apex instead of sag away from it — the correct shape for "bulges away from a chord").
// Requiring Y(0)=Y(L)=0 forces cosh(h/a)=cosh((L-h)/a), and since cosh is even/injective
// on non-negatives, that only holds at h=L/2 — the vertex always sits at the chord's exact
// midpoint. That leaves one unknown, 'a', pinned by apex's local position: solved below by
// bisection (f(a) runs from +∞ as a→0 to -apexY as a→∞, monotonically, so a root always
// exists and bisection can't diverge the way Newton's method sometimes does on this shape).
function catenaryFit(L, ax, ay){
  const h = L/2;
  const f = a => a*(Math.cosh(h/a) - Math.cosh((ax-h)/a)) - ay;
  let lo = Math.max(L/40, 1), hi = Math.max(L, 1)*10 + 500;
  let guard = 0;
  while(!(f(lo) > 0) && guard++ < 30){ lo /= 1.7; if(lo < 1e-4) return null; }
  guard = 0;
  while(!(f(hi) < 0) && guard++ < 30){ hi *= 1.7; }
  if(!(f(lo) > 0) || !(f(hi) < 0)) return null;
  for(let i=0;i<70;i++){
    const mid = (lo+hi)/2;
    if(f(mid) > 0) lo = mid; else hi = mid;
  }
  const a = (lo+hi)/2;
  return { a, h, C: a*Math.cosh(h/a) };
}
function catenaryFrame(j, apex, k){
  const L = dist(j, k);
  if(L < 2) return null; // j and k coincide — no chord to hang from
  const u = unit(sub(k, j));
  let v = { x:-u.y, y:u.x };
  const rel = sub(apex, j);
  const ax = rel.x*u.x + rel.y*u.y;
  let ay = rel.x*v.x + rel.y*v.y;
  if(ay < 0){ v = {x:-v.x, y:-v.y}; ay = -ay; } // v always points toward apex
  if(ay < ARC_DEGENERATE_PX) return null; // apex barely off the chord — no meaningful sag
  const fit = catenaryFit(L, ax, ay);
  if(!fit) return null;
  return { j, u, v, L, fit };
}
function catenaryPoint(frame, t){
  const x = t*frame.L;
  const Y = frame.fit.C - frame.fit.a*Math.cosh((x-frame.fit.h)/frame.fit.a);
  return { x: frame.j.x + frame.u.x*x + frame.v.x*Y, y: frame.j.y + frame.u.y*x + frame.v.y*Y };
}
function sampleCatenary(j, apex, k, steps=32){
  const frame = catenaryFrame(j, apex, k);
  if(!frame) return null;
  const pts = [];
  for(let i=0;i<=steps;i++) pts.push(catenaryPoint(frame, i/steps));
  return { pts, a: frame.fit.a };
}

// ---------- circle inversion (transform prototype) ----------
// Hold a circle constant (its own center O, radius r — self-referential, no external
// knob) and invert everything else through it: P' = O + (r²/|P-O|²)(P-O). Lines not
// through O become circles/arcs through O; circles not through O become other circles;
// anything through O maps to a line. See quasi-solarized-theme.html's sibling doc for
// the design conversation this came out of.
const INVERSION_EPS = 1.5; // px — "close enough to O / the line" to treat as the through-O case
function invertPoint(p, O, r){
  const dx=p.x-O.x, dy=p.y-O.y;
  const d2 = dx*dx+dy*dy;
  if(d2 < 1e-6) return null; // P is at O — maps to infinity, undefined
  const k = (r*r)/d2;
  return { x: O.x+k*dx, y: O.y+k*dy };
}
// The arc (not containing O) between two image points on a known circle — the correct
// inversive-geometry image of a finite line SEGMENT (as opposed to the full infinite line,
// which would map to the whole circle). Mirrors arcThroughPoints' sweep-direction logic,
// just steered away from O's angle instead of toward a designated apex.
function arcAvoiding(center, r, aStart, aEnd, avoid){
  const TAU = Math.PI*2;
  const as = Math.atan2(aStart.y-center.y, aStart.x-center.x);
  const ae = Math.atan2(aEnd.y-center.y, aEnd.x-center.x);
  const av = Math.atan2(avoid.y-center.y, avoid.x-center.x);
  const deltaE = ((ae-as)%TAU+TAU)%TAU;
  const deltaAvoid = ((av-as)%TAU+TAU)%TAU;
  const anticlockwise = deltaAvoid < deltaE; // if O falls on the increasing sweep, take the other way
  return { center, r, startAngle: as, endAngle: ae, anticlockwise };
}
function segmentProjection(p, a, b){
  const ab=sub(b,a);
  const lengthSquared=ab.x*ab.x+ab.y*ab.y;
  const t=lengthSquared ? ((p.x-a.x)*ab.x+(p.y-a.y)*ab.y)/lengthSquared : 0;
  return { t, point:add(a, scale(ab, t)) };
}
// What a circle OR a *circular* arc contributes as the inversion's O/r: a circle
// uses its own center/radius; a circular arc uses its supporting circle. A Bézier,
// conic, or catenary may be inverted THROUGH a circle, but is not itself an
// inversion circle, so it cannot be held constant in this control.
function inversionSourceFor(el){
  if(el.type==='circle') return { O: el.center, r: el.radius };
  if(el.type==='arc' && document.getElementById('curveStyle').value==='circular'){
    const c = arcThroughPoints(el.j, el.apex, el.k);
    return c ? { O: c.center, r: c.r } : null;
  }
  return null;
}

// The source path must be shared by drawing, picking, and inversion. In particular,
// an element with role "arc" is not necessarily a circular arc in the selected mode.
function arcPathPoints(el, steps=160){
  const curveStyle = document.getElementById('curveStyle').value;
  if(curveStyle==='circular'){
    const c = arcThroughPoints(el.j, el.apex, el.k);
    if(!c) return [el.j, el.k];
    const sweep = c.anticlockwise
      ? -(((c.startAngle-c.endAngle)%TAU+TAU)%TAU)
      : (((c.endAngle-c.startAngle)%TAU+TAU)%TAU);
    const pts=[];
    for(let i=0;i<=steps;i++){
      const a=c.startAngle+sweep*(i/steps);
      pts.push({x:c.center.x+c.r*Math.cos(a), y:c.center.y+c.r*Math.sin(a)});
    }
    return pts;
  }
  if(curveStyle==='conic') return sampleConic(el.j, el.control, el.k, +document.getElementById('conicWeight').value, steps);
  if(curveStyle==='catenary'){
    const cat = sampleCatenary(el.j, el.apex, el.k, steps);
    return cat ? cat.pts : [el.j, el.k];
  }
  const pts=[];
  for(let i=0;i<=steps;i++) pts.push(bezierPoint(el.j, el.control, el.k, i/steps));
  return pts;
}

function circularArcContainsPoint(arc, point){
  if(Math.abs(dist(arc.center, point)-arc.r) > INVERSION_EPS) return false;
  const angle=Math.atan2(point.y-arc.center.y, point.x-arc.center.x);
  const span=arc.anticlockwise
    ? ((arc.startAngle-arc.endAngle)%TAU+TAU)%TAU
    : ((arc.endAngle-arc.startAngle)%TAU+TAU)%TAU;
  const progress=arc.anticlockwise
    ? ((arc.startAngle-angle)%TAU+TAU)%TAU
    : ((angle-arc.startAngle)%TAU+TAU)%TAU;
  return progress <= span+1e-6;
}

// A non-circular curve has no circle/line shortcut under inversion. Sample its
// displayed geometry and invert every sample. Break the path around O: that point
// maps to infinity, so joining across it would draw a false finite segment.
function invertPath(points, O, r){
  const paths=[];
  let path=[];
  for(const point of points){
    if(dist(point,O) < INVERSION_EPS){
      if(path.length>1) paths.push(path);
      path=[];
      continue;
    }
    const inverted=invertPoint(point,O,r);
    if(inverted) path.push(inverted);
  }
  if(path.length>1) paths.push(path);
  return paths;
}

// Returns a render-ready descriptor: {kind:'point'|'line'|'rays'|'circle'|'arc'|'path', ...} or null
// if el itself is at/through the inversion center (an undefined image).
function invertMark(el, O, r){
  if(el.type==='point'){
    const p = invertPoint(el.p, O, r);
    return p ? {kind:'point', p} : null;
  }
  if(el.type==='circle'){
    const d2 = (el.center.x-O.x)**2 + (el.center.y-O.y)**2;
    if(Math.abs(d2 - el.radius*el.radius) < el.radius*0.02){
      // passes through O → image is a line, perpendicular to the O–center axis
      const dir = unit(sub(el.center, O));
      const dLine = (r*r)/(2*el.radius);
      const base = add(O, scale(dir, dLine));
      const perp = {x:-dir.y, y:dir.x};
      return {kind:'line', a: add(base, scale(perp, 2000)), b: add(base, scale(perp, -2000))};
    }
    const k = (r*r)/(d2 - el.radius*el.radius);
    return {kind:'circle', center: add(O, scale(sub(el.center,O), k)), radius: Math.abs(k)*el.radius};
  }
  if(el.type==='line'){
    const projection=segmentProjection(O, el.j, el.k);
    const lineDistance=dist(O, projection.point);
    if(lineDistance < 1e-6){
      // Inversion preserves the supporting line. For a finite segment, though,
      // whether O belongs to the segment is decisive: a crossing becomes two
      // unbounded rays, while a segment wholly on one side remains finite.
      if(projection.t < 0 || projection.t > 1){
        const jp=invertPoint(el.j, O, r), kp=invertPoint(el.k, O, r);
        if(!jp || !kp) return null;
        return {kind:'line', a:jp, b:kp};
      }
      if(projection.t === 0){
        const kp=invertPoint(el.k, O, r);
        if(!kp) return null;
        const towardInfinity=unit(sub(el.k, O));
        return {kind:'rays', rays:[{a:kp, b:add(kp, scale(towardInfinity, 2000))}]};
      }
      if(projection.t === 1){
        const jp=invertPoint(el.j, O, r);
        if(!jp) return null;
        const towardInfinity=unit(sub(el.j, O));
        return {kind:'rays', rays:[{a:jp, b:add(jp, scale(towardInfinity, 2000))}]};
      }
      const jp=invertPoint(el.j, O, r), kp=invertPoint(el.k, O, r);
      if(!jp || !kp) return null;
      return {kind:'rays', rays:[
        {a:jp, b:add(jp, scale(unit(sub(el.j, O)), 2000))},
        {a:kp, b:add(kp, scale(unit(sub(el.k, O)), 2000))},
      ]};
    }
    const jp = invertPoint(el.j, O, r), kp = invertPoint(el.k, O, r);
    if(!jp || !kp) return null;
    const cc = circumcircle(O, jp, kp);
    if(!cc) return null;
    return {kind:'arc', ...arcAvoiding(cc.center, cc.r, jp, kp, O)};
  }
  if(el.type==='arc'){
    if(document.getElementById('curveStyle').value!=='circular'){
      const paths = invertPath(arcPathPoints(el), O, r);
      return paths.length ? {kind:'path', paths} : null;
    }
    const sourceArc=arcThroughPoints(el.j, el.apex, el.k);
    if(sourceArc && circularArcContainsPoint(sourceArc, O)){
      const paths=invertPath(arcPathPoints(el, 320), O, r);
      return paths.length ? {kind:'path', paths} : null;
    }
    const jp = invertPoint(el.j, O, r), ap = invertPoint(el.apex, O, r), kp = invertPoint(el.k, O, r);
    if(!jp || !ap || !kp) return null;
    const arc = arcThroughPoints(jp, ap, kp);
    if(arc) return {kind:'arc', ...arc};
    return {kind:'line', a: jp, b: kp}; // the 3 images came out ~collinear
  }
  return null;
}

function generatePoints(n){
  const pts = [];
  let attempts = 0;
  while(pts.length < n && attempts < 4000){
    attempts++;
    const cand = { x: 25 + rng()*450, y: 25 + rng()*450 };
    if(pts.every(p => dist(p,cand) > 34)){
      pts.push({ id: pts.length, x: cand.x, y: cand.y });
    }
  }
  while(pts.length < n) pts.push({ id: pts.length, x: 25+rng()*450, y: 25+rng()*450 });
  return pts;
}

function weightedChoice(types, weights, r){
  const total = types.reduce((s,t)=>s+Math.max(weights[t],0.0001),0);
  let x = r()*total;
  for(const t of types){
    x -= Math.max(weights[t],0.0001);
    if(x<=0) return t;
  }
  return types[types.length-1];
}

// ---------- role assignment (phase 1: all positions + all roles fixed before any execution) ----------
function assignRoles(points, weights){
  const roles = {};
  for(const p of points){
    roles[p.id] = weightedChoice(['point','circle','line','arc'], weights, rng);
  }
  // line/arc points pair only with same-role points, so each pool must be even — flip the
  // odd one out (highest index) to 'point' rather than leave it stranded with no partner.
  const parityLog = [];
  for(const t of ['line','arc']){
    const ids = points.filter(p => roles[p.id]===t).map(p=>p.id);
    if(ids.length % 2 === 1){
      const flip = ids[ids.length-1];
      roles[flip] = 'point';
      parityLog.push(`P${flip} ${t}→point (odd one out, no same-role partner)`);
    }
  }
  return { roles, parityLog };
}

// ---------- construction algorithm (phase 2: execute in P0→Pn order) ----------
// Split from role assignment so "Construction Rules" changes (nth-closest, apex
// placement) can re-run just this deterministic phase against the SAME fixed
// roles/pairings, instead of consuming rng and re-rolling which point becomes
// which shape every time a slider moves.
let lastRoles = null, lastParityLog = [];

function executeConstruction(points, roles, parityLog, nthClosest=1, apexMode='ratio'){
  const usedUp = new Set();
  const attached = new Set();
  const elements = [];
  const log = parityLog.map(text => ({cls:'step-point', text: `⚖ ${text}`}));

  for(let i=0;i<points.length;i++){
    const p = points[i];
    if(usedUp.has(p.id) || attached.has(p.id)) continue;

    const type = roles[p.id];

    if(type==='point'){
      usedUp.add(p.id);
      elements.push({type:'point', p});
      log.push({cls:'step-point', text:`P${i} → POINT · marked & retired`});

    } else if(type==='circle'){
      const pool = points.filter(q => q.id!==p.id && !usedUp.has(q.id)).sort((a,b)=>dist(p,a)-dist(p,b));
      if(pool.length<2){
        usedUp.add(p.id);
        elements.push({type:'point', p});
        log.push({cls:'step-point', text:`P${i} → POINT (fallback, <2 refs available)`});
        continue;
      }
      const a=pool[0], b=pool[1];
      const da=dist(p,a), db=dist(p,b);
      const radius = (da*da)/db;
      const center = p;
      usedUp.add(p.id);
      elements.push({type:'circle', o:p, a, b, center, radius, da, db});
      log.push({cls:'step-circle', text:`P${i} → CIRCLE · center=P${i} refs a=P${a.id}(${da.toFixed(0)}) b=P${b.id}(${db.toFixed(0)}) ratio ${ (da/db).toFixed(2) }:1 → r=${radius.toFixed(1)}`});

    } else if(type==='line'){
      const samePool = points.filter(q => q.id!==p.id && roles[q.id]==='line' && !attached.has(q.id));
      if(samePool.length===0){
        usedUp.add(p.id);
        elements.push({type:'point', p});
        log.push({cls:'step-point', text:`P${i} → POINT (fallback, no unpaired line partner left)`});
        continue;
      }
      const sorted = samePool.slice().sort((a,b)=>dist(p,a)-dist(p,b));
      const kIdx = Math.min(nthClosest-1, sorted.length-1);
      const k = sorted[kIdx];
      attached.add(p.id); attached.add(k.id);
      elements.push({type:'line', j:p, k});
      log.push({cls:'step-line', text:`P${i} → LINE · j=P${p.id} k=P${k.id} (#${kIdx+1} closest same-role) len=${dist(p,k).toFixed(0)}`});

    } else if(type==='arc'){
      const samePool = points.filter(q => q.id!==p.id && roles[q.id]==='arc' && !attached.has(q.id));
      if(samePool.length===0){
        usedUp.add(p.id);
        elements.push({type:'point', p});
        log.push({cls:'step-point', text:`P${i} → POINT (fallback, no unpaired arc partner left)`});
        continue;
      }
      const sorted = samePool.slice().sort((a,b)=>dist(p,a)-dist(p,b));
      const kIdx = Math.min(nthClosest-1, sorted.length-1);
      const k = sorted[kIdx];
      attached.add(p.id); attached.add(k.id);
      const j=p;
      const jk = dist(j,k);

      const others = points.filter(q => q.id!==j.id && q.id!==k.id);
      let best=null, bestDist=Infinity, bestFrom=null;
      for(const q of others){
        const dj = dist(q,j), dk = dist(q,k);
        if(dj<bestDist){ bestDist=dj; best=q; bestFrom='j'; }
        if(dk<bestDist){ bestDist=dk; best=q; bestFrom='k'; }
      }
      let l, m, apex, control;
      if(best){
        const e = best;
        // selected endpoint = nearer to e; opposite endpoint is the ratio's origin (mirrors circle: da²/db)
        const selected = bestFrom==='j' ? j : k;
        const opposite = bestFrom==='j' ? k : j;
        const opp_e = dist(opposite, e); // opposite endpoint → e
        const lDist = (jk*jk) / (jk + opp_e);
        l = add(opposite, scale(unit(sub(selected, opposite)), lDist));
        const rest = points.filter(q => q.id!==j.id && q.id!==k.id).sort((a,b)=>dist(l,a)-dist(l,b));
        m = rest[0] || lerp(j,k,0.5);

        if(apexMode==='ratio'){
          // A=m, B=selected endpoint, C=opposite endpoint: AB=dist(m,selected), AC=dist(m,opposite),
          // R=AB:AC, apex plotted from m toward selected at distance AB*R
          const AB = dist(m, selected), AC = dist(m, opposite);
          const R = AC>0 ? AB/AC : 0;
          apex = add(m, scale(unit(sub(selected, m)), AB*R));
        } else {
          apex = m;
        }
        control = add(scale(apex,2), scale(add(j,k), -0.5));
        elements.push({type:'arc', j, k, e, l, m, apex, control, selected, opposite, selDist:bestDist, opp_e});
        log.push({cls:'step-arc', text:`P${i} → ARC · j=P${j.id} k=P${k.id} e=P${e.id}(near ${bestFrom}) jk=${jk.toFixed(0)} opp-e=${opp_e.toFixed(0)} l-dist=${lDist.toFixed(1)} apex-src m=P${m.id}${apexMode==='ratio' ? ' → ratio-placed apex' : ' (coincident)'}`});
      } else {
        elements.push({type:'line', j, k});
        log.push({cls:'step-line', text:`P${i} → ARC fallback→LINE (no reference point) j=P${j.id} k=P${k.id}`});
      }
    }
  }
  return { elements, log };
}

// Full pipeline: rolls fresh roles (consumes rng) then executes. Used for "New points"
// and "Re-run" (an explicit re-roll of the same points) and whenever the type weights
// change, since weights are themselves an input to role assignment.
function runConstruction(points, weights, nthClosest=1, apexMode='ratio'){
  const { roles, parityLog } = assignRoles(points, weights);
  lastRoles = roles; lastParityLog = parityLog;
  return executeConstruction(points, roles, parityLog, nthClosest, apexMode);
}

// Construction Rules only: re-runs phase 2 against whatever roles were assigned last,
// with no rng involved — same shapes, same pairings, just re-geometrized.
function reexecuteConstruction(points, nthClosest=1, apexMode='ratio'){
  if(!lastRoles) return null;
  return executeConstruction(points, lastRoles, lastParityLog, nthClosest, apexMode);
}

// ---------- rendering ----------
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let points = [];
let result = { elements: [], log: [] };
let hoveredIndex = null;
let inversionCircleIndex = null; // index into result.elements of the constant circle, or null
let pickingInversionCircle = false;
let tractrixLeadIndex = null;
let pickingTractrixLead = false;
let tractrixAnimationFrame = null;
let spiralSourceIndex = null;
let pickingSpiralSource = false;

function cssVar(name){ return getComputedStyle(root).getPropertyValue(name).trim(); }

function leadPathPoints(el, steps=240){
  if(el.type==='line'){
    const pts=[];
    for(let i=0;i<=steps;i++) pts.push(lerp(el.j, el.k, i/steps));
    return pts;
  }
  if(el.type==='arc') return arcPathPoints(el, steps);
  if(el.type==='circle'){
    const pts=[];
    for(let i=0;i<=steps;i++){
      const a=TAU*i/steps;
      pts.push({x:el.center.x+el.radius*Math.cos(a), y:el.center.y+el.radius*Math.sin(a)});
    }
    return pts;
  }
  return null;
}

// Discrete taut-string construction: each follower step lies on the old tether ray
// and exactly one tether length from the next lead point. With dense lead samples,
// this converges to the usual tractrix differential curve.
function tractrixTrace(lead, tether, side='left', initialFollower=null){
  if(!lead || lead.length<2 || tether<=0) return null;
  const initialTangent=unit(sub(lead[1], lead[0]));
  const normal=side==='right'
    ? {x:initialTangent.y, y:-initialTangent.x}
    : {x:-initialTangent.y, y:initialTangent.x};
  let follower=initialFollower || add(lead[0], scale(normal, tether));
  const trace=[follower];
  for(let i=1;i<lead.length;i++){
    const oldLead=lead[i-1], nextLead=lead[i];
    const direction=unit(sub(oldLead, follower));
    const offset=sub(follower, nextLead);
    const b=2*(offset.x*direction.x+offset.y*direction.y);
    const c=offset.x*offset.x+offset.y*offset.y-tether*tether;
    const discriminant=b*b-4*c;
    if(discriminant < -1e-6) continue;
    const root=Math.sqrt(Math.max(0, discriminant));
    const candidates=[(-b-root)/2, (-b+root)/2].filter(s=>s>=-1e-6);
    if(!candidates.length) continue;
    const step=Math.max(0, Math.min(...candidates));
    follower=add(follower, scale(direction, step));
    trace.push(follower);
  }
  return trace;
}
function currentTractrix(){
  if(tractrixLeadIndex===null) return null;
  const lead=result.elements[tractrixLeadIndex];
  const path=lead ? leadPathPoints(lead) : null;
  if(!path) return null;
  const tether=+document.getElementById('tractrixLength').value;
  const side=document.getElementById('tractrixSide').value;
  const apexIndex=Math.round((path.length-1) * (+document.getElementById('tractrixApex').value/100));
  const compressionLead=path.slice(0, apexIndex+1);
  const tensionLead=path.slice(apexIndex);
  if(compressionLead.length<2 || tensionLead.length<2) return null;
  const apexTangent=unit(sub(tensionLead[1], tensionLead[0]));
  const apexNormal=side==='right'
    ? {x:apexTangent.y, y:-apexTangent.x}
    : {x:-apexTangent.y, y:apexTangent.x};
  const apex=add(path[apexIndex], scale(apexNormal, tether));
  const reverseCompressionLead=compressionLead.slice().reverse();
  const oppositeSide=side==='left' ? 'right' : 'left';
  // Run the earlier, actual part of the lead away from the apex under tension,
  // then reverse it: in forward time that is the rod's compression arm.
  const compression=tractrixTrace(reverseCompressionLead, tether, oppositeSide, apex);
  const tension=tractrixTrace(tensionLead, tether, side, apex);
  if(!compression || !tension) return null;
  const compressionForward=compression.slice().reverse();
  return {
    compression: compressionForward,
    tension,
    trace: compressionForward.concat(tension.slice(1)),
    lead: path,
    apexLead: path[apexIndex],
  };
}
function spiralSourceFor(el){
  if(el.type==='circle') return {center:el.center, radius:el.radius, baseAngle:0};
  if(el.type==='arc' && document.getElementById('curveStyle').value==='circular'){
    const circle=arcThroughPoints(el.j, el.apex, el.k);
    return circle ? {center:circle.center, radius:circle.r, baseAngle:circle.startAngle} : null;
  }
  return null;
}
// Inverse of the involute of a circle of radius a about the same centre:
// a/(1+t²) · (cos t + t sin t, sin t − t cos t). This is the exact
// spiral (polar) tractrix, not the general rod-trace construction above.
function spiralTractrixPoints(source, turns, phaseDegrees, direction, steps=480){
  const pts=[];
  const phase=source.baseAngle+phaseDegrees*Math.PI/180;
  const maxT=turns*TAU;
  for(let i=0;i<=steps;i++){
    const t=direction*maxT*(i/steps);
    const denom=1+t*t;
    const x=source.radius*(Math.cos(t)+t*Math.sin(t))/denom;
    const y=source.radius*(Math.sin(t)-t*Math.cos(t))/denom;
    const c=Math.cos(phase), s=Math.sin(phase);
    pts.push({x:source.center.x+c*x-s*y, y:source.center.y+s*x+c*y});
  }
  return pts;
}
function currentSpiralTractrix(){
  if(spiralSourceIndex===null) return null;
  const source=spiralSourceFor(result.elements[spiralSourceIndex]);
  if(!source) return null;
  return spiralTractrixPoints(source, +document.getElementById('spiralTurns').value, +document.getElementById('spiralPhase').value, +document.getElementById('spiralDirection').value);
}

// ---------- per-instance color variants (same family, distinguishable members) ----------
// Preserves the ~44° hue-shift spread across however many instances of a role exist,
// so e.g. three arcs read as one family (same base hue) while staying tellable apart.
function hexToHsl(hex){
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0, s=0; const l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      default: h=(r-g)/d+4;
    }
    h/=6;
  }
  return {h:h*360, s:s*100, l:l*100};
}
function variantColor(baseHex, index, total){
  const {h,s,l} = hexToHsl(baseHex);
  if(total<=1) return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
  const spread = 44;
  const step = spread/Math.max(total-1,1);
  const newH = (h - spread/2 + step*index + 360) % 360;
  const lJit = l + (index%2===0 ? -5 : 5);
  return `hsl(${newH.toFixed(1)} ${s.toFixed(1)}% ${Math.min(85,Math.max(30,lJit)).toFixed(1)}%)`;
}

// ---------- hit-testing for hover ----------
function distToSegment(p, a, b){
  const l2 = (b.x-a.x)**2+(b.y-a.y)**2;
  if(l2===0) return dist(p,a);
  let t = ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, {x:a.x+t*(b.x-a.x), y:a.y+t*(b.y-a.y)});
}
function bezierPoint(j,c,k,t){
  const mt=1-t;
  return {x:mt*mt*j.x+2*mt*t*c.x+t*t*k.x, y:mt*mt*j.y+2*mt*t*c.y+t*t*k.y};
}
function distToPolyline(p, pts){
  let best=Infinity;
  for(let i=1;i<pts.length;i++) best=Math.min(best, distToSegment(p, pts[i-1], pts[i]));
  return best;
}
function hitTest(mouse){
  for(let i=result.elements.length-1;i>=0;i--){
    const el = result.elements[i];
    if(el.type==='line' && distToSegment(mouse, el.j, el.k) < 7) return i;
    if(el.type==='arc' && distToPolyline(mouse, arcPathPoints(el, 96)) < 7) return i;
    if(el.type==='circle' && Math.abs(dist(mouse, el.center) - el.radius) < 7) return i;
    if(el.type==='point' && dist(mouse, el.p) < 11) return i;
  }
  return null;
}
function relatedPoints(el){
  if(el.type==='line') return [el.j, el.k];
  if(el.type==='arc') return [el.j, el.k, el.e, el.l, el.m, el.apex];
  if(el.type==='circle') return [el.center, el.a, el.b];
  if(el.type==='point') return [el.p];
  return [];
}
function elementLabel(el){
  if(el.type==='line') return `Line · P${el.j.id}–P${el.k.id}`;
  if(el.type==='arc') return `Arc · P${el.j.id}–P${el.k.id}`;
  if(el.type==='circle') return `Circle · center P${el.o.id}`;
  if(el.type==='point') return `Point · P${el.p.id}`;
  return '';
}
// Recomputed straight from the element's own stored points/values rather than parsed
// out of the log text, so it stays correct regardless of log ordering/fallback rows.
function elementStats(el){
  if(el.type==='point'){
    return [
      ['point', 'P'+el.p.id],
      ['position', `${el.p.x.toFixed(1)}, ${el.p.y.toFixed(1)}`],
    ];
  }
  if(el.type==='line'){
    return [
      ['j', 'P'+el.j.id],
      ['k', 'P'+el.k.id],
      ['length', dist(el.j, el.k).toFixed(1)],
    ];
  }
  if(el.type==='circle'){
    return [
      ['center', 'P'+el.o.id],
      ['a — 1st closest', `P${el.a.id} · ${el.da.toFixed(1)}`],
      ['b — 2nd closest', `P${el.b.id} · ${el.db.toFixed(1)}`],
      ['ratio a:b', `${(el.da/el.db).toFixed(2)}:1`],
      ['radius (da²/db)', el.radius.toFixed(1)],
    ];
  }
  if(el.type==='arc'){
    const jk = dist(el.j, el.k);
    const nearLabel = el.selected===el.j ? 'j' : 'k';
    const stats = [
      ['j', 'P'+el.j.id],
      ['k', 'P'+el.k.id],
      [`e — closest (near ${nearLabel})`, `P${el.e.id} · ${el.selDist.toFixed(1)}`],
      ['j:k (AB)', jk.toFixed(1)],
      ['opposite:e (AC)', el.opp_e.toFixed(1)],
      ['apex source m', 'P'+el.m.id],
      ['apex mode', el.apex===el.m ? 'coincident with m' : 'ratio-placed'],
    ];
    if(el.apex!==el.m){
      stats.push(['apex offset from m', dist(el.m, el.apex).toFixed(1)]);
    }
    const curveStyle = document.getElementById('curveStyle').value;
    if(curveStyle==='circular'){
      const c = arcThroughPoints(el.j, el.apex, el.k);
      const bulge = perpDistToLine(el.apex, el.j, el.k);
      stats.push(['curve', c ? `circular · r=${c.r.toFixed(1)}` : `flattened to line (bulge ${bulge.toFixed(2)} < ${ARC_DEGENERATE_PX})`]);
    } else if(curveStyle==='conic'){
      const w = +document.getElementById('conicWeight').value;
      stats.push(['curve', `conic · w=${w.toFixed(2)} (${conicKind(w)})`]);
    } else if(curveStyle==='catenary'){
      const cat = sampleCatenary(el.j, el.apex, el.k);
      stats.push(['curve', cat ? `catenary · a=${cat.a.toFixed(1)}` : 'flattened to line (chord too short / apex too close to it)']);
    } else {
      stats.push(['curve', 'quadratic bezier']);
    }
    return stats;
  }
  return [];
}
function renderStats(el){
  const panel = document.getElementById('statsPanel');
  if(!el){
    panel.innerHTML = '<div class="stats-empty">Hover a line, arc, circle, or point to see its construction stats.</div>';
    return;
  }
  const rows = elementStats(el).map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('');
  panel.innerHTML = `<div class="stats-head">${elementLabel(el)}</div><dl>${rows}</dl>`;
}

// ---------- construction identity (deterministic fingerprint of this exact result) ----------
function hashString(str){
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i=0;i<str.length;i++){
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
  h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
  return (4294967296*(2097151 & h2) + (h1>>>0)).toString(16);
}
function constructionSignature(){
  const p = points.map(pt => `${pt.id}:${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join('|');
  const e = result.elements.map(el => {
    if(el.type==='point') return `pt(${el.p.id})`;
    if(el.type==='circle') return `ci(${el.o.id},${el.a.id},${el.b.id})`;
    if(el.type==='line') return `ln(${el.j.id},${el.k.id})`;
    if(el.type==='arc') return `ar(${el.j.id},${el.k.id},${el.e.id},${el.m.id},${el.apex.x.toFixed(1)}:${el.apex.y.toFixed(1)})`;
    return '';
  }).join('|');
  const cfg = `nth=${document.getElementById('nthClosest').value}|apex=${document.getElementById('apexMode').value}`;
  return `${p}::${e}::${cfg}`;
}
function identity(){
  return 'PC-' + hashString(constructionSignature()).toUpperCase().padStart(10,'0');
}
function updateIdentity(){
  document.getElementById('identityTag').textContent = identity();
}

// ---------- SVG export ----------
function exportSVG(){
  const showGrid = document.getElementById('gridChk').checked;
  const showGuides = document.getElementById('guidesChk').checked;
  const showLabels = document.getElementById('labelsChk').checked;
  const showArcCircle = document.getElementById('arcCircleChk').checked;
  const curveStyle = document.getElementById('curveStyle').value;
  const conicWeight = +document.getElementById('conicWeight').value;
  const paper = cssVar('--neutral-surface-raised');
  const gridColor = cssVar('--neutral-border');
  const inkDim = cssVar('--neutral-text-muted');
  const border = cssVar('--neutral-border');
  const baseColor = {
    line: cssVar('--shape-line'), arc: cssVar('--shape-arc'),
    circle: cssVar('--shape-circle'), point: cssVar('--shape-point'),
  };
  const monoFont = cssVar('--font-mono') || 'ui-monospace, Menlo, Consolas, monospace';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const f = n => n.toFixed(1);

  const svgDot = (p,color,r,opacity=1) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${r}" fill="${color}" opacity="${opacity}"/>\n`;
  const svgCrosshair = (p,color,size=6) => `<path d="M${f(p.x-size)} ${f(p.y)} L${f(p.x+size)} ${f(p.y)} M${f(p.x)} ${f(p.y-size)} L${f(p.x)} ${f(p.y+size)}" stroke="${color}" stroke-width="1.4" fill="none"/>\n`;
  const svgLabel = (p,text,color) => {
    const w = text.length*5.4+6;
    return `<rect x="${f(p.x-w/2)}" y="${f(p.y-6)}" width="${f(w)}" height="12" fill="${paper}" opacity="0.85"/>\n`
      + `<text x="${f(p.x)}" y="${f(p.y+3)}" text-anchor="middle" font-size="9" font-weight="600" fill="${color}">${esc(text)}</text>\n`;
  };

  const typeCounts = {line:0, arc:0, circle:0, point:0};
  for(const el of result.elements) typeCounts[el.type]++;
  const typeSeen = {line:0, arc:0, circle:0, point:0};

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 536" width="500" height="536" font-family="${esc(monoFont)}">\n`;
  svg += `<rect x="0" y="0" width="500" height="536" fill="${paper}"/>\n`;

  if(showGrid){
    for(let x=0;x<=500;x+=25) svg += `<line x1="${x}" y1="0" x2="${x}" y2="500" stroke="${gridColor}" stroke-width="0.8" opacity="0.6"/>\n`;
    for(let y=0;y<=500;y+=25) svg += `<line x1="0" y1="${y}" x2="500" y2="${y}" stroke="${gridColor}" stroke-width="0.8" opacity="0.6"/>\n`;
  }

  for(const el of result.elements){
    const idx = typeSeen[el.type]++;
    const col = variantColor(baseColor[el.type], idx, typeCounts[el.type]);

    if(el.type==='line'){
      svg += `<line x1="${f(el.j.x)}" y1="${f(el.j.y)}" x2="${f(el.k.x)}" y2="${f(el.k.y)}" stroke="${col}" stroke-width="2"/>\n`;
      svg += svgDot(el.j,col,3.5) + svgDot(el.k,col,3.5);

    } else if(el.type==='arc'){
      if(curveStyle==='circular'){
        const c = arcThroughPoints(el.j, el.apex, el.k);
        if(c){
          const large = c.anticlockwise
            ? (((c.startAngle-c.endAngle)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)) > Math.PI
            : (((c.endAngle-c.startAngle)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)) > Math.PI;
          const sweep = c.anticlockwise ? 0 : 1;
          svg += `<path d="M${f(el.j.x)} ${f(el.j.y)} A${f(c.r)} ${f(c.r)} 0 ${large?1:0} ${sweep} ${f(el.k.x)} ${f(el.k.y)}" stroke="${col}" stroke-width="2" fill="none"/>\n`;
        } else {
          svg += `<line x1="${f(el.j.x)}" y1="${f(el.j.y)}" x2="${f(el.k.x)}" y2="${f(el.k.y)}" stroke="${col}" stroke-width="2"/>\n`;
        }
      } else if(curveStyle==='conic'){
        const pts = sampleConic(el.j, el.control, el.k, conicWeight);
        svg += `<path d="M ${pts.map(p=>`${f(p.x)} ${f(p.y)}`).join(' L ')}" stroke="${col}" stroke-width="2" fill="none"/>\n`;
      } else if(curveStyle==='catenary'){
        const cat = sampleCatenary(el.j, el.apex, el.k);
        if(cat){
          svg += `<path d="M ${cat.pts.map(p=>`${f(p.x)} ${f(p.y)}`).join(' L ')}" stroke="${col}" stroke-width="2" fill="none"/>\n`;
        } else {
          svg += `<line x1="${f(el.j.x)}" y1="${f(el.j.y)}" x2="${f(el.k.x)}" y2="${f(el.k.y)}" stroke="${col}" stroke-width="2"/>\n`;
        }
      } else {
        svg += `<path d="M${f(el.j.x)} ${f(el.j.y)} Q${f(el.control.x)} ${f(el.control.y)} ${f(el.k.x)} ${f(el.k.y)}" stroke="${col}" stroke-width="2" fill="none"/>\n`;
      }
      svg += svgDot(el.j,col,3.5) + svgDot(el.k,col,3.5);
      if(showArcCircle){
        const trueCircle = arcThroughPoints(el.j, el.apex, el.k);
        if(trueCircle){
          svg += `<circle cx="${f(trueCircle.center.x)}" cy="${f(trueCircle.center.y)}" r="${f(trueCircle.r)}" stroke="${col}" stroke-width="1" stroke-dasharray="1,4" opacity="0.3" fill="none"/>\n`;
          svg += svgCrosshair(trueCircle.center, col, 4);
        }
      }
      if(showGuides){
        svg += `<g opacity="0.35" stroke="${col}" stroke-width="1" stroke-dasharray="3,3">\n`
          + `<line x1="${f(el.selected.x)}" y1="${f(el.selected.y)}" x2="${f(el.e.x)}" y2="${f(el.e.y)}"/>\n`
          + `<line x1="${f(el.opposite.x)}" y1="${f(el.opposite.y)}" x2="${f(el.e.x)}" y2="${f(el.e.y)}"/>\n`
          + `<line x1="${f(el.j.x)}" y1="${f(el.j.y)}" x2="${f(el.k.x)}" y2="${f(el.k.y)}"/>\n`
          + `<line x1="${f(el.l.x)}" y1="${f(el.l.y)}" x2="${f(el.m.x)}" y2="${f(el.m.y)}"/>\n</g>\n`;
        svg += svgLabel(mid(el.selected, el.e), '1', col);
        svg += svgLabel(mid(el.opposite, el.e), 'AC', col);
        svg += svgLabel(mid(el.j, el.k), 'AB', col);
        svg += svgLabel(mid(el.l, el.m), '-> m', col);
        svg += svgDot(el.e,col,2.2,0.6) + svgDot(el.l,col,2,0.9) + svgDot(el.m,col,3,1);
        if(el.apex!==el.m){
          svg += `<line x1="${f(el.m.x)}" y1="${f(el.m.y)}" x2="${f(el.apex.x)}" y2="${f(el.apex.y)}" stroke="${col}" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/>\n`;
          svg += svgLabel(mid(el.m, el.apex), 'AB×R', col);
          svg += svgCrosshair(el.apex, col, 5);
        }
      }

    } else if(el.type==='circle'){
      svg += `<circle cx="${f(el.center.x)}" cy="${f(el.center.y)}" r="${f(el.radius)}" stroke="${col}" stroke-width="2" fill="none"/>\n`;
      svg += svgCrosshair(el.center, col);
      if(showGuides){
        svg += `<g opacity="0.35" stroke="${col}" stroke-width="1" stroke-dasharray="3,3">\n`
          + `<line x1="${f(el.o.x)}" y1="${f(el.o.y)}" x2="${f(el.a.x)}" y2="${f(el.a.y)}"/>\n`
          + `<line x1="${f(el.o.x)}" y1="${f(el.o.y)}" x2="${f(el.b.x)}" y2="${f(el.b.y)}"/>\n</g>\n`;
        svg += svgLabel(mid(el.o, el.a), '1', col);
        svg += svgLabel(mid(el.o, el.b), '2', col);
        svg += svgDot(el.a,col,2,0.6) + svgDot(el.b,col,2,0.6);
      }

    } else if(el.type==='point'){
      svg += svgDot(el.p, col, 3.2);
      svg += `<circle cx="${f(el.p.x)}" cy="${f(el.p.y)}" r="9" stroke="${col}" stroke-width="1.4" fill="none"/>\n`;
    }
  }

  if(showLabels){
    for(const p of points){
      svg += `<text x="${f(p.x)}" y="${f(p.y-13)}" text-anchor="middle" font-size="10" fill="${inkDim}">${esc('P'+p.id)}</text>\n`;
    }
  }

  const id = identity();
  svg += `<line x1="0" y1="507" x2="500" y2="507" stroke="${border}" stroke-width="1"/>\n`;
  svg += `<text x="250" y="524" text-anchor="middle" font-size="12" letter-spacing="1" fill="${inkDim}">${esc(id)}</text>\n`;
  svg += `</svg>`;

  // Render in-page rather than trigger a download: a right-click-able <img> (same
  // mechanism used to save the canvas) plus raw markup to copy, since a[download]
  // and window.open are unreliable inside embedded/sandboxed viewers.
  const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  document.getElementById('exportImg').src = dataUri;
  document.getElementById('exportSource').value = svg;
  document.getElementById('exportOverlay').classList.add('open');
}

function draw(){
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  const displaySize = rect.width || 500; // canvas is always square (aspect-ratio:1/1)
  cv.width = Math.round(displaySize*dpr);
  cv.height = Math.round(displaySize*dpr);
  const scale = (displaySize/500) * dpr;
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.clearRect(0,0,500,500);

  const showGrid = document.getElementById('gridChk').checked;
  const showGuides = document.getElementById('guidesChk').checked;
  const showLabels = document.getElementById('labelsChk').checked;
  const showArcCircle = document.getElementById('arcCircleChk').checked;
  const curveStyle = document.getElementById('curveStyle').value;
  const conicWeight = +document.getElementById('conicWeight').value;

  const gridColor = cssVar('--neutral-border');
  const inkDim = cssVar('--neutral-text-muted');
  const monoFont = cssVar('--font-mono') || 'ui-monospace, monospace';
  const baseColor = {
    line: cssVar('--shape-line'),
    arc: cssVar('--shape-arc'),
    circle: cssVar('--shape-circle'),
    point: cssVar('--shape-point'),
  };

  if(showGrid){
    ctx.save();
    ctx.strokeStyle = gridColor; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.6;
    for(let x=0;x<=500;x+=25){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,500); ctx.stroke(); }
    for(let y=0;y<=500;y+=25){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(500,y); ctx.stroke(); }
    ctx.restore();
  }

  const typeCounts = {line:0, arc:0, circle:0, point:0};
  for(const el of result.elements) typeCounts[el.type]++;
  const typeSeen = {line:0, arc:0, circle:0, point:0};

  const invActive = inversionCircleIndex !== null && !!inversionSourceFor(result.elements[inversionCircleIndex]);

  result.elements.forEach((el, elIndex) => {
    const idx = typeSeen[el.type]++;
    const col = variantColor(baseColor[el.type], idx, typeCounts[el.type]);
    const isHovered = hoveredIndex === elIndex;
    const isConstant = invActive && elIndex === inversionCircleIndex;
    const dimmed = invActive ? (!isConstant && !isHovered) : (hoveredIndex !== null && !isHovered);
    ctx.save();
    ctx.globalAlpha = dimmed ? 0.18 : 1;
    const lw = isHovered ? 3.4 : 2;

    if(el.type==='line'){
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(el.j.x, el.j.y); ctx.lineTo(el.k.x, el.k.y); ctx.stroke();
      dot(el.j, col, 3.5); dot(el.k, col, 3.5);

    } else if(el.type==='arc'){
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      if(curveStyle==='circular'){
        const c = arcThroughPoints(el.j, el.apex, el.k);
        if(c){
          ctx.arc(c.center.x, c.center.y, c.r, c.startAngle, c.endAngle, c.anticlockwise);
        } else {
          ctx.moveTo(el.j.x, el.j.y);
          ctx.lineTo(el.k.x, el.k.y);
        }
      } else if(curveStyle==='conic'){
        const pts = sampleConic(el.j, el.control, el.k, conicWeight);
        ctx.moveTo(pts[0].x, pts[0].y);
        for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
      } else if(curveStyle==='catenary'){
        const cat = sampleCatenary(el.j, el.apex, el.k);
        if(cat){
          ctx.moveTo(cat.pts[0].x, cat.pts[0].y);
          for(let i=1;i<cat.pts.length;i++) ctx.lineTo(cat.pts[i].x, cat.pts[i].y);
        } else {
          ctx.moveTo(el.j.x, el.j.y);
          ctx.lineTo(el.k.x, el.k.y);
        }
      } else {
        ctx.moveTo(el.j.x, el.j.y);
        ctx.quadraticCurveTo(el.control.x, el.control.y, el.k.x, el.k.y);
      }
      ctx.stroke();
      dot(el.j, col, 3.5); dot(el.k, col, 3.5);
      if(showArcCircle && !dimmed){
        // The full circle through j/apex/k — often a very different size/position than
        // intuition suggests from the visible arc alone, which is the whole point of this.
        const trueCircle = arcThroughPoints(el.j, el.apex, el.k);
        if(trueCircle){
          ctx.save();
          ctx.strokeStyle = col; ctx.globalAlpha = 0.3; ctx.setLineDash([1,4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(trueCircle.center.x, trueCircle.center.y, trueCircle.r, 0, Math.PI*2); ctx.stroke();
          ctx.restore();
          crosshair(trueCircle.center, col, 4);
        }
      }
      if(showGuides && !dimmed){
        ctx.save();
        ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.setLineDash([3,3]); ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(el.selected.x, el.selected.y); ctx.lineTo(el.e.x, el.e.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(el.opposite.x, el.opposite.y); ctx.lineTo(el.e.x, el.e.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(el.j.x, el.j.y); ctx.lineTo(el.k.x, el.k.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(el.l.x, el.l.y); ctx.lineTo(el.m.x, el.m.y); ctx.stroke();
        ctx.restore();
        label(mid(el.selected, el.e), '1', col, monoFont);
        label(mid(el.opposite, el.e), 'AC', col, monoFont);
        label(mid(el.j, el.k), 'AB', col, monoFont);
        label(mid(el.l, el.m), '-> m', col, monoFont);
        dot(el.e, col, 2.2, 0.6);
        dot(el.l, col, 2, 0.9);
        dot(el.m, col, 3, 1, el.apex===el.m);
        if(el.apex!==el.m){
          ctx.save();
          ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.setLineDash([2,2]); ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(el.m.x, el.m.y); ctx.lineTo(el.apex.x, el.apex.y); ctx.stroke();
          ctx.restore();
          label(mid(el.m, el.apex), 'AB×R', col, monoFont);
          crosshair(el.apex, col, 5);
        }
      }

    } else if(el.type==='circle'){
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(el.center.x, el.center.y, el.radius, 0, Math.PI*2); ctx.stroke();
      crosshair(el.center, col);
      if(showGuides && !dimmed){
        ctx.save();
        ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.setLineDash([3,3]); ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(el.o.x, el.o.y); ctx.lineTo(el.a.x, el.a.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(el.o.x, el.o.y); ctx.lineTo(el.b.x, el.b.y); ctx.stroke();
        ctx.restore();
        label(mid(el.o, el.a), '1', col, monoFont);
        label(mid(el.o, el.b), '2', col, monoFont);
        dot(el.a, col, 2, 0.6); dot(el.b, col, 2, 0.6);
      }

    } else if(el.type==='point'){
      dot(el.p, col, 3.2);
      ctx.strokeStyle = col; ctx.lineWidth = isHovered ? 2.2 : 1.4;
      ctx.beginPath(); ctx.arc(el.p.x, el.p.y, 9, 0, Math.PI*2); ctx.stroke();
    }

    if(isConstant){
      const src = inversionSourceFor(el);
      if(src){
        ctx.save();
        ctx.strokeStyle = cssVar('--neutral-text'); ctx.lineWidth = 1.2; ctx.setLineDash([2,3]);
        ctx.beginPath(); ctx.arc(src.O.x, src.O.y, src.r+6, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
        if(el.type==='arc'){
          // the arc is only a piece of its underlying circle — show the rest of it faintly,
          // since that whole circle is what's actually pointwise fixed by the inversion.
          ctx.save();
          ctx.strokeStyle = cssVar('--neutral-text-muted'); ctx.globalAlpha = 0.3; ctx.lineWidth = 1; ctx.setLineDash([1,3]);
          ctx.beginPath(); ctx.arc(src.O.x, src.O.y, src.r, 0, Math.PI*2); ctx.stroke();
          ctx.restore();
        }
      }
    }

    if(invActive && !isConstant){
      const constEl = result.elements[inversionCircleIndex];
      const src = inversionSourceFor(constEl);
      const img = src ? invertMark(el, src.O, src.r) : null;
      if(img){
        ctx.save();
        ctx.globalAlpha = isHovered ? 0.95 : 0.7;
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.setLineDash(isHovered ? [5,1] : [2,5]);
        if(img.kind==='point'){
          dot(img.p, col, 3.5, 1, true);
        } else if(img.kind==='line'){
          ctx.beginPath(); ctx.moveTo(img.a.x, img.a.y); ctx.lineTo(img.b.x, img.b.y); ctx.stroke();
        } else if(img.kind==='rays'){
          for(const ray of img.rays){
            ctx.beginPath(); ctx.moveTo(ray.a.x, ray.a.y); ctx.lineTo(ray.b.x, ray.b.y); ctx.stroke();
          }
        } else if(img.kind==='circle'){
          ctx.beginPath(); ctx.arc(img.center.x, img.center.y, img.radius, 0, Math.PI*2); ctx.stroke();
        } else if(img.kind==='arc'){
          ctx.beginPath(); ctx.arc(img.center.x, img.center.y, img.r, img.startAngle, img.endAngle, img.anticlockwise); ctx.stroke();
        } else if(img.kind==='path'){
          for(const path of img.paths){
            ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
            for(let i=1;i<path.length;i++) ctx.lineTo(path[i].x, path[i].y);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    if(isHovered){
      for(const rp of relatedPoints(el)){
        ctx.save();
        ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, 8, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  });

  const tractrix=currentTractrix();
  if(tractrix && tractrix.trace.length>1){
    const tractrixColor=cssVar('--ink-selection') || cssVar('--chrome-accent-text');
    ctx.save();
    // Both branches derive solely from the selected lead: the earlier samples
    // compress into the apex, and later samples pull away from it.
    ctx.strokeStyle=tractrixColor; ctx.lineWidth=2; ctx.globalAlpha=0.56; ctx.setLineDash([2,4]);
    ctx.beginPath(); ctx.moveTo(tractrix.compression[0].x, tractrix.compression[0].y);
    for(let i=1;i<tractrix.compression.length;i++) ctx.lineTo(tractrix.compression[i].x, tractrix.compression[i].y);
    ctx.stroke();
    ctx.lineWidth=2.5; ctx.globalAlpha=0.92; ctx.setLineDash([7,3]);
    ctx.beginPath(); ctx.moveTo(tractrix.tension[0].x, tractrix.tension[0].y);
    for(let i=1;i<tractrix.tension.length;i++) ctx.lineTo(tractrix.tension[i].x, tractrix.tension[i].y);
    ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle=tractrixColor;
    const apex=tractrix.compression[tractrix.compression.length-1];
    ctx.globalAlpha=1; ctx.beginPath(); ctx.arc(apex.x, apex.y, 3, 0, TAU); ctx.fill();
    if(document.getElementById('tractrixMotion').checked){
      const progress=(performance.now()/7000)%1;
      const i=Math.min(tractrix.trace.length-1, Math.floor(progress*(tractrix.trace.length-1)));
      const leader=tractrix.lead[i], follower=tractrix.trace[i];
      ctx.globalAlpha=0.32; ctx.lineWidth=1.2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(leader.x, leader.y); ctx.lineTo(follower.x, follower.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha=0.72;
      ctx.beginPath(); ctx.arc(leader.x, leader.y, 3.5, 0, TAU); ctx.fill();
      ctx.globalAlpha=0.9;
      ctx.beginPath(); ctx.arc(follower.x, follower.y, 4.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  const spiral=currentSpiralTractrix();
  if(spiral && spiral.length>1){
    const spiralColor=cssVar('--chrome-accent-secondary-text') || cssVar('--shape-circle');
    ctx.save();
    ctx.strokeStyle=spiralColor; ctx.lineWidth=2.2; ctx.globalAlpha=0.9;
    ctx.beginPath(); ctx.moveTo(spiral[0].x, spiral[0].y);
    for(let i=1;i<spiral.length;i++) ctx.lineTo(spiral[i].x, spiral[i].y);
    ctx.stroke();
    ctx.fillStyle=spiralColor; ctx.globalAlpha=1;
    ctx.beginPath(); ctx.arc(spiral[0].x, spiral[0].y, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  if(showLabels){
    ctx.fillStyle = inkDim; ctx.font = `10px ${monoFont}`; ctx.textAlign='center';
    for(const p of points){ ctx.fillText('P'+p.id, p.x, p.y-13); }
  }

  function dot(p, color, r, alpha=1, ring=false){
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
    if(ring){ ctx.strokeStyle = color; ctx.lineWidth=1; ctx.globalAlpha=alpha*0.6; ctx.beginPath(); ctx.arc(p.x,p.y,r+3,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }

  function crosshair(p, color, size=6){
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x-size, p.y); ctx.lineTo(p.x+size, p.y);
    ctx.moveTo(p.x, p.y-size); ctx.lineTo(p.x, p.y+size);
    ctx.stroke();
    ctx.restore();
  }

  function label(p, text, color, font){
    ctx.save();
    ctx.font = `600 9px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = cssVar('--neutral-surface-raised'); ctx.globalAlpha = 0.85;
    ctx.fillRect(p.x - w/2 - 3, p.y - 6, w + 6, 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(text, p.x, p.y + 0.5);
    ctx.restore();
  }
}

function renderLog(){
  const el = document.getElementById('log');
  el.innerHTML = result.log.map((l,i)=>`<div class="step ${l.cls}">${String(i+1).padStart(2,'0')}  ${l.text}</div>`).join('');
}

function getWeights(){
  return {
    line: +document.getElementById('wLine').value,
    arc: +document.getElementById('wArc').value,
    circle: +document.getElementById('wCircle').value,
    point: +document.getElementById('wPoint').value,
  };
}

function ordinal(n){
  const s = ['th','st','nd','rd'], v = n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function resetInversion(){
  inversionCircleIndex = null;
  pickingInversionCircle = false;
  updateInversionStatus();
}
function resetTractrix(){
  tractrixLeadIndex = null;
  pickingTractrixLead = false;
  updateTractrixStatus();
  syncTractrixAnimation();
}
function resetSpiralTractrix(){
  spiralSourceIndex=null;
  pickingSpiralSource=false;
  updateSpiralStatus();
}
function syncTractrixAnimation(){
  if(tractrixAnimationFrame!==null){
    cancelAnimationFrame(tractrixAnimationFrame);
    tractrixAnimationFrame=null;
  }
  if(!document.getElementById('tractrixMotion').checked || tractrixLeadIndex===null) return;
  const tick=()=>{
    draw();
    tractrixAnimationFrame=requestAnimationFrame(tick);
  };
  tractrixAnimationFrame=requestAnimationFrame(tick);
}

function reprocess(){
  const nth = +document.getElementById('nthClosest').value;
  const apexMode = document.getElementById('apexMode').value;
  result = runConstruction(points, getWeights(), nth, apexMode);
  hoveredIndex = null;
  renderStats(null);
  resetInversion();
  resetTractrix();
  resetSpiralTractrix();
  draw();
  renderLog();
  updateIdentity();
}

// Construction Rules controls call this instead of reprocess(): same points, same
// roles/pairings as last rolled, just re-geometrized under the new rule.
function reexecute(){
  const nth = +document.getElementById('nthClosest').value;
  const apexMode = document.getElementById('apexMode').value;
  const next = reexecuteConstruction(points, nth, apexMode);
  if(!next) return reprocess(); // no roles rolled yet (shouldn't happen post-load, but safe)
  result = next;
  hoveredIndex = null;
  renderStats(null);
  resetInversion();
  resetTractrix();
  resetSpiralTractrix();
  draw();
  renderLog();
  updateIdentity();
}

function regenerate(){
  const n = +document.getElementById('countSlider').value;
  points = generatePoints(n);
  reprocess();
}

document.getElementById('countSlider').addEventListener('input', e=>{
  document.getElementById('countVal').textContent = e.target.value;
});
document.getElementById('countSlider').addEventListener('change', regenerate);
document.getElementById('regenBtn').addEventListener('click', ()=>{ rng = mulberry32((Math.random()*1e9)|0); regenerate(); });
document.getElementById('reprocessBtn').addEventListener('click', reprocess);
document.getElementById('exportBtn').addEventListener('click', exportSVG);
document.getElementById('exportCloseBtn').addEventListener('click', ()=>{
  document.getElementById('exportOverlay').classList.remove('open');
});
document.getElementById('exportOverlay').addEventListener('click', e=>{
  if(e.target.id==='exportOverlay') document.getElementById('exportOverlay').classList.remove('open');
});
document.getElementById('exportCopyBtn').addEventListener('click', async ()=>{
  const ta = document.getElementById('exportSource');
  ta.select();
  try{ await navigator.clipboard.writeText(ta.value); }catch(e){ document.execCommand('copy'); }
});
document.getElementById('nthClosest').addEventListener('input', e=>{
  document.getElementById('nthVal').textContent = ordinal(+e.target.value);
  reexecute();
});
document.getElementById('apexMode').addEventListener('change', reexecute);
document.getElementById('curveStyle').addEventListener('change', e=>{
  document.getElementById('conicWeightField').style.display = e.target.value==='conic' ? '' : 'none';
  // An arc is a valid constant only while it is displayed as a circular arc.
  if(inversionCircleIndex !== null && !inversionSourceFor(result.elements[inversionCircleIndex])) resetInversion();
  else updateInversionStatus();
  if(spiralSourceIndex !== null && !spiralSourceFor(result.elements[spiralSourceIndex])) resetSpiralTractrix();
  else updateSpiralStatus();
  draw();
});
document.getElementById('conicWeight').addEventListener('input', e=>{
  document.getElementById('conicWeightVal').textContent = (+e.target.value).toFixed(2);
  if(inversionCircleIndex !== null && !inversionSourceFor(result.elements[inversionCircleIndex])) resetInversion();
  else updateInversionStatus();
  if(spiralSourceIndex !== null && !spiralSourceFor(result.elements[spiralSourceIndex])) resetSpiralTractrix();
  else updateSpiralStatus();
  draw();
});
document.getElementById('guidesChk').addEventListener('change', draw);
document.getElementById('gridChk').addEventListener('change', draw);
document.getElementById('labelsChk').addEventListener('change', draw);
document.getElementById('arcCircleChk').addEventListener('change', draw);
document.getElementById('tractrixLength').addEventListener('input', e=>{
  document.getElementById('tractrixLengthVal').textContent=e.target.value;
  draw();
});
document.getElementById('tractrixApex').addEventListener('input', e=>{
  document.getElementById('tractrixApexVal').textContent=e.target.value+'%';
  draw();
});
document.getElementById('tractrixSide').addEventListener('change', draw);
document.getElementById('tractrixMotion').addEventListener('change', ()=>{
  syncTractrixAnimation();
  draw();
});
document.getElementById('spiralTurns').addEventListener('input', e=>{
  document.getElementById('spiralTurnsVal').textContent=(+e.target.value).toFixed(1);
  draw();
});
document.getElementById('spiralPhase').addEventListener('input', e=>{
  document.getElementById('spiralPhaseVal').textContent=e.target.value+'°';
  draw();
});
document.getElementById('spiralDirection').addEventListener('change', draw);

['wLine','wArc','wCircle','wPoint'].forEach(id=>{
  document.getElementById(id).addEventListener('input', e=>{
    document.getElementById(id+'Val').textContent = e.target.value;
    reprocess();
  });
});

function canvasCoords(e){
  const rect = cv.getBoundingClientRect();
  const scale = 500 / rect.width;
  return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
}
function isTractrixLead(el){ return !!el && ['line','arc','circle'].includes(el.type); }
function tractrixLeadLabel(el){ return el ? elementLabel(el) : ''; }
function updateTractrixStatus(){
  const status=document.getElementById('tractrixStatus');
  const pickBtn=document.getElementById('pickTractrixLeadBtn');
  const clearBtn=document.getElementById('clearTractrixBtn');
  if(pickingTractrixLead){
    status.textContent='Click a line, circle, or displayed arc on the canvas…';
    pickBtn.textContent='Cancel';
  } else if(tractrixLeadIndex!==null){
    status.textContent=`Following ${tractrixLeadLabel(result.elements[tractrixLeadIndex])} with a taut tether.`;
    pickBtn.textContent='Pick lead curve';
  } else {
    status.textContent='No lead curve selected.';
    pickBtn.textContent='Pick lead curve';
  }
  clearBtn.style.display=tractrixLeadIndex!==null ? '' : 'none';
}
function updateSpiralStatus(){
  const status=document.getElementById('spiralStatus');
  const pickBtn=document.getElementById('pickSpiralSourceBtn');
  const clearBtn=document.getElementById('clearSpiralBtn');
  if(pickingSpiralSource){
    status.textContent='Click a circle or true circular arc on the canvas…';
    pickBtn.textContent='Cancel';
  } else if(spiralSourceIndex!==null){
    status.textContent=`Exact spiral tractrix from ${elementLabel(result.elements[spiralSourceIndex])}.`;
    pickBtn.textContent='Pick circle/circular arc';
  } else {
    status.textContent='No circle source selected.';
    pickBtn.textContent='Pick circle/circular arc';
  }
  clearBtn.style.display=spiralSourceIndex!==null ? '' : 'none';
}

cv.addEventListener('mousemove', e=>{
  const hit = hitTest(canvasCoords(e));
  if(hit !== hoveredIndex){
    hoveredIndex = hit;
    cv.style.cursor = (pickingInversionCircle || pickingTractrixLead || pickingSpiralSource) ? 'crosshair' : (hit===null ? 'default' : 'pointer');
    renderStats(hit===null ? null : result.elements[hit]);
    draw();
  }
});
cv.addEventListener('mouseleave', ()=>{
  if(hoveredIndex !== null){
    hoveredIndex = null;
    cv.style.cursor = 'default';
    renderStats(null);
    draw();
  }
});

function describeInversion(el, O, r){
  const label = elementLabel(el);
  const img = invertMark(el, O, r);
  const p = n => `(${n.x.toFixed(0)}, ${n.y.toFixed(0)})`;
  if(!img){
    return {cls:'step-undefined', text:`${label} → undefined (coincides with the constant's own center — maps to infinity)`};
  }
  if(img.kind==='point'){
    return {cls:'step-point', text:`${label} at ${p(el.p)} → point at ${p(img.p)}`};
  }
  if(el.type==='circle'){
    if(img.kind==='line') return {cls:'step-circle', text:`${label} (r=${el.radius.toFixed(1)}) → LINE (it passed through the constant)`};
    return {cls:'step-circle', text:`${label} (r=${el.radius.toFixed(1)}) → circle via closed-form map, center ${p(img.center)} r=${img.radius.toFixed(1)}`};
  }
  if(el.type==='line'){
    if(img.kind==='rays') return {cls:'step-line', text:`${label} → ${img.rays.length===1 ? 'RAY' : 'TWO RAYS'} (the finite segment reaches the inversion center)`};
    if(img.kind==='line') return {cls:'step-line', text:`${label} → LINE, repositioned (it passed through the constant)`};
    return {cls:'step-line', text:`${label} → ARC via the circle through O and its inverted endpoints, center ${p(img.center)} r=${img.r.toFixed(1)}`};
  }
  if(el.type==='arc'){
    if(img.kind==='line') return {cls:'step-arc', text:`${label} → LINE (its three inverted points landed collinear)`};
    if(img.kind==='path') return {cls:'step-arc', text:`${label} → transformed ${document.getElementById('curveStyle').value} curve, sampled point-by-point`};
    return {cls:'step-arc', text:`${label} → ARC via j/apex/k refit, center ${p(img.center)} r=${img.r.toFixed(1)}`};
  }
  return {cls:'step', text:`${label} → (${img.kind})`};
}

function buildInversionLog(){
  if(inversionCircleIndex === null){
    return [{cls:'step', text:'Nothing held constant yet — pick a circle or arc above to see how it transforms the rest.'}];
  }
  const constEl = result.elements[inversionCircleIndex];
  const src = inversionSourceFor(constEl);
  if(!src) return [{cls:'step-undefined', text:`${elementLabel(constEl)} has no well-defined circle to invert through (flattened/degenerate) — pick another.`}];
  const via = constEl.type==='arc' ? ' (via its underlying circle)' : '';
  const lines = [{cls:'step-meta', text:`${elementLabel(constEl)} (r=${src.r.toFixed(1)}) held constant as O, r${via} — everything below inverted through it.`}];
  result.elements.forEach((el, i) => {
    if(i === inversionCircleIndex) return;
    lines.push(describeInversion(el, src.O, src.r));
  });
  return lines;
}

function renderInversionLog(){
  const el = document.getElementById('inversionLog');
  el.innerHTML = buildInversionLog().map(l => `<div class="step ${l.cls}">${l.text}</div>`).join('');
}

function constantLabel(el){
  if(el.type==='circle') return `Circle · P${el.o.id}`;
  if(el.type==='arc') return `Arc · P${el.j.id}–P${el.k.id}`;
  return elementLabel(el);
}

function updateInversionStatus(){
  const status = document.getElementById('inversionStatus');
  const clearBtn = document.getElementById('clearInversionBtn');
  const pickBtn = document.getElementById('pickInversionBtn');
  if(pickingInversionCircle){
    status.textContent = 'Click a circle or non-flattened circular arc on the canvas…';
    pickBtn.textContent = 'Cancel';
  } else if(inversionCircleIndex !== null){
    const el = result.elements[inversionCircleIndex];
    const src = el ? inversionSourceFor(el) : null;
    status.textContent = src ? `Holding ${constantLabel(el)} constant — everything else shown inverted through it.` : 'Nothing held constant — construction shown as-is.';
    pickBtn.textContent = 'Pick constant circle/circular arc';
  } else {
    status.textContent = 'Nothing held constant — construction shown as-is.';
    pickBtn.textContent = 'Pick constant circle/circular arc';
  }
  clearBtn.style.display = inversionCircleIndex !== null ? '' : 'none';
  renderInversionLog();
  populateCircleSwap();
}

// Quick-swap dropdown + prev/next: lets you flick between every circle AND arc in the
// construction as the constant without re-clicking on the canvas each time. An arc only
// qualifies if it has a well-defined (non-flattened) underlying circle.
function constantCandidateIndices(){
  const idxs = [];
  result.elements.forEach((el,i) => { if(inversionSourceFor(el)) idxs.push(i); });
  return idxs;
}
function populateCircleSwap(){
  const sel = document.getElementById('circleSwap');
  const prevBtn = document.getElementById('prevCircleBtn');
  const nextBtn = document.getElementById('nextCircleBtn');
  const idxs = constantCandidateIndices();
  if(idxs.length === 0){
    sel.innerHTML = '<option value="">No circles/circular arcs in this construction</option>';
    sel.disabled = true;
  } else {
    const options = idxs.map(i => {
      const el = result.elements[i];
      const src = inversionSourceFor(el);
      return `<option value="${i}">${constantLabel(el)} (r=${src.r.toFixed(1)})</option>`;
    });
    sel.innerHTML = (inversionCircleIndex===null ? '<option value="">— none held constant —</option>' : '') + options.join('');
    sel.disabled = false;
    sel.value = inversionCircleIndex !== null ? String(inversionCircleIndex) : '';
  }
  prevBtn.disabled = nextBtn.disabled = idxs.length < 2;
}
function cycleCircle(dir){
  const idxs = constantCandidateIndices();
  if(idxs.length === 0) return;
  const pos = inversionCircleIndex===null ? -1 : idxs.indexOf(inversionCircleIndex);
  inversionCircleIndex = idxs[((pos+dir)%idxs.length+idxs.length)%idxs.length];
  pickingInversionCircle = false;
  updateInversionStatus();
  draw();
}
document.getElementById('circleSwap').addEventListener('change', e=>{
  if(e.target.value==='') return;
  inversionCircleIndex = +e.target.value;
  pickingInversionCircle = false;
  updateInversionStatus();
  draw();
});
document.getElementById('prevCircleBtn').addEventListener('click', ()=>cycleCircle(-1));
document.getElementById('nextCircleBtn').addEventListener('click', ()=>cycleCircle(1));

cv.addEventListener('click', e=>{
  const hit = hitTest(canvasCoords(e));
  if(pickingInversionCircle){
    pickingInversionCircle = false;
    if(hit !== null && inversionSourceFor(result.elements[hit])) inversionCircleIndex = hit;
    cv.style.cursor = 'default';
    updateInversionStatus();
    draw();
    return;
  }
  if(pickingTractrixLead){
    pickingTractrixLead=false;
    if(hit !== null && isTractrixLead(result.elements[hit])) tractrixLeadIndex=hit;
    cv.style.cursor='default';
    updateTractrixStatus();
    syncTractrixAnimation();
    draw();
    return;
  }
  if(pickingSpiralSource){
    pickingSpiralSource=false;
    if(hit!==null && spiralSourceFor(result.elements[hit])) spiralSourceIndex=hit;
    cv.style.cursor='default';
    updateSpiralStatus();
    draw();
  }
});
document.getElementById('pickInversionBtn').addEventListener('click', ()=>{
  if(pickingInversionCircle){
    pickingInversionCircle = false;
  } else {
    pickingInversionCircle = true;
    inversionCircleIndex = null;
    pickingTractrixLead = false;
    pickingSpiralSource = false;
  }
  updateInversionStatus();
  updateSpiralStatus();
  draw();
});
document.getElementById('pickTractrixLeadBtn').addEventListener('click', ()=>{
  if(pickingTractrixLead){
    pickingTractrixLead=false;
  } else {
    pickingTractrixLead=true;
    tractrixLeadIndex=null;
    pickingInversionCircle=false;
    pickingSpiralSource=false;
  }
  updateInversionStatus();
  updateTractrixStatus();
  updateSpiralStatus();
  syncTractrixAnimation();
  draw();
});
document.getElementById('clearTractrixBtn').addEventListener('click', ()=>{
  resetTractrix();
  draw();
});
document.getElementById('pickSpiralSourceBtn').addEventListener('click', ()=>{
  if(pickingSpiralSource){
    pickingSpiralSource=false;
  } else {
    pickingSpiralSource=true;
    spiralSourceIndex=null;
    pickingInversionCircle=false;
    pickingTractrixLead=false;
  }
  updateInversionStatus();
  updateTractrixStatus();
  updateSpiralStatus();
  syncTractrixAnimation();
  draw();
});
document.getElementById('clearSpiralBtn').addEventListener('click', ()=>{
  resetSpiralTractrix();
  draw();
});
document.getElementById('clearInversionBtn').addEventListener('click', ()=>{
  inversionCircleIndex = null;
  pickingInversionCircle = false;
  updateInversionStatus();
  draw();
});

function setLogTab(tab){
  const isConstruction = tab === 'construction';
  document.getElementById('logTabConstruction').classList.toggle('active', isConstruction);
  document.getElementById('logTabInversion').classList.toggle('active', !isConstruction);
  document.getElementById('log').style.display = isConstruction ? '' : 'none';
  document.getElementById('inversionLog').style.display = isConstruction ? 'none' : '';
  document.getElementById('constructionNotes').style.display = isConstruction ? '' : 'none';
  document.getElementById('constructionNotes2').style.display = isConstruction ? '' : 'none';
  document.getElementById('inversionNotes').style.display = isConstruction ? 'none' : '';
}
document.getElementById('logTabConstruction').addEventListener('click', ()=> setLogTab('construction'));
document.getElementById('logTabInversion').addEventListener('click', ()=> setLogTab('inversion'));

let resizeTimer;
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(draw, 100);
});

restoreTheme();
regenerate();
