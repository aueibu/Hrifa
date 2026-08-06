import type { DiagramStyle } from '../../theme/diagram';

export type CurveStyle = 'circular' | 'bezier' | 'conic' | 'catenary';

type Point = { id?: number; x: number; y: number };
type Line = { type: 'line'; j: Point; k: Point };
type Circle = { type: 'circle'; o: Point; a: Point; b: Point; center: Point; radius: number; da: number; db: number };
type Arc = { type: 'arc'; j: Point; k: Point; e: Point; l: Point; m: Point; apex: Point; control: Point; selected: Point; opposite: Point; selDist: number };
type Mark = { type: 'point'; p: Point } | Line | Circle | Arc;
type Weights = Record<'line' | 'arc' | 'circle' | 'point', number>;

export type PointConstructionSettings = {
  count: number;
  nthClosest: number;
  apexMode: 'ratio' | 'coincide';
  curveStyle: CurveStyle;
  conicWeight: number;
  weights: Weights;
  guides: boolean;
  grid: boolean;
  labels: boolean;
  arcCircle: boolean;
  tetherLength: number;
  apex: number;
  side: 'left' | 'right';
  motion: boolean;
  spiralTurns: number;
  spiralPhase: number;
  spiralDirection: 1 | -1;
};

export type PointConstructionInspector = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

const TAU = Math.PI * 2;
const ARC_DEGENERATE_PX = 1.5;
const defaults: PointConstructionSettings = {
  count: 11, nthClosest: 1, apexMode: 'ratio', curveStyle: 'circular', conicWeight: 1,
  weights: { line: 30, arc: 30, circle: 25, point: 15 }, guides: true, grid: true,
  labels: false, arcCircle: false, tetherLength: 48, apex: 50, side: 'left', motion: false,
  spiralTurns: 2, spiralPhase: 0, spiralDirection: 1,
};
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n });
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unit = (a: Point): Point => scale(a, 1 / (Math.hypot(a.x, a.y) || 1));
const mid = (a: Point, b: Point) => lerp(a, b, .5);

let colorProbe: CanvasRenderingContext2D | null = null;
function rgbFor(color: string) {
  if (!colorProbe) colorProbe = document.createElement('canvas').getContext('2d');
  if (!colorProbe) return [0, 0, 0] as const;
  colorProbe.canvas.width = colorProbe.canvas.height = 1;
  colorProbe.clearRect(0, 0, 1, 1); colorProbe.fillStyle = color; colorProbe.fillRect(0, 0, 1, 1);
  const [red, green, blue] = colorProbe.getImageData(0, 0, 1, 1).data;
  return [red, green, blue] as const;
}
function hueVariant(base: string, index: number, total: number) {
  if (total <= 1) return base;
  const [red, green, blue] = rgbFor(base).map(channel => channel / 255), max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  const lightness = (max + min) / 2, saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const hue = delta === 0 ? 0 : 60 * ((max === red ? (green - blue) / delta : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4));
  const offset = -20 + 40 * index / (total - 1);
  return `hsl(${((hue + offset + 360) % 360).toFixed(1)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`;
}
function markVariantColors(marks: Mark[], baseColors: Record<Mark['type'], string>) {
  const totals: Record<Mark['type'], number> = { line: 0, arc: 0, circle: 0, point: 0 }, seen: Record<Mark['type'], number> = { line: 0, arc: 0, circle: 0, point: 0 };
  for (const mark of marks) totals[mark.type]++;
  return marks.map(mark => hueVariant(baseColors[mark.type], seen[mark.type]++, totals[mark.type]));
}
function sourcePointColors(marks: Mark[], markColors: string[]) {
  const colors = new Map<number, string>();
  marks.forEach((mark, index) => {
    const sources = mark.type === 'point' ? [mark.p] : mark.type === 'circle' ? [mark.o] : [mark.j, mark.k];
    for (const point of sources) if (point.id !== undefined) colors.set(point.id, markColors[index]);
  });
  return colors;
}

