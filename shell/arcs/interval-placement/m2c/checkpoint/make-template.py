# Derive the checkpoint page template from the M2c catalog page (m2c/catalog-page.template.html), the page the human
# already used: same layout, columns, audio and band chart; data from the library (build-checkpoint.ts), the default
# ranking added, the old prefix-slack engine removed. Every replacement must match exactly once.
# Usage: python make-template.py <m2c/catalog-page.template.html> <out template>
import io
import sys

src, out = sys.argv[1], sys.argv[2]
s = io.open(src, encoding='utf-8').read()


def rep(old, new):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'expected 1 match, got {n}: {old[:70]!r}')
    s = s.replace(old, new)


rep('<title>Even Spacing Catalog</title>', '<title>Placement Catalog Checkpoint</title>')
rep('<h1>Even Spacing Catalog</h1>', '<h1>Placement Catalog Checkpoint</h1>')
rep(
    s[s.index('    <p>The essential intervals are placed'):s.index('</p>\n  </header>') + 4],
    '    <p>Built with the new library code. The essential intervals are placed by their centers in <b>every ordering</b>, '
    'and every window starts on <b>C2</b> (the window is a width only). <b>Equal centers</b> (the default): the centers '
    'are equally spaced, as far apart as the window allows, so every chord reaches both the bottom and the top of its '
    'window. <b>Shared center range</b> (the second rule): the centers are equally spaced across one range set by the '
    'largest interval. Each interval\'s bottom note is rounded once to the nearest step; an exact half step rounds toward '
    'the middle of the window. With a range of window sizes, each size gives one chord per ordering, and all of them are '
    'listed together, the same chord once. <b>Default ranking</b>: smooth (low roughness) and harmonic (high pitch-space '
    'harmonicity), weighted equally against the other chords in view. Chords stand as columns on one pitch axis, best '
    'first from the left. Click a chord for its details and to hear it.</p>',
)
rep("const ALL = /*DATA*/null;", "/*RANK*/\nconst ALL = /*DATA*/null;")
rep("const SETS = ['11 7 16', '7 5 11'];", "const SETS = ['11 7 16', '5 11 15'];\nconst WEIGHTS = { rough: -1, harmP: 1 };")
rep(
    "  ['rough', 'Roughness (smoothest first)',",
    "  ['mix', 'Default ranking', (a, b) => b.mix - a.mix, (e) => e.mix.toFixed(2)],\n  ['rough', 'Roughness (smoothest first)',",
)
rep(
    "  ['harmP', 'Harmonicity (highest first)', (a, b) => b.harmP - a.harmP, (e) => e.harmP.toFixed(3)],",
    "  ['harmP', 'Harmonicity, pitch-space (highest first)', (a, b) => b.harmP - a.harmP, (e) => e.harmP.toFixed(3)],\n"
    "  ['harmPc', 'Harmonicity, pitch-class (highest first)', (a, b) => b.harmPc - a.harmPc, (e) => e.harmPc.toFixed(3)],",
)
rep(
    "const ENGINES = [['equal', 'Equal centers'], ['shared', 'Shared center range'], ['prefix', 'Old prefix-slack']];",
    "const ENGINES = [['equal', 'Equal centers'], ['shared', 'Shared center range']];",
)
rep("sort: 'rough', sel: 0 };", "sort: 'mix', sel: 0 };")
# center band and spans: the library rows use `rule` and `center`
rep(
    """  if (e.engine === 'shared') {
    const h = Math.max(...sizes) / 2;
    return { min: h, max: e.width - h };
  }
  if (e.engine === 'prefix') {
    // old engine: odd intervals split with the extra step below (odd bias "down")
    return { min: Math.max(...sizes.map((d) => Math.ceil(d / 2))), max: e.width - Math.max(...sizes.map((d) => Math.floor(d / 2))) };
  }
  const cs = e.spans.map((s) => s.centre);""",
    """  if (e.rule === 'shared') {
    const h = Math.max(...sizes) / 2;
    return { min: h, max: e.width - h };
  }
  const cs = e.spans.map((s) => s.center);""",
)
rep("const yc = g.y(36 + sp.centre);", "const yc = g.y(36 + sp.center);")
rep("// the centre band: shared / prefix = the allowed centre range (as the old plot drew it); equal = lowest to highest centre",
    "// the center band: shared = the allowed center range; equal = lowest to highest center")
