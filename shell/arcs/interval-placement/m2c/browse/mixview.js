// Compound mixes view, shared by the browse page and the catalog findings page (injected at /*MIXVIEW*/).
// A mix raises some of a set's intervals by an octave (12 steps): for 2 4 5 -> 14 4 5, 2 16 5, ..., 14 16 17.
// Draws one overview map per mix (the browse page's map: orderings x windows, darker = better, outlined = best in its
// window, orange dot = a merged note) plus a dark dot where the mix keeps the simple chord's pitch classes, and, for a
// clicked cell, the mixed chord beside its simple chord as chord columns (the browse page's column drawing).
// Placement rules are the catalog's (m2c/catalog/worker2.ts): equal centers / shared center range, ties toward the middle.
const MIX = (() => {
  const TIE = 1e-9;
  function centres(rule, order, W) {
    const n = order.length;
    if (n === 1) return [W / 2];
    if (rule === 'shared') {
      const h = Math.max(...order) / 2;
      return order.map((_, k) => h + (k * (W - 2 * h)) / (n - 1));
    }
    let D = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D = Math.min(D, (W - (order[i] + order[j]) / 2) / (j - i));
    let c0 = -Infinity;
    for (let k = 0; k < n; k++) c0 = Math.max(c0, order[k] / 2 - k * D);
    return order.map((_, k) => c0 + k * D);
  }
  function low(c, d, W) {
    const x = c - d / 2, f = Math.floor(x + TIE);
    if (Math.abs(x - f - 0.5) > TIE) return [Math.round(x), false];
    return [c < W / 2 - TIE ? f + 1 : f, true];
  }
  /** One placement (main rounding): spans with low note, size and center; the note set; notes hit by two ends. */
  function place(rule, order, W) {
    const cs = centres(rule, order, W);
    let ties = 0;
    const spans = order.map((d, k) => { const [lo, t] = low(cs[k], d, W); if (t) ties++; return { low: lo, size: d, centre: cs[k] }; });
    const ends = spans.flatMap((s) => [s.low, s.low + s.size]);
    const notes = [...new Set(ends)].sort((a, b) => a - b);
    const shared = notes.filter((x) => ends.filter((y) => y === x).length > 1);
    return { spans, notes, shared, ties, merges: ends.length - notes.length, band: Math.max(...cs) - Math.min(...cs) };
  }
  /**
   * The reverse lookup (human, 2026-11-21, "a semi-arbitrary type of z relation"): every input set, ordering, rule and
   * window whose placement is exactly these notes (steps from the window's bottom). Each interval of a producing set is a
   * gap between two of the notes, so only those gaps are tried. Equal centers always fill the window (lowest note 0, top
   * note W); shared center range sits at most ceil(max / 2) steps in from either edge (checked on the whole catalog).
   * o: { ns: cardinalities to search, max: largest interval, wmax: largest window }. Returns [{ n, set, rule, order, W }].
   */
  function producers(notes, o) {
    const k = notes.length, top = notes[k - 1], key = notes.join(' ');
    const gaps = new Set();
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (notes[j] - notes[i] <= o.max) gaps.add(notes[j] - notes[i]);
    const G = [...gaps].sort((a, b) => a - b);
    // the lowest note is the bottom of some interval and the top note the top of one
    const fromLow = new Set(notes.slice(1).map((x) => x - notes[0])), toTop = new Set(notes.slice(0, -1).map((x) => top - x));
    const ends = (ms) => ms.some((x) => fromLow.has(x)) && ms.some((x) => toTop.has(x));
    const slack = Math.ceil(o.max / 2);
    const out = [];
    const perms = (xs) => {
      if (xs.length <= 1) return [xs.slice()];
      const res = [], seen = new Set();
      xs.forEach((x, i) => { if (seen.has(x)) return; seen.add(x); for (const r of perms(xs.filter((_, j) => j !== i))) res.push([x, ...r]); });
      return res;
    };
    const tryOrder = (ms, ord) => {
      const M = ms[ms.length - 1];
      if (notes[0] === 0 && top >= M && top <= o.wmax && place('equal', ord, top).notes.join(' ') === key) out.push({ n: ms.length, set: ms.join(' '), rule: 'equal', order: ord.join(' '), W: top });
      if (notes[0] > slack) return;
      for (let W = Math.max(top, M); W <= Math.min(top + slack, o.wmax); W++) {
        if (place('shared', ord, W).notes.join(' ') === key) out.push({ n: ms.length, set: ms.join(' '), rule: 'shared', order: ord.join(' '), W });
      }
    };
    for (const n of o.ns) {
      if (2 * n < k) continue; // every note is the end of some interval
      const ms = [];
      const rec = (from) => {
        if (ms.length === n) { if (ends(ms)) for (const ord of perms(ms)) tryOrder(ms, ord); return; }
        for (let i = from; i < G.length; i++) { ms.push(G[i]); rec(i); ms.pop(); }
      };
      rec(0);
    }
    return out;
  }
  /** Every mix of a set, simple first, then by how many intervals are compound. comp = the simple values raised. */
  function variants(iv) {
    const s = iv.slice().sort((a, b) => a - b), seen = new Map();
    for (let mask = 0; mask < 1 << s.length; mask++) {
      const set = s.map((x, i) => ((mask >> i) & 1 ? x + 12 : x)).sort((a, b) => a - b);
      const key = set.join(' ');
      if (!seen.has(key)) seen.set(key, { set, k: s.filter((_, i) => (mask >> i) & 1).length, comp: s.filter((_, i) => (mask >> i) & 1) });
    }
    return [...seen.values()].sort((a, b) => a.k - b.k);
  }
  /** The simple ordering a mixed ordering came from (each raised value back down an octave). */
  function reduce(order, comp) {
    const pool = comp.slice();
    return order.map((v) => { const i = pool.indexOf(v - 12); if (i >= 0) { pool.splice(i, 1); return v - 12; } return v; });
  }
  const pcs = (notes) => [...new Set(notes.map((x) => ((x % 12) + 12) % 12))].sort((a, b) => a - b).join(' ');
  const STOPS = [[226, 236, 250], [158, 197, 244], [109, 167, 236], [57, 135, 229], [37, 106, 191], [24, 79, 149], [16, 66, 129]];
  const ramp = (t) => {
    const p = Math.max(0, Math.min(1, t)) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(p)), f = p - i;
    return `rgb(${STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f)).join(',')})`;
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /** Chord column (the browse page's colSvg): window, center band, one bar per interval, center ticks, merged notes. */
  function colSvg(p, g, colorOf) {
    const W = 56;
    let s = `<svg width="${W}" height="${g.H}" aria-hidden="true">`;
    for (let n = 0; n <= g.HI; n += 12) s += `<line x1="0" x2="${W}" y1="${g.y(n)}" y2="${g.y(n)}" stroke="var(--grid)"/>`;
    s += `<rect x="4" y="${g.y(p.W)}" width="${W - 8}" height="${g.y(0) - g.y(p.W)}" rx="3" fill="var(--band)"/>`;
    const cs = p.spans.map((x) => x.centre), cmin = Math.min(...cs), cmax = Math.max(...cs);
    s += `<rect x="4" y="${g.y(cmax)}" width="${W - 8}" height="${Math.max(1.5, g.y(cmin) - g.y(cmax))}" rx="2" fill="var(--cband)"/>`;
    const gap = (W - 16) / p.spans.length;
    p.spans.forEach((sp, i) => {
      const x = 8 + gap * (i + 0.5), col = colorOf(sp.size);
      s += `<line x1="${x}" x2="${x}" y1="${g.y(sp.low)}" y2="${g.y(sp.low + sp.size)}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
      s += `<circle cx="${x}" cy="${g.y(sp.low)}" r="3" fill="${col}"/><circle cx="${x}" cy="${g.y(sp.low + sp.size)}" r="3" fill="${col}"/>`;
      s += `<line x1="${x - 6}" x2="${x + 6}" y1="${g.y(sp.centre)}" y2="${g.y(sp.centre)}" stroke="var(--fg)" stroke-width="2" stroke-linecap="round"/>`;
    });
    for (const m of p.shared) s += `<rect x="3" y="${g.y(m) - 3}" width="${W - 6}" height="6" rx="3" fill="none" stroke="var(--shared)" stroke-width="1.5"/>`;
    return s + '</svg>';
  }

  /**
   * model: { variants: [{ set, k, comp, P: [{ rule, order: 'a b c', W, notes, spans, shared, merges, ...scores }] }], windows: [simple windows] }
   * o: { rule, metric: score key, dir: 1 lower is better / -1 higher is better, fmt, metricName, offset: 0 | 12,
   *      name(step) -> note name, colors: [css colors by simple interval size], sel: { vi, order, w } | null,
   *      onSelect(sel), play(notes, mode, button) optional, ruleName }
   */
  function render(host, model, o) {
    host.innerHTML = '';
    const V = model.variants, simple = V[0];
    const n = simple.set.length;
    const sizes = [...new Set(simple.set)];
    const colorOf = (size) => o.colors[sizes.indexOf(sizes.includes(size) ? size : size - 12)] || 'var(--muted)';
    const idx = V.map((v) => new Map(v.P.filter((p) => p.rule === o.rule).map((p) => [`${p.order}|${p.W}`, p])));
    const winOf = (vi, w) => w + (vi ? o.offset : 0);
    const rowsOf = (vi) => [...new Set(V[vi].P.filter((p) => p.rule === o.rule).map((p) => p.order))];
    const simpleOf = (vi, p) => idx[0].get(`${reduce(p.order.split(' ').map(Number), V[vi].comp).join(' ')}|${p.W - (vi ? o.offset : 0)}`);
    const all = [];
    V.forEach((v, vi) => rowsOf(vi).forEach((r) => model.windows.forEach((w) => { const p = idx[vi].get(`${r}|${winOf(vi, w)}`); if (p) all.push(p[o.metric]); })));
    const lo = Math.min(...all), hi = Math.max(...all);
    const good = (v) => (hi === lo ? 1 : o.dir === 1 ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo));
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;gap:14px';
    host.appendChild(wrap);
    const cols = model.windows, cw = 18, rh = 18, T = 22;
    const labelW = 14 + 9 * Math.max(...V.flatMap((v, vi) => rowsOf(vi).map((r) => r.length)));
    V.forEach((v, vi) => {
      const rows = rowsOf(vi);
      const W = labelW + cols.length * cw + 8, H = T + rows.length * rh + 6;
      let s = '';
      cols.forEach((w, j) => { if (w % 6 === 0 || j === 0 || j === cols.length - 1) s += `<text x="${labelW + j * cw + cw / 2}" y="${T - 7}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="var(--font-mono)">${winOf(vi, w)}</text>`; });
      rows.forEach((r, i) => { s += `<text x="${labelW - 8}" y="${T + i * rh + 13}" text-anchor="end" font-size="11" fill="var(--fg)" font-family="var(--font-mono)">${r}</text>`; });
      const best = new Map();
      for (const w of cols) {
        const g = rows.map((r) => idx[vi].get(`${r}|${winOf(vi, w)}`)).filter(Boolean);
        if (g.length) best.set(w, g.reduce((a, b) => (o.dir * (b[o.metric] - a[o.metric]) < 0 ? b : a)));
      }
      rows.forEach((r, i) => cols.forEach((w, j) => {
        const p = idx[vi].get(`${r}|${winOf(vi, w)}`);
        if (!p) return;
        const x = labelW + j * cw, y = T + i * rh;
        const isSel = o.sel && o.sel.vi === vi && o.sel.order === r && o.sel.w === w;
        s += `<rect data-k="${vi}:${i}:${j}" x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" rx="3" fill="${ramp(good(p[o.metric]))}" ${best.get(w) === p ? 'stroke="var(--win)" stroke-width="2"' : ''}/>`;
        if (p.merges) s += `<circle cx="${x + cw - 5}" cy="${y + 5}" r="2" fill="var(--shared)" pointer-events="none"/>`;
        if (vi) { const q = simpleOf(vi, p); if (q && pcs(q.notes) === pcs(p.notes)) s += `<circle cx="${x + 5}" cy="${y + rh - 5}" r="2.2" fill="var(--fg)" stroke="var(--surface)" stroke-width="1" pointer-events="none"/>`; }
        if (isSel) s += `<rect x="${x}" y="${y}" width="${cw}" height="${rh}" rx="4" fill="none" stroke="var(--fg)" stroke-width="2" pointer-events="none"/>`;
      }));
      const block = document.createElement('div');
      block.innerHTML = `<div style="font-size:0.88rem;margin-bottom:2px"><b style="font-family:var(--font-mono)">${v.set.join(' ')}</b> <span class="muted">${vi === 0 ? 'simple' : `${v.k === n ? 'all' : v.k + ' of ' + n} compound (${v.comp.map((c) => c + '→' + (c + 12)).join(', ')})${o.offset ? ', windows 12 wider: column labels are its own window' : ', same windows'}`}</span></div>` +
        `<div style="overflow-x:auto"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 1200)}px;max-width:${W * 1.6}px" role="img" aria-label="Map of ${v.set.join(' ')}, orderings by window">${s}</svg></div>`;
      const svg = block.querySelector('svg');
      const at = (ev) => { const k = ev.target.getAttribute && ev.target.getAttribute('data-k'); if (!k) return null; const [a, i, j] = k.split(':').map(Number); return { vi: a, order: rows[i], w: cols[j], p: idx[a].get(`${rows[i]}|${winOf(a, cols[j])}`) }; };
      svg.addEventListener('pointermove', (ev) => {
        const c = at(ev);
        if (!c) { tip.hidden = true; return; }
        const q = c.vi ? simpleOf(c.vi, c.p) : null;
        tip.innerHTML = `<b>${c.order}</b>, window ${c.p.W}<br>${c.p.notes.map(o.name).join(' ')}<br>${o.metricName} ${o.fmt(c.p[o.metric])}${c.p.merges ? ` · ${c.p.merges} merged` : ''}` +
          (q ? `<br><span class="muted">simple ${q.order} in ${q.W}: ${q.notes.map(o.name).join(' ')}${pcs(q.notes) === pcs(c.p.notes) ? '<br>same pitch classes' : ''}</span>` : '');
        tip.hidden = false;
        const r = wrap.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 4)) + 'px';
        tip.style.top = (ev.clientY - r.top + 14) + 'px';
      });
      svg.addEventListener('pointerleave', () => { tip.hidden = true; });
      svg.addEventListener('click', (ev) => { const c = at(ev); if (c) o.onSelect({ vi: c.vi, order: c.order, w: c.w }); });
      wrap.appendChild(block);
    });
    wrap.appendChild(tip);
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = `<span>${esc(o.metricName)}: ${o.fmt(o.dir === 1 ? hi : lo)} <i class="ramp" style="background:linear-gradient(90deg,${ramp(0)},${ramp(0.5)},${ramp(1)})"></i> ${o.fmt(o.dir === 1 ? lo : hi)} (one scale for every map)</span>` +
      '<span><i style="display:inline-block;width:12px;height:12px;border:2px solid var(--win);border-radius:3px"></i> best in its window</span>' +
      '<span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--shared)"></i> has a merged note</span>' +
      '<span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--fg)"></i> same pitch classes as the simple chord</span><span>click a cell to compare it with its simple chord</span>';
    host.appendChild(lg);

    // compare: the clicked chord beside its simple chord, same vertical scale
    const det = document.createElement('div');
    det.style.cssText = 'border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:8px';
    host.appendChild(det);
    const sel = o.sel && idx[o.sel.vi] ? idx[o.sel.vi].get(`${o.sel.order}|${winOf(o.sel.vi, o.sel.w)}`) : null;
    if (!sel) { det.innerHTML = '<p class="muted">Click a cell in any map to see that chord beside its simple chord.</p>'; return; }
    const pair = o.sel.vi ? [[simpleOf(o.sel.vi, sel), V[0]], [sel, V[o.sel.vi]]] : [[sel, V[0]]];
    const shown = pair.filter((x) => x[0]);
    const HI = Math.max(24, ...shown.map(([p]) => p.W)), step = Math.max(5, Math.min(10, 360 / HI)), top = 10;
    const g = { HI, H: top + HI * step + 10, y: (n2) => top + (HI - n2) * step };
    let ax = `<svg width="38" height="${g.H}" aria-hidden="true">`;
    for (let m = 0; m <= HI; m += 12) ax += `<text x="34" y="${g.y(m) + 4}" text-anchor="end" font-size="11" font-family="var(--font-mono)" fill="var(--muted)">${o.name(m)}</text>`;
    ax += '</svg>';
    const same = shown.length === 2 && pcs(shown[0][0].notes) === pcs(shown[1][0].notes);
    det.innerHTML = `<div class="muted" style="font-size:0.85rem">${esc(o.ruleName)}${shown.length === 2 ? ` · ${same ? '<b style="color:var(--fg)">same pitch classes</b>' : 'different pitch classes'}` : ''}</div>` +
      `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start"><div style="display:flex;gap:2px">${ax}${shown.map(([p, v], i) => `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${colSvg(p, g, colorOf)}<span style="font-family:var(--font-mono);font-size:0.72rem" class="muted">${i === 0 && shown.length === 2 ? 'simple' : v.k ? 'mix' : 'simple'}</span></div>`).join('')}</div>` +
      `<div style="display:flex;flex-direction:column;gap:10px;min-width:0">${shown.map(([p, v], i) => `<div style="display:flex;flex-direction:column;gap:3px"><div class="muted" style="font-size:0.78rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">${v.k ? `${v.set.join(' ')}` : 'simple ' + v.set.join(' ')} · ordering ${p.order} · window ${p.W}</div>` +
        `<div style="font-family:var(--font-mono)">${p.notes.map(o.name).join(' ')}</div>` +
        `<div class="muted" style="font-size:0.85rem;display:flex;flex-wrap:wrap;gap:2px 14px">${p.spans.map((sp) => `<span>${sp.size}: ${o.name(sp.low)}–${o.name(sp.low + sp.size)}</span>`).join('')}</div>` +
        `<div class="muted" style="font-size:0.85rem;display:flex;flex-wrap:wrap;gap:2px 14px">${(o.scores || []).map(([k, l, f]) => (p[k] === undefined ? '' : `<span>${l} <b style="color:var(--fg)">${f(p[k])}</b></span>`)).join('')}<span>merged notes <b style="color:var(--fg)">${p.merges}</b></span></div>` +
        (o.play ? `<div style="display:flex;gap:6px"><button type="button" data-i="${i}" data-mode="chord">Chord</button><button type="button" data-i="${i}" data-mode="arp">Arpeggio</button></div>` : '') + '</div>').join('')}</div></div>`;
    if (o.play) det.querySelectorAll('button[data-mode]').forEach((b) => b.addEventListener('click', () => o.play(shown[+b.dataset.i][0].notes, b.dataset.mode, b)));
  }
  return { place, producers, variants, reduce, pcs, render, colSvg, ramp };
})();