function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function circumcircle(a: Point, b: Point, c: Point) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const aa = a.x * a.x + a.y * a.y, bb = b.x * b.x + b.y * b.y, cc = c.x * c.x + c.y * c.y;
  const center = { x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d, y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d };
  return { center, r: dist(center, a) };
}
function arcThroughPoints(j: Point, apex: Point, k: Point) {
  const chord = dist(j, k) || 1;
  if (Math.abs((apex.x - j.x) * (k.y - j.y) - (apex.y - j.y) * (k.x - j.x)) / chord < ARC_DEGENERATE_PX) return null;
  const circle = circumcircle(j, apex, k); if (!circle) return null;
  const startAngle = Math.atan2(j.y - circle.center.y, j.x - circle.center.x), endAngle = Math.atan2(k.y - circle.center.y, k.x - circle.center.x), aa = Math.atan2(apex.y - circle.center.y, apex.x - circle.center.x);
  const sweep = (a: number, b: number) => (b - a + TAU) % TAU;
  const anticlockwise = sweep(startAngle, aa) > sweep(startAngle, endAngle);
  return { ...circle, startAngle, endAngle, anticlockwise };
}
function conicPoint(a: Point, c: Point, b: Point, w: number, t: number) { const u = 1 - t, d = u * u + 2 * w * u * t + t * t; return { x: (u * u * a.x + 2 * w * u * t * c.x + t * t * b.x) / d, y: (u * u * a.y + 2 * w * u * t * c.y + t * t * b.y) / d }; }
function sampleConic(a: Point, c: Point, b: Point, w: number, n = 32) { return Array.from({ length: n + 1 }, (_, i) => conicPoint(a, c, b, w, i / n)); }
function conicControlForApex(j: Point, apex: Point, k: Point, weight: number) { return scale(sub(scale(apex, 1 + weight), scale(add(j, k), .5)), 1 / weight); }
function sampleCatenary(a: Point, apex: Point, b: Point, n = 32) {
  const length = dist(a, b); if (length < 2) return null;
  const u = unit(sub(b, a)); let v = { x: -u.y, y: u.x };
  const relative = sub(apex, a), ax = relative.x * u.x + relative.y * u.y; let ay = relative.x * v.x + relative.y * v.y;
  if (ay < 0) { v = scale(v, -1); ay = -ay; }
  if (ay < ARC_DEGENERATE_PX) return null;
  const h = length / 2, f = (scale: number) => scale * (Math.cosh(h / scale) - Math.cosh((ax - h) / scale)) - ay;
  let lo = Math.max(length / 40, 1), hi = Math.max(length, 1) * 10 + 500, guard = 0;
  while (!(f(lo) > 0) && guard++ < 30) { lo /= 1.7; if (lo < 1e-4) return null; }
  guard = 0; while (!(f(hi) < 0) && guard++ < 30) hi *= 1.7;
  if (!(f(lo) > 0) || !(f(hi) < 0)) return null;
  for (let i = 0; i < 70; i++) { const middle = (lo + hi) / 2; if (f(middle) > 0) lo = middle; else hi = middle; }
  const scaleFactor = (lo + hi) / 2, C = scaleFactor * Math.cosh(h / scaleFactor);
  return Array.from({ length: n + 1 }, (_, i) => { const x = length * i / n, y = C - scaleFactor * Math.cosh((x - h) / scaleFactor); return add(a, add(scale(u, x), scale(v, y))); });
}
function pathFor(mark: Mark, settings: PointConstructionSettings, n = 160): Point[] {
  if (mark.type === 'line') return Array.from({ length: n + 1 }, (_, i) => lerp(mark.j, mark.k, i / n));
  if (mark.type === 'circle') return Array.from({ length: n + 1 }, (_, i) => ({ x: mark.center.x + mark.radius * Math.cos(TAU * i / n), y: mark.center.y + mark.radius * Math.sin(TAU * i / n) }));
  if (mark.type === 'point') return [mark.p];
  if (settings.curveStyle === 'conic') return sampleConic(mark.j, conicControlForApex(mark.j, mark.apex, mark.k, settings.conicWeight), mark.k, settings.conicWeight, n);
  if (settings.curveStyle === 'catenary') return sampleCatenary(mark.j, mark.apex, mark.k, n) ?? [mark.j, mark.k];
  if (settings.curveStyle === 'bezier') return Array.from({ length: n + 1 }, (_, i) => conicPoint(mark.j, mark.control, mark.k, 1, i / n));
  const circle = arcThroughPoints(mark.j, mark.apex, mark.k); if (!circle) return [mark.j, mark.k];
  const delta = ((circle.endAngle - circle.startAngle + (circle.anticlockwise ? -TAU : TAU)) % TAU) || TAU;
  return Array.from({ length: n + 1 }, (_, i) => { const angle = circle.startAngle + delta * i / n; return { x: circle.center.x + circle.r * Math.cos(angle), y: circle.center.y + circle.r * Math.sin(angle) }; });
}
function pointToSegment(p: Point, a: Point, b: Point) { const d = sub(b, a), l = d.x*d.x+d.y*d.y || 1, t = Math.max(0, Math.min(1, ((p.x-a.x)*d.x+(p.y-a.y)*d.y)/l)); return dist(p, lerp(a,b,t)); }
function polylineDistance(p: Point, path: Point[]) { return path.slice(1).reduce((best, b, i) => Math.min(best, pointToSegment(p, path[i], b)), Infinity); }
function invertPoint(p: Point, o: Point, r: number) { const d = sub(p,o), q = d.x*d.x+d.y*d.y; return q < 1e-6 ? null : add(o, scale(d, r*r/q)); }
function invertPath(path: Point[], o: Point, r: number) { const groups: Point[][] = [[]]; for (const p of path) { const q = invertPoint(p,o,r); if (q) groups.at(-1)!.push(q); else if (groups.at(-1)!.length) groups.push([]); } return groups.filter(g => g.length > 1); }
function tractrixTrace(lead: Point[], tether: number, side: 'left'|'right', initial?: Point) {
  if (lead.length < 2) return null; const tangent = unit(sub(lead[1], lead[0])), normal = side === 'right' ? { x:tangent.y,y:-tangent.x } : {x:-tangent.y,y:tangent.x}; let follower = initial ?? add(lead[0],scale(normal,tether)); const out=[follower];
  for (let i=1;i<lead.length;i++) { const direction=unit(sub(lead[i-1],follower)), offset=sub(follower,lead[i]), b=2*(offset.x*direction.x+offset.y*direction.y), c=offset.x*offset.x+offset.y*offset.y-tether*tether, d=b*b-4*c; if(d < -1e-6) continue; const steps=[(-b-Math.sqrt(Math.max(0,d)))/2,(-b+Math.sqrt(Math.max(0,d)))/2].filter(x=>x>=-1e-6); if(!steps.length)continue; follower=add(follower,scale(direction,Math.min(...steps)));out.push(follower); }
  return out;
}