# detail panel
rep(
    """      <div class="facts"><span>order <b>${e.orders.join(' / ')}</b></span><span>window <b>${e.width}</b> steps</span>""",
    """      <div class="facts"><span>made by <b>${occText(e)}</b></span>""",
)
rep(
    """center <b>${sp.centre.toFixed(2)}</b>${state.engine === 'prefix' ? ` → anchor <b>${Math.floor(sp.centre + 1e-9)}</b>` : ''}</span>`).join('')}</div>""",
    """center <b>${fmtStep(sp.center)}</b></span>`).join('')}${e.spans.length && e.occ.length > 1 ? '<span>(spans of the first)</span>' : ''}${tieText(e)}</div>""",
)
rep(
    """<div class="facts"><span>roughness <b>${e.rough.toFixed(3)}</b></span><span>harmonicity <b>${e.harmP.toFixed(3)}</b></span><span>periodicity <b>${e.per.toFixed(2)}</b></span></div>""",
    """<div class="facts"><span>ranking <b>#${rankOf.get(e.id)}</b> of ${current.length} (mix ${e.mix.toFixed(2)})</span><span>Pareto layer <b>${e.layer + 1}</b> (roughness × pitch-space harmonicity; 1 = nothing beats it on both)</span></div>
      <div class="facts"><span>roughness <b>${e.rough.toFixed(3)}</b></span><span>harmonicity, pitch-space <b>${e.harmP.toFixed(3)}</b></span><span>harmonicity, pitch-class <b>${e.harmPc.toFixed(3)}</b></span><span>periodicity <b>${e.per.toFixed(2)}</b></span></div>""",
)
rep(
    "let current = [];\nfunction renderDetail() {",
    """let current = [];
let rankOf = new Map();
const occText = (e) => {
  const one = state.wmin === state.wmax;
  return e.occ.map((o) => (one ? o.order : `${o.order} in ${o.w}`)).join(' / ') + (one ? `, window ${e.width} steps` : '');
};
const tieText = (e) => {
  const t = Math.max(...e.occ.map((o) => o.ties));
  return t ? `<span>${t} bottom note${t > 1 ? 's' : ''} at an exact half step, rounded toward the middle</span>` : '';
};
function renderDetail() {""",
)
# the list: merge the width range from the library rows, rank, then sort as chosen
rep(
    """  const inView = (e) => e.engine === state.engine && e.set === state.set && e.width >= state.wmin && e.width <= state.wmax;
  current = DATA.filter(inView).sort(sort[2]);
  const sums = SUMMARY.filter(inView);""",
    """  const inView = (e) => e.rule === state.engine && e.set === state.set && e.width >= state.wmin && e.width <= state.wmax;
  const ranked = rankEntries(mergeRange(DATA.filter((e) => e.rule === state.engine && e.set === state.set), state.wmin, state.wmax), WEIGHTS);
  const layers = paretoLayerOf(ranked, 'rough', 'min', 'harmP', 'max');
  ranked.forEach((e, i) => { e.layer = layers[i]; });
  rankOf = new Map(ranked.map((e, i) => [e.id, i + 1]));
  current = state.sort === 'mix' ? ranked : ranked.slice().sort(sort[2]);
  const sums = SUMMARY.filter(inView);""",
)
rep("const tooSmall = sums.filter((e) => e.skipped === e.orderings).map((e) => e.width);",
    "const tooSmall = sums.filter((e) => e.cannotFit === e.orderings).map((e) => e.width);")
rep("""<span class="ord">${e.orders.join('<br>')}<br>window ${e.width}</span>""",
    """<span class="ord">${e.occ.map((o) => o.order).join('<br>')}<br>window ${e.occ.map((o) => o.w).filter((w, i, a) => a.indexOf(w) === i).join(', ')}</span>""")
# band chart: no prefix engine
rep("  if (engine === 'prefix') return W - Math.max(...order.map((d) => Math.ceil(d / 2))) - Math.max(...order.map((d) => Math.floor(d / 2)));\n", "")
rep("""    : `${state.engine === 'shared' ? 'Shared center range' : 'Old prefix-slack'}: the band""", """    : `Shared center range: the band""")
io.open(out, 'w', encoding='utf-8', newline='\n').write(s)
print('ok', out)