export class PointConstructionEngine {
  private readonly ctx: CanvasRenderingContext2D;
  private settings = structuredClone(defaults);
  private rng = mulberry32(Date.now() & 0xffffffff);
  private points: Point[] = [];
  private marks: Mark[] = [];
  private roles: Record<number, keyof Weights> | null = null;
  private hovered: number | null = null;
  private picking: 'inversion' | 'rod' | 'spiral' | null = null;
  private inversion: number | null = null;
  private rod: number | null = null;
  private spiral: number | null = null;
  private animation: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onInspect: ((inspector: PointConstructionInspector | null) => void) | undefined, private readonly diagramStyle: () => DiagramStyle, initialSettings: PointConstructionSettings = defaults) { const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D rendering is unavailable.'); this.ctx=context; this.settings=structuredClone(initialSettings); canvas.addEventListener('pointermove', this.move); canvas.addEventListener('pointerleave', this.leave); canvas.addEventListener('click', this.click); this.regenerate(); }
  destroy() { this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerleave',this.leave);this.canvas.removeEventListener('click',this.click);if(this.animation)cancelAnimationFrame(this.animation); }
  update(patch: Partial<PointConstructionSettings>) { this.settings={...this.settings,...patch,weights:{...this.settings.weights,...patch.weights}}; this.draw(); }
  regenerate() { this.rng=mulberry32((Math.random()*1e9)|0);this.points=this.generate(this.settings.count);this.roles=null;this.reprocess(); }
  reprocess() { this.marks=this.construct(true);this.clearSelections();this.draw(); }
  reexecute() { this.marks=this.construct(false);this.clearSelections();this.draw(); }
  choose(kind: 'inversion'|'rod'|'spiral') { this.picking=kind;this.draw(); }
  clear(kind: 'inversion'|'rod'|'spiral') { if(kind==='inversion')this.inversion=null;if(kind==='rod')this.rod=null;if(kind==='spiral')this.spiral=null;this.picking=null;this.draw(); }
  private generate(n:number) { const out:Point[]=[];let tries=0;while(out.length<n&&tries++<4000){const p={id:out.length,x:25+this.rng()*450,y:25+this.rng()*450};if(out.every(q=>dist(p,q)>34))out.push(p);}while(out.length<n)out.push({id:out.length,x:25+this.rng()*450,y:25+this.rng()*450});return out; }
  private construct(assign:boolean) {
    if(assign||!this.roles){this.roles={};for(const p of this.points){const types=(Object.keys(this.settings.weights) as (keyof Weights)[]);let total=types.reduce((s,t)=>s+Math.max(this.settings.weights[t],.0001),0),pick=this.rng()*total;this.roles[p.id!]=types.find(t=>(pick-=Math.max(this.settings.weights[t],.0001))<=0)??'point';}for(const kind of ['line','arc'] as const){const ids=this.points.filter(p=>this.roles![p.id!]===kind);if(ids.length%2)this.roles[ids.at(-1)!.id!]='point';}}
    const used=new Set<number>(), attached=new Set<number>(), marks:Mark[]=[];
    for (const p of this.points) {
      if (used.has(p.id!) || attached.has(p.id!)) continue;
      const role = this.roles![p.id!];
      if (role === 'point') { used.add(p.id!); marks.push({ type: 'point', p }); continue; }
      if (role === 'circle') {
        const pool = this.points.filter(q => q.id !== p.id && !used.has(q.id!)).sort((a, b) => dist(p, a) - dist(p, b));
        if (pool.length < 2) { used.add(p.id!); marks.push({ type: 'point', p }); continue; }
        const [a, b] = pool, da = dist(p, a), db = dist(p, b);
        used.add(p.id!); marks.push({ type: 'circle', o: p, a, b, center: p, radius: da * da / db, da, db }); continue;
      }
      const pool = this.points.filter(q => q.id !== p.id && this.roles![q.id!] === role && !attached.has(q.id!)).sort((a, b) => dist(p, a) - dist(p, b));
      if (!pool.length) { used.add(p.id!); marks.push({ type: 'point', p }); continue; }
      const k = pool[Math.min(this.settings.nthClosest - 1, pool.length - 1)];
      attached.add(p.id!); attached.add(k.id!);
      if (role === 'line') { marks.push({ type: 'line', j: p, k }); continue; }
      let e: Point | undefined, near: 'j' | 'k' = 'j', best = Infinity;
      for (const q of this.points.filter(q => q.id !== p.id && q.id !== k.id)) for (const [endpoint, name] of [[p, 'j'], [k, 'k']] as const) { const d = dist(q, endpoint); if (d < best) { best = d; e = q; near = name; } }
      if (!e) { marks.push({ type: 'line', j: p, k }); continue; }
      const selected = near === 'j' ? p : k, opposite = near === 'j' ? k : p;
      const je = dist(p, e), ke = dist(k, e);
      const lRatio = Math.min(je, ke) / Math.max(je, ke, 1);
      const lOrigin = je >= ke ? p : k, lTarget = je >= ke ? k : p;
      const l = add(lOrigin, scale(sub(lTarget, lOrigin), lRatio));
      const m = this.points.filter(q => q.id !== p.id && q.id !== k.id).sort((a, b) => dist(l, a) - dist(l, b))[0] ?? mid(p, k);
      const jm = dist(p, m), km = dist(k, m);
      const pullRatio = Math.min(jm, km) / Math.max(jm, km, 1);
      const apex = this.settings.apexMode === 'coincide' ? m : add(l, scale(sub(m, l), pullRatio));
      marks.push({ type: 'arc', j: p, k, e, l, m, apex, control: add(scale(apex, 2), scale(add(p, k), -.5)), selected, opposite, selDist: best });
    }
    return marks;
  }
  private clearSelections(){this.hovered=null;this.inversion=null;this.rod=null;this.spiral=null;this.picking=null;this.onInspect?.(null);}
  private inversionSource(mark: Mark) {
    if (mark.type === 'circle') return { center: mark.center, radius: mark.radius };
    if (mark.type === 'arc' && this.settings.curveStyle === 'circular') {
      const circle = arcThroughPoints(mark.j, mark.apex, mark.k);
      return circle ? { center: circle.center, radius: circle.r } : null;
    }
    return null;
  }
  private invertedPaths(mark: Mark, source: { center: Point; radius: number }) {
    if (mark.type === 'point') { const image = invertPoint(mark.p, source.center, source.radius); return image ? [[image]] : []; }
    if (mark.type === 'line') {
      const line = sub(mark.k, mark.j), lengthSquared = line.x * line.x + line.y * line.y || 1;
      const t = ((source.center.x - mark.j.x) * line.x + (source.center.y - mark.j.y) * line.y) / lengthSquared;
      const projection = add(mark.j, scale(line, t));
      if (dist(projection, source.center) < 1e-6) {
        const j = invertPoint(mark.j, source.center, source.radius), k = invertPoint(mark.k, source.center, source.radius);
        if (t < 0 || t > 1) return j && k ? [[j, k]] : [];
        if (t === 0 && k) return [[k, add(k, scale(unit(sub(mark.k, source.center)), 2000))]];
        if (t === 1 && j) return [[j, add(j, scale(unit(sub(mark.j, source.center)), 2000))]];
        return [j ? [j, add(j, scale(unit(sub(mark.j, source.center)), 2000))] : [], k ? [k, add(k, scale(unit(sub(mark.k, source.center)), 2000))] : []].filter(path => path.length > 1);
      }
    }
    return invertPath(pathFor(mark, this.settings), source.center, source.radius);
  }
  private hit(p:Point){for(let i=this.marks.length-1;i>=0;i--){const mark=this.marks[i];if(mark.type==='circle'&&Math.abs(dist(p,mark.center)-mark.radius)<7)return i;if(mark.type==='point'&&dist(p,mark.p)<11)return i;if(mark.type!=='point'&&mark.type!=='circle'&&polylineDistance(p,pathFor(mark,this.settings,96))<7)return i;}return null;}
  private inspect(mark: Mark | null): PointConstructionInspector | null {
    if (!mark) return null;
    if (mark.type === 'point') return { title: `Point · P${mark.p.id}`, rows: [{ label: 'position', value: `${mark.p.x.toFixed(1)}, ${mark.p.y.toFixed(1)}` }] };
    if (mark.type === 'line') return { title: `Line · P${mark.j.id}–P${mark.k.id}`, rows: [{ label: 'j', value: `P${mark.j.id}` }, { label: 'k', value: `P${mark.k.id}` }, { label: 'length', value: dist(mark.j, mark.k).toFixed(1) }] };
    if (mark.type === 'circle') return { title: `Circle · center P${mark.o.id}`, rows: [{ label: 'center', value: `P${mark.o.id}` }, { label: 'first reference', value: `P${mark.a.id} · ${mark.da.toFixed(1)}` }, { label: 'second reference', value: `P${mark.b.id} · ${mark.db.toFixed(1)}` }, { label: 'radius (da² / db)', value: mark.radius.toFixed(1) }] };
    const curve = this.settings.curveStyle === 'conic' ? `conic · w=${this.settings.conicWeight.toFixed(2)}` : this.settings.curveStyle;
    const near = mark.selected === mark.j ? 'j' : 'k';
    const jm = dist(mark.j, mark.m), km = dist(mark.k, mark.m);
    const je = dist(mark.j, mark.e), ke = dist(mark.k, mark.e);
    const lRatio = Math.min(je, ke) / Math.max(je, ke, 1);
    const lOrigin = je >= ke ? 'j' : 'k';
    const pullRatio = Math.min(jm, km) / Math.max(jm, km, 1);
    const pullDistance = dist(mark.l, mark.m) * pullRatio;
    const rows = [
      { label: 'j', value: `P${mark.j.id}` },
      { label: 'k', value: `P${mark.k.id}` },
      { label: `e — closest (near ${near})`, value: `P${mark.e.id} · ${mark.selDist.toFixed(1)}` },
      { label: 'l — chord point', value: `from ${lOrigin} · ${lRatio.toFixed(3)}` },
      { label: 'pull source m', value: `P${mark.m.id}` },
      { label: 'pull ratio JM:KM', value: pullRatio.toFixed(3) },
      { label: 'distance along L→M', value: pullDistance.toFixed(1) },
      { label: 'derived apex', value: `${mark.apex.x.toFixed(1)}, ${mark.apex.y.toFixed(1)}` },
    ];
    rows.push({ label: 'curve', value: curve });
    return { title: `Arc · P${mark.j.id}–P${mark.k.id}`, rows };
  }
  private coords=(event:PointerEvent|MouseEvent)=>{const rect=this.canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*500/rect.width,y:(event.clientY-rect.top)*500/rect.height};};
  private move=(event:PointerEvent)=>{const next=this.hit(this.coords(event));if(next!==this.hovered){this.hovered=next;this.onInspect?.(next === null ? null : this.inspect(this.marks[next]));this.draw();}};
  private leave=()=>{this.hovered=null;this.onInspect?.(null);this.draw();};
  private click=(event:MouseEvent)=>{if(!this.picking)return;const index=this.hit(this.coords(event));if(index===null)return;const mark=this.marks[index];if(this.picking==='inversion'&&(mark.type==='circle'||mark.type==='arc'))this.inversion=index;else if(this.picking==='rod'&&mark.type!=='point')this.rod=index;else if(this.picking==='spiral'&&(mark.type==='circle'||(mark.type==='arc'&&this.settings.curveStyle==='circular')))this.spiral=index;else return;this.picking=null;this.draw();};
  private drawPath(points:Point[]){this.ctx.beginPath();this.ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)this.ctx.lineTo(points[i].x,points[i].y);this.ctx.stroke();}
  private draw() {
    const rect=this.canvas.getBoundingClientRect(),dpr=devicePixelRatio||1,size=rect.width||500;this.canvas.width=Math.round(size*dpr);this.canvas.height=Math.round(size*dpr);this.ctx.setTransform(size*dpr/500,0,0,size*dpr/500,0,0);this.ctx.clearRect(0,0,500,500);const ctx=this.ctx,diagram=this.diagramStyle(),colors=diagram.marks,markColors=markVariantColors(this.marks,colors),pointColors=sourcePointColors(this.marks,markColors),css=getComputedStyle(document.documentElement),muted=css.getPropertyValue('--mantine-color-dimmed').trim(),border=css.getPropertyValue('--mantine-color-default-border').trim(),text=css.getPropertyValue('--mantine-color-text').trim();
    if(this.settings.grid){ctx.strokeStyle=border;ctx.globalAlpha=diagram.grid.opacity;ctx.lineWidth=diagram.grid.lineWidth;for(let i=0;i<=500;i+=25){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,500);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(500,i);ctx.stroke();}ctx.globalAlpha=1;}
    const constant=this.inversion===null?null:this.marks[this.inversion];
    this.marks.forEach((mark,index)=>{const color=markColors[index],dim=constant ? index!==this.inversion&&index!==this.hovered : this.hovered!==null&&index!==this.hovered;ctx.save();ctx.globalAlpha=dim?.18:1;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=index===this.hovered?3.4:2;if(mark.type==='point'){ctx.beginPath();ctx.arc(mark.p.x,mark.p.y,diagram.sourcePoint.radius,0,TAU);ctx.fill();}else if(mark.type==='circle'){ctx.beginPath();ctx.arc(mark.center.x,mark.center.y,mark.radius,0,TAU);ctx.stroke();}else{this.drawPath(pathFor(mark,this.settings));}if(mark.type==='arc'&&this.settings.arcCircle&&!dim)this.drawArcCircle(mark,color,diagram);if(this.settings.guides&&!dim)this.drawGuides(mark,color,diagram);ctx.restore();});
    if(this.settings.labels){ctx.save();for(const point of this.points){ctx.fillStyle=pointColors.get(point.id!)??colors[this.roles?.[point.id!]??'point'];ctx.beginPath();ctx.arc(point.x,point.y,diagram.sourcePoint.radius,0,TAU);ctx.fill();}ctx.restore();ctx.save();ctx.fillStyle=muted;ctx.font='10px var(--mantine-font-family-monospace)';ctx.textAlign='center';for(const point of this.points)ctx.fillText(`P${point.id}`,point.x,point.y-13);ctx.restore();}
    if(this.hovered!==null)this.drawHoverPointRings(this.marks[this.hovered],markColors[this.hovered],diagram);
    const inversionSource=constant?this.inversionSource(constant):null;
    if(inversionSource){this.marks.forEach((mark,index)=>{if(mark===constant)return;const paths=this.invertedPaths(mark,inversionSource);ctx.save();ctx.strokeStyle=markColors[index];ctx.setLineDash([2,5]);ctx.globalAlpha=.72;for(const p of paths)if(p.length>1)this.drawPath(p);ctx.restore();});}
    this.drawRod(diagram);this.drawSpiral(diagram);if(this.picking){ctx.fillStyle=text;ctx.font='12px var(--mantine-font-family-monospace)';ctx.fillText(`Pick ${this.picking} source`,12,22);}
  }
  private drawGuides(mark:Mark,color:string,diagram:DiagramStyle){
    if(mark.type!=='arc'&&mark.type!=='circle')return;
    const ctx=this.ctx,{guide,annotation}=diagram,lines:[Point,Point][]=mark.type==='arc'?[[mark.selected,mark.e],[mark.opposite,mark.e],[mark.j,mark.k],[mark.l,mark.m]]:[[mark.o,mark.a],[mark.o,mark.b]];
    ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=guide.opacity;ctx.lineWidth=guide.lineWidth;ctx.setLineDash(guide.dash);for(const [from,to] of lines){ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();}ctx.restore();
    const dots=mark.type==='arc'?[mark.e,mark.l,mark.m]:[mark.a,mark.b];ctx.save();ctx.fillStyle=color;ctx.globalAlpha=guide.opacity;for(const point of dots){ctx.beginPath();ctx.arc(point.x,point.y,guide.markerRadius,0,TAU);ctx.fill();}ctx.restore();
    const labels:[Point,string][]=mark.type==='arc'?[[mid(mark.selected,mark.e),'1'],[mid(mark.opposite,mark.e),'AC'],[mid(mark.j,mark.k),'AB'],[mid(mark.l,mark.m),'m']]:[[mid(mark.o,mark.a),'1'],[mid(mark.o,mark.b),'2']];ctx.save();ctx.font=annotation.font;ctx.textAlign='center';ctx.textBaseline='middle';for(const [point,text] of labels) {const width=ctx.measureText(text).width;ctx.fillStyle=annotation.background;ctx.globalAlpha=.85;ctx.fillRect(point.x-width/2-3,point.y-6,width+6,12);ctx.globalAlpha=1;ctx.fillStyle=color;ctx.fillText(text,point.x,point.y+.5);}ctx.restore();
    if(mark.type==='arc'&&mark.apex!==mark.m){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=guide.lineWidth;ctx.beginPath();ctx.moveTo(mark.apex.x-guide.crosshairSize,mark.apex.y);ctx.lineTo(mark.apex.x+guide.crosshairSize,mark.apex.y);ctx.moveTo(mark.apex.x,mark.apex.y-guide.crosshairSize);ctx.lineTo(mark.apex.x,mark.apex.y+guide.crosshairSize);ctx.stroke();ctx.restore();}
  }
  private drawArcCircle(mark:Arc,color:string,diagram:DiagramStyle){
    const circle=arcThroughPoints(mark.j,mark.apex,mark.k);if(!circle)return;
    const { guide }=diagram;this.ctx.save();this.ctx.strokeStyle=color;this.ctx.globalAlpha=guide.opacity;this.ctx.lineWidth=guide.lineWidth;this.ctx.setLineDash(guide.dash);this.ctx.beginPath();this.ctx.arc(circle.center.x,circle.center.y,circle.r,0,TAU);this.ctx.stroke();this.ctx.restore();
  }
  private drawHoverPointRings(mark:Mark,color:string,diagram:DiagramStyle){
    const points=mark.type==='point'?[mark.p]:mark.type==='line'?[mark.j,mark.k]:mark.type==='circle'?[mark.o,mark.a,mark.b]:[mark.j,mark.k,mark.e,mark.m];
    const unique=points.filter((point,index)=>points.findIndex(candidate=>candidate.id===point.id)===index);
    this.ctx.save();this.ctx.strokeStyle=color;this.ctx.lineWidth=diagram.hoverPoint.lineWidth;
    for(const point of unique){this.ctx.beginPath();this.ctx.arc(point.x,point.y,diagram.hoverPoint.radius,0,TAU);this.ctx.stroke();}
    this.ctx.restore();
  }
  private drawRod(diagram:DiagramStyle){if(this.rod===null)return;const path=pathFor(this.marks[this.rod],this.settings,240);if(path.length<2)return;const apex=Math.round((path.length-1)*this.settings.apex/100),first=path.slice(0,apex+1).reverse(),second=path.slice(apex),t=this.settings.tetherLength,side=this.settings.side,normal=unit(sub(second[1],second[0])),follower=add(path[apex],scale(side==='right'?{x:normal.y,y:-normal.x}:{x:-normal.y,y:normal.x},t)),compression=tractrixTrace(first,t,side==='left'?'right':'left',follower)?.reverse()??[],tension=tractrixTrace(second,t,side,follower)??[];this.ctx.save();this.ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--mantine-primary-color-filled').trim();this.ctx.lineWidth=2.5;this.ctx.setLineDash([7,3]);if(compression.length>1)this.drawPath(compression);if(tension.length>1)this.drawPath(tension);this.ctx.restore();}
  private drawSpiral(diagram:DiagramStyle){if(this.spiral===null)return;const mark=this.marks[this.spiral];let center:Point,radius:number,base=0;if(mark.type==='circle'){({center,radius}=mark);}else if(mark.type==='arc'){const c=arcThroughPoints(mark.j,mark.apex,mark.k);if(!c)return;center=c.center;radius=c.r;base=c.startAngle;}else return;const phase=base+this.settings.spiralPhase*Math.PI/180,pts=Array.from({length:481},(_,i)=>{const t=this.settings.spiralDirection*this.settings.spiralTurns*TAU*i/480,d=1+t*t,x=radius*(Math.cos(t)+t*Math.sin(t))/d,y=radius*(Math.sin(t)-t*Math.cos(t))/d,c=Math.cos(phase),s=Math.sin(phase);return{x:center.x+c*x-s*y,y:center.y+s*x+c*y};});this.ctx.save();this.ctx.strokeStyle=diagram.marks.circle;this.ctx.lineWidth=2.2;this.drawPath(pts);this.ctx.restore();}
}
